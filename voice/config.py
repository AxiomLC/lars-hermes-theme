"""config.py — Lars voice service settings. Single dial for test mode."""

import os

# ── Testing dial (user instruction 2026-09-28): 10 s everywhere while wiring.
# Set LARS_VOICE_TEST=0 to use production timings (60 s listening window etc.).
TEST_MODE = os.environ.get("LARS_VOICE_TEST", "1") != "0"
TURN_SILENCE_S = 2.0          # user silence that ends a turn -> Lars responds (mic keeps streaming)
HOT_MIC_IDLE_S = 10.0 if TEST_MODE else 60.0   # total inactivity -> hot mic OFF (mic icon re-arms)
ENDPOINT_SILENCE_S = 0.6      # VAD min_silence (keep < TURN_SILENCE_S or the 2s timer never starts)
BARGE_IN = True
BARGE_MIN_SPEECH_MS = 200     # sustained speech during SPEAKING before barge-in fires
HYBRID_STT = True             # whisper re-transcribe of the turn buffer before submit
WHISPER_URL = "http://127.0.0.1:9119/api/plugins/lars/transcribe"

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
STT_DIR = os.path.join(MODELS_DIR, "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile")
KWS_DIR = os.path.join(MODELS_DIR, "sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01")
KWS_KEYWORDS = os.path.join(MODELS_DIR, "hey_lars.txt")
VAD_MODEL = os.path.join(MODELS_DIR, "silero_vad.onnx")

# Per-boot WS token. For dev we pin it so the plugin page can be handed the same
# value via plugin storage. Production: plugin passes it on first connect via the
# bridge door — keep loopback-only Origin check regardless.
TOKEN = os.environ.get("LARS_VOICE_TOKEN", "lars-voice-dev-token")

# Agent bridge (dashboard ws, verified transport — see agent_bridge.py)
BRIDGE_WS_URL = "ws://127.0.0.1:9119/api/ws?token=lars-voice-bridge-2026"
PROFILE = "lars"

TTS_LANGUAGE = "english_2026-09"
TTS_VOICE = "alba"
TTS_SAMPLE_RATE = 24000
