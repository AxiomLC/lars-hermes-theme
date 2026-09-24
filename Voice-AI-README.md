Here is the complete architectural build document formatted as a standalone Markdown file. You can save this directly as `HERMES_VOICE_BUILD.md` in your repository root.

---

# Technical Build Specification: Hermes Local Voice Core (Windows 11 CPU / Intel i5)

## 1. System Context & Target Constraints

* **Hardware Target:** Lenovo17 (Intel Core i5-12500H, 16 GB RAM, Intel Iris Xe Integrated Graphics)
* **OS:** Windows 11 Home / Pro (x64)
* **Storage Budget:** Low availability (~8 GB remaining). Build strictly relies on lightweight ONNX weights and CPU-quantized PyTorch tensors. Zero CUDA wheel downloads (`--index-url [https://download.pytorch.org/whl/cpu](https://download.pytorch.org/whl/cpu)`).
* **Hermes Release:** Hermes Agent `v0.21.5`
* **Target Latency:** Total end-to-end voice loop $< 400\text{ ms}$ on 4 CPU performance threads.

---

## 2. Low-Resource Audio Architecture

```
[ Micro / Audio In ] 
         │
         ▼ (PCM 16kHz WebSocket / WebRTC)
[ Fast-VAD: Silero-VAD ONNX ] ── (Speech Start/End Triggers)
         │
         ▼
[ STT: Sherpa-ONNX (Zipformer / Moonshine-Tiny) ]
         │ (Streaming Text Tokens)
         ▼
[ Agent Loop: Hermes v0.21.5 ]
         │ (Text Response Stream)
         ▼
[ TTS: Kyutai Pocket-TTS (Mimi Codec / FlowLM CPU) ]
         │ (Streaming PCM Audio Chunks)
         ▼
[ Speaker / Audio Out ]

```

### Component Breakdown & Resource Footprint

| Subsystem | Model / Engine | Provider / Library | RAM Footprint | Disk Footprint |
| --- | --- | --- | --- | --- |
| **VAD** | Silero VAD v4 (ONNX) | `onnxruntime` | ~30 MB | ~2 MB |
| **STT** | Zipformer-En-20M / Moonshine-Tiny | `sherpa-onnx` | ~120 MB | ~60 MB |
| **Agent** | Hermes `v0.21.5` Core | Custom Hermes Engine | ~250 MB | Repository |
| **TTS** | Pocket-TTS (FlowLM 100M) | `pocket-tts` | ~350 MB | ~210 MB |

---

## 3. Environment Setup & Dependency Isolation

To prevent downloading CUDA dependencies (~3 GB) on Windows, force CPU wheel indices:

```powershell
# PowerShell setup
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Upgrade core package managers
python -m pip install --upgrade pip setuptools wheel

# Install PyTorch CPU explicit build first
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Install Engine Dependencies
pip install pocket-tts sherpa-onnx onnxruntime numpy fastapi uvicorn websockets sounddevice

```

---

## 4. Core Service Implementations

### A. Fast VAD & STT Ingestion (`stt_service.py`)

Uses `sherpa-onnx` for real-time streaming audio tokenization without GPU acceleration.

```python
import numpy as np
import sherpa_onnx
import asyncio

class LocalSTTEngine:
    def __init__(self, tokens_path: str, encoder_path: str, decoder_path: str, joiner_path: str):
        # Configure Sherpa-ONNX streaming recognizer
        recognizer_config = sherpa_onnx.OnlineRecognizerConfig(
            tokens=tokens_path,
            encoder=encoder_path,
            decoder=decoder_path,
            joiner=joiner_path,
            num_threads=2,
            decoding_method="greedy_search",
            provider="cpu"
        )
        self.recognizer = sherpa_onnx.CreateOnlineRecognizer(recognizer_config)
        self.stream = self.recognizer.create_stream()

    def process_pcm_chunk(self, chunk: bytes) -> str:
        # Convert raw PCM int16 to float32
        samples = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32768.0
        self.stream.accept_waveform(16000, samples)
        
        while self.recognizer.is_ready(self.stream):
            self.recognizer.decode_stream(self.stream)
            
        return self.recognizer.get_result(self.stream).text

    def reset(self):
        self.recognizer.reset(self.stream)

```

### B. High-Speed Low-Latency TTS (`tts_service.py`)

Utilizes Kyutai's `pocket-tts` API for low-step flow matching.

```python
import torch
import scipy.io.wavfile
from pocket_tts import TTSModel
import io

class FastTTSEngine:
    def __init__(self, voice_prompt: str = "alba"):
        # Limit PyTorch CPU thread contention on 12500H E-cores
        torch.set_num_threads(2)
        self.model = TTSModel.load_model()
        # Pre-cache voice state to skip runtime latent calculation
        self.voice_state = self.model.get_state_for_audio_prompt(voice_prompt)

    def synthesize_stream(self, text: str):
        """Generates audio stream chunks yielding float32 PCM frames"""
        # pocket-tts generate_audio returns 1D PCM PyTorch Tensor
        audio_tensor = self.model.generate_audio(self.voice_state, text)
        pcm_data = audio_tensor.numpy()
        return self.model.sample_rate, pcm_data

    def export_voice_preset(self, audio_path: str, save_path: str):
        from pocket_tts import export_model_state
        state = self.model.get_state_for_audio_prompt(audio_path)
        export_model_state(state, save_path)

```

### C. Hermes Voice Orchestrator API (`voice_server.py`)

Integrates STT, Hermes Agent processing, and streaming audio back through a FastAPI WebSocket pipeline.

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import asyncio
from stt_service import LocalSTTEngine
from tts_service import FastTTSEngine

app = FastAPI(title="Hermes Voice Local Core")

# Initialize Local Models
stt = LocalSTTEngine(
    tokens="./models/tokens.txt",
    encoder="./models/encoder.onnx",
    decoder="./models/decoder.onnx",
    joiner="./models/joiner.onnx"
)
tts = FastTTSEngine(voice_prompt="alba")

@app.websocket("/ws/voice")
async def voice_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Hermes local voice socket client connected.")
    
    try:
        while True:
            # Receive raw PCM bytes from frontend/micro
            data = await websocket.receive_bytes()
            
            # 1. Process STT
            transcription = stt.process_pcm_chunk(data)
            
            if transcription.strip():
                print(f"User: {transcription}")
                
                # 2. Forward to Hermes Engine v0.21.5
                # (Simulated agent query return)
                agent_reply = f"Hermes processing: {transcription}" 
                
                # 3. Synthesize Speech Output
                sample_rate, pcm_data = tts.synthesize_stream(agent_reply)
                
                # 4. Stream response back
                await websocket.send_bytes(pcm_data.tobytes())
                stt.reset()
                
    except WebSocketDisconnect:
        print("Voice client disconnected.")

```

---

## 5. Execution Routine & Hardware Optimization

Run the execution steps from PowerShell:

```powershell
# 1. Thread Pinning for Intel Hybrid Architecture (i5-12500H)
# Assign higher priority to Performance Cores
$env:OMP_NUM_THREADS="4"
$env:MKL_NUM_THREADS="4"

# 2. Launch Local Engine
uvicorn voice_server:app --host 127.0.0.1 --port 8000 --workers 1

```

This client-side implementation handles raw continuous audio recording, real-time chunk streaming over WebSocket, visual audio metering, and playback for synthesized responses.

It uses standard Web APIs (`MediaRecorder`, `AudioContext`, and `WebSocket`) with no external dependencies.

---

### `index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Voice Pipeline Client</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --accent: #3b82f6;
      --danger: #ef4444;
      --text: #f8fafc;
      --text-dim: #94a3b8;
    }

    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
    }

    .container {
      background: var(--card);
      padding: 2rem;
      border-radius: 12px;
      width: 100%;
      max-width: 480px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }

    h2 { margin-top: 0; font-weight: 600; }

    .status-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: var(--text-dim);
      margin-bottom: 1.5rem;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #64748b;
    }
    .dot.connected { background: #22c55e; }
    .dot.recording { background: var(--danger); animation: pulse 1s infinite; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .controls {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    button {
      flex: 1;
      padding: 0.75rem;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
    }
    button:active { transform: scale(0.98); }

    #btn-record { background: var(--accent); color: white; }
    #btn-record.recording { background: var(--danger); }
    #btn-record:disabled { opacity: 0.5; cursor: not-allowed; }

    .meter-container {
      height: 8px;
      background: #334155;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 1.5rem;
    }

    .meter-bar {
      height: 100%;
      width: 0%;
      background: #22c55e;
      transition: width 0.05s ease-out;
    }

    .log-box {
      background: #090d16;
      border-radius: 6px;
      padding: 0.75rem;
      height: 160px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 0.8rem;
      color: var(--text-dim);
    }

    .log-entry { margin-bottom: 0.25rem; }
    .log-entry.in { color: #38bdf8; }
    .log-entry.out { color: #a7f3d0; }
    .log-entry.err { color: #f87171; }
  </style>
</head>
<body>

<div class="container">
  <h2>Voice Agent</h2>
  
  <div class="status-bar">
    <div id="status-dot" class="dot"></div>
    <span id="status-text">Disconnected</span>
  </div>

  <div class="meter-container">
    <div id="meter" class="meter-bar"></div>
  </div>

  <div class="controls">
    <button id="btn-record" disabled>Start Talking</button>
  </div>

  <div id="log" class="log-box"></div>
</div>

<script src="app.js"></script>
</body>
</html>

```

---

### `app.js`

```javascript
class AudioCaptureClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.analyser = null;
    this.animFrameId = null;
    this.isRecording = false;

    // DOM Elements
    this.btnRecord = document.getElementById('btn-record');
    this.statusDot = document.getElementById('status-dot');
    this.statusText = document.getElementById('status-text');
    this.meterBar = document.getElementById('meter');
    this.logContainer = document.getElementById('log');

    this.initWebSocket();
    this.bindEvents();
  }

  log(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `log-entry ${type}`;
    el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    this.logContainer.appendChild(el);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }

  initWebSocket() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.statusDot.className = 'dot connected';
      this.statusText.textContent = 'Connected';
      this.btnRecord.disabled = false;
      this.log('WebSocket connection opened');
    };

    this.ws.onclose = () => {
      this.statusDot.className = 'dot';
      this.statusText.textContent = 'Disconnected';
      this.btnRecord.disabled = true;
      this.log('WebSocket connection closed', 'err');
      // Attempt reconnect after 3 seconds
      setTimeout(() => this.initWebSocket(), 3000);
    };

    this.ws.onerror = (err) => {
      this.log('WebSocket error occurred', 'err');
    };

    this.ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const payload = JSON.parse(event.data);
        this.log(`Server JSON: ${JSON.stringify(payload)}`, 'in');
      } else if (event.data instanceof ArrayBuffer) {
        this.log(`Received Audio Chunk (${event.data.byteLength} bytes)`, 'in');
        await this.playAudioChunk(event.data);
      }
    };
  }

  bindEvents() {
    this.btnRecord.addEventListener('click', () => {
      if (this.isRecording) {
        this.stopRecording();
      } else {
        this.startRecording();
      }
    });
  }

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000, // Matches standard STT model input expectations
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Setup Web Audio API for visual meter
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);
      this.drawMeter();

      // Setup MediaRecorder
      // Priority mimeTypes: audio/webm;codecs=opus -> audio/ogg -> fallback
      let options = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' };
      }

      this.mediaRecorder = new MediaRecorder(stream, options);

      // Stream binary PCM/Opus chunks every 100ms
      this.mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && this.ws.readyState === WebSocket.OPEN) {
          const buffer = await e.data.arrayBuffer();
          this.ws.send(buffer);
          this.log(`Sent audio chunk (${buffer.byteLength} bytes)`, 'out');
        }
      };

      this.mediaRecorder.start(100); // Timeslice: flush audio buffer every 100ms

      this.isRecording = true;
      this.btnRecord.textContent = 'Stop Talking';
      this.btnRecord.className = 'recording';
      this.statusDot.className = 'dot recording';
      this.statusText.textContent = 'Streaming Audio...';
      this.log('Mic recording started');

    } catch (err) {
      this.log(`Microphone Access Error: ${err.message}`, 'err');
    }
  }

  stopRecording() {
    if (!this.mediaRecorder) return;

    this.mediaRecorder.stop();
    this.mediaRecorder.stream.getTracks().forEach(track => track.stop());

    if (this.audioContext) {
      this.audioContext.close();
    }

    cancelAnimationFrame(this.animFrameId);
    this.meterBar.style.width = '0%';

    this.isRecording = false;
    this.btnRecord.textContent = 'Start Talking';
    this.btnRecord.className = '';
    this.statusDot.className = 'dot connected';
    this.statusText.textContent = 'Connected';
    this.log('Mic recording stopped');

    // Send stop signal metadata frame
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event: 'EOS' })); // End of Stream
    }
  }

  drawMeter() {
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const update = () => {
      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      const percentage = Math.min(100, Math.round((average / 128) * 100));
      this.meterBar.style.width = `${percentage}%`;

      if (this.isRecording) {
        this.animFrameId = requestAnimationFrame(update);
      }
    };
    update();
  }

  async playAudioChunk(arrayBuffer) {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    try {
      // Decodes audio data (e.g. WAV or raw PCM depending on server response structure)
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start(0);
    } catch (err) {
      this.log('Error decoding server audio chunk', 'err');
    }
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Update port or endpoint matching backend engine
  window.client = new AudioCaptureClient('ws://localhost:8000/ws/audio');
});

```

---

### Core Execution Flow

1. **Connection Setup:** Initializes a persistent binary WebSocket connection to `ws://localhost:8000/ws/audio`.
2. **Microphone Access:** Requests input access at $16\text{ kHz}$ mono with echo cancellation and noise suppression enabled.
3. **Chunk Streaming:** Captures chunks via `MediaRecorder` every $100\text{ ms}$ and immediately emits raw `ArrayBuffer` payloads over the WebSocket pipe.
4. **Volume Meter:** Utilizes `AnalyserNode` to drive an HTML5 progress bar matching voice activity.
5. **Inbound Processing:** Handles inbound JSON control strings or binary PCM/WAV buffers via `AudioContext.decodeAudioData()` for direct browser output.
