# Voice-AI-README.md — Lars Voice Module (rev. 2)

**Branch:** machine-2 · **Status:** agreed design, supersedes rev. 1
**Build doc:** Hermes Local Voice Core — Windows 11, CPU-only, plugin-page voice for the Div 7 orb.

---

## 1. Constraint (why this stack exists)

The Hermes desktop plugin page **cannot access core Hermes STT, TTS, or mic** — the plugin
sandbox resolves only `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`; there is no audio
door in the SDK. The "native voice" in the desktop app belongs to the core chat UI, not to a
custom page. Therefore the voice edge is fully local and self-hosted; the *agent* is real Hermes.

```
[ Div 7 plugin page ]  JarvisMic (React) + AudioWorklet capture + AudioContext playback
        │  ws://127.0.0.1:8000/ws/voice   (Origin-checked, per-boot token)
[ LOCAL VOICE SERVICE ]  FastAPI :8000, own venv, CPU-only
        │  agent_bridge → REAL Lars session (same one SESSIONS shows)
[ Hermes gateway → Lars profile ]   ← chat state + memory live here
```

Audio flow is **page → service → Lars → service → page**. The page owns the mic; the service
owns models.

---

## 2. State machine (the whole UX)

```
HOT_MIC   ──"Hey Lars" wake OR mic button──▶ LISTENING
LISTENING ──speech detected──▶ CAPTURING ──600 ms silence──▶ PROCESSING ──first sentence──▶ SPEAKING
SPEAKING/PROCESSING ──user speech──▶ CAPTURING      (barge-in: flush queue, cancel TTS + agent)
SPEAKING  ──reply done──▶ LISTENING                  (re-arm 60 s — continuous conversation)
LISTENING ──60 s no clear speech──▶ HOT_MIC          (drops back, never dead-ends)
```

- **HOT_MIC** — page keeps mic open and streams; service runs wake-word spotting on the stream.
- **LISTENING** — entered on wake or button; user has **60 s** to produce clear speech.
  The 60 s gates *getting* the turn, never the conversation once it starts.
- **Barge-in** — the moment the user speaks during SPEAKING/PROCESSING, playback queue is
  flushed, TTS synthesis is cancelled, the agent stream is interrupted, and the turn restarts.
- **Conversation** — after a reply the loop returns to LISTENING (60 s re-armed). HOT_MIC is
  only reached after a full minute of silence, or on error/timeout.

---

## 3. Capture & playback (the two things rev. 1 got wrong)

### 3a. Capture — AudioWorklet, raw Int16 PCM @ 16 kHz. NOT MediaRecorder.

Rev. 1 used `MediaRecorder` (webm/opus, 100 ms slices). **Wrong:** wake word, VAD and STT all
need raw 16 kHz PCM; only the first WebM chunk carries the container header, so later slices
cannot be decoded independently.

Use an **AudioWorklet** in the page: `getUserMedia({audio: {channelCount:1, sampleRate:16000,
echoCancellation:true, noiseSuppression:true, autoGainControl:true}})` → `AudioContext` →
`AudioWorkletNode` → processor posts `Int16` PCM frames to the main thread → WS binary frames.
Plain Web API, fits the plugin import restrictions, no decoding anywhere. The page captures
**always** (including HOT_MIC — the service runs wake-word on the stream) so the browser's
echo cancellation stays in the loop and Lars never hears himself.

Mic lifecycle: on route-leave (navigate to SESSIONS etc.) the page **stops tracks and pauses
the stream**; on return it re-acquires and resumes. Prevents two consumers of the mic.

### 3b. Playback — manual buffers, back-to-back scheduling, kept refs.

Do **not** `decodeAudioData` raw PCM chunks. The page builds `AudioBuffer`s itself, schedules
them back-to-back (`onended` chain), and keeps references to every scheduled source so
barge-in can stop them all at once. `audio_format` frame (below) carries the TTS sample rate.

---

## 4. WebSocket protocol (`ws://127.0.0.1:8000/ws/voice`)

**Out (page → service):**

| Frame | Payload |
|---|---|
| `{"event":"hello","token":"<per-boot>"}` | open WS, auth |
| `{"event":"audio_format","rate":16000}` | declare capture format (once) |
| `{"event":"listen"}` | mic button = enter LISTENING |
| `{"event":"wake"}` | client-side wake trigger (if any) |
| binary | Int16 PCM chunk (16 kHz mono, ~100 ms) |
| `{"event":"interrupt"}` | barge-in signal (also sent on user speech) |
| `{"event":"eos"}` | user released the button / end of turn |

**In (service → page):**

| Frame | Payload |
|---|---|
| `{"event":"hello_ok"}` | handshake accepted |
| `{"event":"audio_format","rate":24000}` | TTS sample rate for playback |
| `{"event":"state","state":"listening"}` | orb glows, 60 s timer starts |
| `{"event":"text","role":"user"}` | live STT transcript |
| `{"event":"text","role":"lars"}` | Lars' reply text (streaming) |
| binary | TTS PCM chunk → scheduled playback |
| `{"event":"interrupted"}` | barge-in acknowledged, queue flushed |
| `{"event":"done"}` | reply complete → LISTENING (re-arm) |
| `{"event":"timeout"}` | 60 s no speech → HOT_MIC |
| `{"event":"error","msg":…}` | any failure → HOT_MIC |

---

## 5. Local Voice Service (:8000, own venv, CPU wheels only)

```
voice_server.py   — FastAPI app, WS endpoint, state machine, Origin + token auth
wake_engine.py    — sherpa-onnx keyword spotter, custom keyword "hey lars" (no training)
stt_service.py    — sherpa-onnx streaming recognizer (Zipformer-En-20M, greedy, CPU)
vad.py            — sherpa-onnx endpointing (covers the 600 ms silence rule)
tts_service.py    — streaming TTS, sentence-level synthesis
agent_bridge.py   — text → REAL Lars session → streamed reply tokens
```

```powershell
python -m venv .venv && .\.venv\Scripts\Activate.ps1
pip install --upgrade pip setuptools wheel
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install sherpa-onnx onnxruntime numpy fastapi uvicorn websockets
# TTS engine per §6 — pocket-tts (verify streaming) or chosen local engine
```

Run: `uvicorn voice_server:app --host 127.0.0.1 --port 8000 --workers 1`
(Env a hint of scale only — **no latency numbers claimed, measure after wiring**.)

```python
# voice_server.py — skeleton (state machine + auth shape)
import secrets
from fastapi import FastAPI, WebSocket, Header

app = FastAPI(title="Lars Voice Local Core")
TOKEN = secrets.token_hex(16)  # per-boot; delivered to the page via the plugin

async def require_auth(websocket: WebSocket, token: str) -> bool:
    origin = websocket.headers.get("origin", "")
    if not origin.startswith(("http://127.0.0.1", "http://localhost")):
        await websocket.close(code=4403)
        return False
    if token != TOKEN:
        await websocket.close(code=4401)
        return False
    return True

@app.websocket("/ws/voice")
async def voice_endpoint(websocket: WebSocket, x_token: str = Header(default="")):
    await websocket.accept()
    if not await require_auth(websocket, x_token):
        return
    # state machine: HOT_MIC → LISTENING → CAPTURING → PROCESSING → SPEAKING → LISTENING…
```

**Security (non-negotiable):** any web page in the user's browser can reach `127.0.0.1:8000`.
The Lars backend carries a terminal + command allowlist — a malicious page could feed it
instructions. Checks: **Origin** on WS upgrade (loopback only) + **per-boot token** handed to
the page by the plugin (not stored in the page bundle).

---

## 6. TTS — streaming, per sentence, fully local

- Synthesize **per sentence**, not per token (chunking = lower latency-to-first-audio, no
  syllable-level stutter).
- **Drop Edge TTS** (cloud — contradicts fully-local; rev. 1's fallback choice is out).
- **CHECKPOINT:** verify before committing — does `pocket-tts` stream natively (chunked
  generation with incremental PCM), or must we synthesize per sentence and flush? If it
  does not stream, evaluate alternative CPU streaming engines.

---

## 7. Agent bridge — the seam to pin FIRST

Sentence-by-sentence speech requires the bridge to receive **reply tokens as they arrive**,
not a fully-formed reply.

**CHECKPOINTS (verify on the target machine before building):**
1. `config.yaml` has `streaming: enabled: false` — determine exactly what it gates (chat
   token streaming to the plugin/gateway RPC? session capture?) and whether the bridge needs
   it on.
2. Bridge transport: candidate doors — **:9119 dashboard API** (stable, remote-access,
   unauthenticated API; CORS to verify) vs **gateway JSON-RPC via a pinned route** (desktop
   backend port is random-per-boot — must be discovered, not assumed).
3. Crash log shows the gateway restarting periodically → the bridge must **reconnect
   cleanly** (backoff + session re-attach), never half-open.

The bridge must write into the **same persistent Lars session** the SESSIONS window shows —
that single-session identity is what makes "nav away and back, state intact" free.

---

## 8. Verified vs to-verify (honest ledger)

**Known-good (do not re-litigate):** constraint (no in-page STT/TTS/mic), AudioWorklet Int16
capture, manual-buffer playback + interrupt refs, page owns mic, sherpa keyword-spotting for
"hey lars" (custom keyword, no training — verify exact API at build), sherpa endpointing for
the 600 ms silence rule, Origin + token on the WS, per-sentence local TTS, state machine with
barge-in + conversation loop, single persistent session through the bridge.

**Checkpoints (verify on the target machine):** Pocket-TTS native streaming; `streaming:
enabled: false` semantics; bridge transport (:9119 CORS / gateway RPC route); gateway restart
cadence vs bridge reconnect; exact sherpa KWS API; latency measured end-to-end after wiring.

---

## 9. Div 7 page integration

- Orb idle = HOT_MIC (streaming, wake armed). Glow = LISTENING. Waveform = CAPTURING or
  SPEAKING. Red flash + "interrupted" = barge-in.
- Live transcripts render in the orb panel (user + Lars).
- **"Open in Sessions"** button → `host.openSession` → core chat UI with native voice, same
  conversation, state intact. Mic pauses while away; resumes on return.
- Div page stays the surface for the voice loop; Sessions is the optional power view.
