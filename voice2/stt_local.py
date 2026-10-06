# stt_local.py — tiny local STT endpoint for the Lars voice module.
# Single job: accept a WAV upload, transcribe it with faster-whisper (CPU,
# model 'base'), return JSON text.
# Flask dev server (no dependency on the gateway). Binds 127.0.0.1 only —
# intentionally NO auth token (loopback-only, nothing to protect).
# Voice-loop diagnostics go to Hermes' voice-events.log via the gateway-mounted
# plugin_api (/voice-log), NOT here.
#
# Tweaks (env):
#   STT_MODEL   = faster-whisper model name (default: base)   # base <- tiny/small swappable
#   STT_DEVICE  = cpu (default) | auto (cuda if present)
#   STT_COMPUTE = int8 on cpu, auto otherwise
#   STT_PORT    = default 8107
import io
import os
import wave

# load sibling .env (start.bat launches detached, so shell env is empty)
try:
    _envpath = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    for _line in open(_envpath, encoding="utf-8"):
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())
except Exception:
    pass

from flask import Flask, jsonify, request

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 12 * 1024 * 1024  # 12 MB WAV cap (~2.5 min at 16k mono s16)

# ---- model (lazy load: first request warms it, afterwards it's cached in-process) ----
_model = None            # primary engine tuple ("moonshine"|"whisper", engine, tok)
_fallback_model = None   # whisper tuple, lazy-loaded only if the primary fails
_ENGINE = os.environ.get("STT_ENGINE", "moonshine")     # moonshine | whisper
_MODEL_MS_NAME = os.environ.get("STT_MOONSHINE_MODEL", "base")  # tiny | base | small? (moonshine)
_MODEL_NAME = os.environ.get("STT_MODEL", "base")            # whisper model (fallback engine)
_DEVICE = os.environ.get("STT_DEVICE", "cpu")
_COMPUTE = os.environ.get("STT_COMPUTE", "int8" if _DEVICE == "cpu" else "auto")

def get_model():
    global _model
    if _model is None:
        if _ENGINE == "moonshine":
            from moonshine_onnx import MoonshineOnnxModel, load_tokenizer
            tok = load_tokenizer()
            md = MoonshineOnnxModel(model_name=_MODEL_MS_NAME)
            _model = ("moonshine", md, tok)
        else:
            from faster_whisper import WhisperModel
            _model = ("whisper", WhisperModel(_MODEL_NAME, device=_DEVICE, compute_type=_COMPUTE), None)
    return _model

# ---- moonshine transcription (returns same shape as whisper path) ----
def _transcribe_engine(model_tuple, arr):
    kind, eng, tok = model_tuple
    if kind == "moonshine":
        import numpy as np
        ids = eng.generate(arr[np.newaxis, :])
        return tok.decode(ids[0], skip_special_tokens=True).strip(), "en"
    segments, info = eng.transcribe(
        arr, language="en", beam_size=1, vad_filter=False,
        condition_on_previous_text=False,
    )
    return " ".join(s.text for s in segments).strip(), info.language

def _whisper_fallback():
    global _fallback_model
    if _fallback_model is None:
        from faster_whisper import WhisperModel
        _fallback_model = ("whisper", WhisperModel(_MODEL_NAME, device=_DEVICE, compute_type=_COMPUTE), None)
        appendLog(f"--- whisper fallback loaded (primary {_ENGINE} failed once) ---\n")
    return _fallback_model

# ---- logging: self-pruning append; when a file passes the cap, keep the tail ----
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs", "stt-local.log")
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
MAX_LOG_BYTES = 300_000

def appendLog(text):
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(text)
    try:
        if os.path.getsize(LOG_FILE) > MAX_LOG_BYTES:
            with open(LOG_FILE, "rb") as f:
                buf = f.read()
            tail = buf[len(buf) // 2:]
            cut = tail.find(b"\n")
            with open(LOG_FILE, "wb") as f:
                f.write(tail[cut + 1:] if cut >= 0 else tail)
    except Exception:
        pass

def authorized():
    return True  # loopback-only bind; token auth removed (belt-and-suspenders relic)

@app.after_request
def _no_cache(resp):
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    return resp

@app.get("/health")
def health():
    name = _MODEL_MS_NAME if _ENGINE == "moonshine" else _MODEL_NAME
    return jsonify(ok=True, engine=_ENGINE, model=name, device=_DEVICE)

@app.post("/transcribe")
def transcribe():
    if not authorized():
        return jsonify(error="bad token"), 401
    # accept multipart (field 'audio') or raw body with ?mime=audio/wav
    data = None
    if request.files:
        up = request.files.get("audio") or next(iter(request.files.values()))
        data = up.read()
    else:
        data = request.get_data()
    if not data:
        return jsonify(error="no audio data"), 400
    # decode WAV to a temp int16 PCM buffer faster-whisper can read
    try:
        import numpy as np
        with wave.open(io.BytesIO(data), "rb") as w:
            rate = w.getframerate()
            frames = w.getnframes()
            if frames == 0:
                return jsonify(error="empty wav"), 400
            if w.getnchannels() > 1:
                # downmix to mono: take every n-th (skip averaging — fine for speech)
                pcm = np.frombuffer(w.readframes(frames), dtype=np.int16)
                pcm = pcm[:: w.getnchannels()]
            else:
                pcm = np.frombuffer(w.readframes(frames), dtype=np.int16)
        arr = pcm.astype("float32") / 32768.0
    except Exception as e:
        appendLog(f"{__import__('datetime').datetime.now().isoformat()} [err] wav decode: {e}\n")
        return jsonify(error=f"wav decode failed: {e}"), 400

    import time
    t0 = time.time()
    try:
        try:
            text, lang = _transcribe_engine(get_model(), arr)
            used = _ENGINE
        except Exception as primary_err:
            if _ENGINE == "whisper":
                raise
            appendLog(f"{__import__('datetime').datetime.now().isoformat()} [warn] {_ENGINE} failed: {str(primary_err)[:160]} — falling back to whisper\n")
            text, lang = _transcribe_engine(_whisper_fallback(), arr)
            used = "whisper"
    except Exception as e:
        appendLog(f"{__import__('datetime').datetime.now().isoformat()} [err] transcribe: {e}\n")
        return jsonify(error=f"transcribe failed: {e}"), 500
    ms = int((time.time() - t0) * 1000)
    appendLog(f"{__import__('datetime').datetime.now().isoformat()} [ok] {used} {ms}ms audio={frames/rate:.2f}s len={len(text)} text={text[:120]}\n")
    return jsonify(text=text, language=lang)

if __name__ == "__main__":
    port = int(os.environ.get("STT_PORT", "8107"))
    appendLog(f"--- stt_local starting port={port} engine={_ENGINE}({ _MODEL_MS_NAME if _ENGINE=='moonshine' else _MODEL_NAME}) ---\n")
    print(f"stt_local: {_ENGINE} '{_MODEL_MS_NAME if _ENGINE=='moonshine' else _MODEL_NAME}' on {port}")
    app.run(host="127.0.0.1", port=port, threaded=True)
