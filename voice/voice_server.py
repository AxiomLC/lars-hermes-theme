"""voice_server.py — Lars Voice Local Core (spec Voice-AI-README rev 2).

Run:  <voice>/.venv/Scripts/python.exe voice_server.py
      (127.0.0.1:8000 only)

State machine (§2): HOT_MIC → LISTENING → CAPTURING → PROCESSING → SPEAKING
  + barge-in back to CAPTURING, 60 s (test: 10 s) listen window → HOT_MIC.
"""

import asyncio
import contextlib
import json
import logging
import os
import threading
import time

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

import agent_bridge
import config
from stt_service import STT
from tts_service import TTS
from vad import VAD
from wake_engine import Wake

log = logging.getLogger("lars.voice")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s: %(message)s",
                    handlers=[logging.StreamHandler(),
                              logging.FileHandler(os.path.join(os.path.dirname(__file__), "voice_server.log"), encoding="utf-8")])

app = FastAPI(title="Lars Voice Local Core")

# Global engines — single user, one connection at a time (single mic).
_stt: STT | None = None
_tts: TTS | None = None
_wake: Wake | None = None


@app.on_event("startup")
async def _startup():
    global _stt, _tts, _wake
    t0 = time.time()
    _stt = STT()
    _wake = Wake()
    _tts = TTS()
    _tts.warmup()
    log.info("engines loaded in %.1fs (tts warmup incl.)", time.time() - t0)


def _origin_ok(ws: WebSocket) -> bool:
    o = ws.headers.get("origin", "")
    # Loopback http(s) + the desktop app's plugin-page origins (file://, app://,
    # or no Origin at all). Token check still guards every connection.
    ok = (o == "" or o.startswith(("http://127.0.0.1", "http://localhost",
                                   "https://127.0.0.1", "https://localhost",
                                   "file://", "app://", "null")))
    if not ok:
        log.warning("rejected origin: %r", o)
    return ok


def _token_ok(ws: WebSocket, token: str) -> bool:
    return token == config.TOKEN


def _send(ws, obj: dict):
    # ws._lars_loop is captured at endpoint connect (Starlette WS has no .loop)
    loop = getattr(ws, "_lars_loop", None) or asyncio.get_event_loop()
    asyncio.run_coroutine_threadsafe(ws.send_text(json.dumps(obj)), loop)


class Turn:
    """One LISTEN→SPEAK turn; owns capture buffers + VAD + STT + barge-in."""

    def __init__(self, ws, session, rate=16000):
        self.ws = ws
        self.session = session
        self.rate = rate            # capture rate as declared by the page
        self.vad = VAD()
        self.stt_stream = _stt.new_stream()
        self.buf = []            # float32 PCM chunks captured (16k)
        self.fed = 0             # samples already fed to STT (feed only NEW audio)
        self.speaking = False
        self.tts_stop = threading.Event()
        self.finishing = False
        self.gen = 0                # turn generation — stale finish tasks check it
        self.finish_task = None
        self.heard_speech = False
        self.silence = 0            # trailing silence samples (16k)
        self.speech_run = 0         # sustained speech samples while SPEAKING (barge gate)
        self.last_activity = time.time()  # last VAD-positive frame (idle timer)
        self.prering = []           # recent pre-barge audio (seed on barge_in)
        self.prering_n = 0

    def reset(self):
        """Back to LISTENING with a clean turn state (mic keeps streaming)."""
        self.gen += 1
        self.vad = VAD()
        self.stt_stream = _stt.new_stream()
        self.buf = []
        self.fed = 0
        self.speaking = False
        self.tts_stop.clear()
        self.finishing = False
        self.heard_speech = False
        self.silence = 0
        self.speech_run = 0
        self.prering = []
        self.prering_n = 0
        self.last_activity = time.time()

    def _resample(self, pcm_i16: np.ndarray) -> np.ndarray:
        pcm = pcm_i16.astype(np.float32) / 32768.0
        if self.rate == 16000 or len(pcm) == 0:
            return pcm
        # linear resample capture rate → 16 kHz (desktop AudioContexts ignore
        # the 16k getUserMedia constraint and hand us 44.1/48 kHz)
        n_out = int(round(len(pcm) * 16000 / self.rate))
        if n_out < 1:
            return np.zeros(0, np.float32)
        return np.interp(
            np.linspace(0.0, len(pcm) - 1, n_out),
            np.arange(len(pcm)), pcm).astype(np.float32)

    async def feed(self, pcm_i16):
        """Audio chunk from the page (int16, capture rate mono)."""
        pcm = self._resample(pcm_i16)
        if len(pcm) == 0:
            return
        # DEBUG: peak/RMS of every ~1s of incoming audio
        rms = float(np.sqrt(np.mean(pcm ** 2)) + 1e-12)
        self.dbg_peak = max(getattr(self, "dbg_peak", 0.0), float(np.max(np.abs(pcm))))
        self.dbg_n = getattr(self, "dbg_n", 0) + len(pcm)
        self.dbg_raw = getattr(self, "dbg_raw", None)
        if self.dbg_raw is None:
            self.dbg_raw = pcm_i16
        elif len(self.dbg_raw) < 16000 * 20:
            self.dbg_raw = np.concatenate([self.dbg_raw, pcm_i16])
        if self.dbg_n >= 16000:
            log.info("mic: rms=%.4f peak=%.4f rate=%s", rms, self.dbg_peak, self.rate)
            self.dbg_n = 0
            self.dbg_peak = 0.0
        speech = self.vad.is_speech(pcm)
        if speech:
            self.last_activity = time.time()

        # keep a rolling ~1 s of recent audio for pre-barge seeding
        self.prering.append(pcm)
        self.prering_n += len(pcm)
        while self.prering_n > 16000 and self.prering:
            self.prering_n -= len(self.prering[0])
            self.prering.pop(0)

        if self.speaking:
            # barge gate: sustained speech (echo guard) while Lars talks
            if speech:
                self.speech_run += len(pcm)
            else:
                self.speech_run = 0
            if self.speech_run >= 16 * config.BARGE_MIN_SPEECH_MS and config.BARGE_IN:
                await self.barge_in()
            return  # while Lars talks, only barge-in matters

        if speech:
            self.heard_speech = True
            self.silence = 0
            self.finish_task = None  # speech resumed — any scheduled finish is moot
        else:
            self.silence += len(pcm)

        self.buf.append(pcm)
        audio = np.concatenate(self.buf)
        # live partial transcript every ~300 ms of NEW audio
        if len(audio) - self.fed >= 4800:
            _stt.feed(self.stt_stream, audio[self.fed:])
            self.fed = len(audio)
            partial = _stt.partial(self.stt_stream)
            if partial:
                _send(self.ws, {"event": "text", "role": "user", "text": partial})

        # TURN_SILENCE_S (2.0 s) of trailing silence after speech ends the turn.
        # Mic keeps streaming — this only decides when Lars jumps in.
        if (self.heard_speech and not self.finishing
                and self.silence >= 16000 * config.TURN_SILENCE_S):
            self.finishing = True
            gen = self.gen
            self.finish_task = asyncio.get_event_loop().create_task(self.finish(gen))

    async def finish(self, gen=None):
        if self.finishing and gen is None:
            return
        if gen is not None:
            if self.finishing and getattr(self, "_finish_gen", None) != gen:
                return
            self._finish_gen = gen
        self.finishing = True
        try:
            if gen is not None and gen != self.gen:
                return  # stale finish (barge-in/reset happened meanwhile)
            audio = np.concatenate(self.buf) if self.buf else np.zeros(0, np.float32)
            self.buf = []
            if len(audio) < 16000 * 0.3 or not self.heard_speech:
                self.heard_speech = False
                self.silence = 0
                self.finishing = False
                return
            text = _stt.finalize(self.stt_stream)
            log.info("user said (zipformer): %r", text)
            if config.HYBRID_STT:
                wtext = await self._whisper(audio)
                if wtext:
                    log.info("user said (whisper): %r", wtext)
                    text = wtext
            text = (text or "").strip()
            if not text:
                # DEBUG: dump what we heard so it can be analyzed offline
                raw = getattr(self, "dbg_raw", None)
                if raw is not None and len(raw) > 1600:
                    try:
                        import wave as _w
                        with _w.open(os.path.join(os.path.dirname(__file__), "debug_last.wav"), "wb") as f:
                            f.setnchannels(1); f.setsampwidth(2); f.setframerate(self.rate)
                            f.writeframes(raw[:16000 * 20].astype(np.int16).tobytes())
                        log.info("dumped debug_last.wav (%s samples @ %s Hz, peak %.4f)",
                                 len(raw), self.rate, getattr(self, "dbg_peak_all", 0) or 0)
                    except Exception:
                        log.exception("debug dump failed")
                _send(self.ws, {"event": "state", "state": "listening"})
                self.reset()
                return
            _send(self.ws, {"event": "state", "state": "processing"})
            _send(self.ws, {"event": "text", "role": "user", "text": text})
            await self.run_agent(text)
        except Exception:
            log.exception("turn failed")
            with contextlib.suppress(Exception):
                _send(self.ws, {"event": "error", "msg": "turn failed"})
        finally:
            self.finishing = False

    async def _whisper(self, audio_f32) -> str:
        """HYBRID STT: re-transcribe the full 16k turn buffer with faster-whisper
        (plugin_api /transcribe on :9119). 2.5 s budget — never fails the turn."""
        try:
            import base64
            import urllib.request
            pcm16 = (np.clip(audio_f32, -1, 1) * 32767).astype(np.int16).tobytes()
            body = json.dumps({"pcm": base64.b64encode(pcm16).decode(),
                               "rate": 16000}).encode()
            req = urllib.request.Request(config.WHISPER_URL, data=body,
                                         headers={"Content-Type": "application/json"})
            tok = os.environ.get("HERMES_DASHBOARD_SESSION_TOKEN", "")
            if not tok:
                try:  # voice server may be launched detached with a stale env —
                    import winreg  # the USER env var is the fresh session token
                    tok = winreg.QueryValueEx(winreg.OpenKey(
                        winreg.HKEY_CURRENT_USER, "Environment"),
                        "HERMES_DASHBOARD_SESSION_TOKEN")[0]
                except Exception:
                    tok = ""
            if tok:
                req.add_header("X-Hermes-Session-Token", tok)

            def call():
                with urllib.request.urlopen(req, timeout=2.5) as r:
                    return json.loads(r.read().decode()).get("text", "")

            return ((await asyncio.to_thread(call)) or "").strip()
        except Exception as e:
            log.info("whisper hybrid unavailable (%s) — using zipformer text", e)
            return ""

    async def run_agent(self, text: str):
        """Bridge → deltas → sentence-chunked TTS → PCM out."""
        loop = asyncio.get_event_loop()
        q: asyncio.Queue = asyncio.Queue()

        def pump():
            def on_delta(d):
                loop.call_soon_threadsafe(q.put_nowait, d)
            def on_error(e):
                log.error("bridge: %s", e)
                loop.call_soon_threadsafe(q.put_nowait, ("__error__", e))
                loop.call_soon_threadsafe(q.put_nowait, None)
            self.session.send(text, on_delta=on_delta, on_done=lambda full: loop.call_soon_threadsafe(q.put_nowait, None),
                              on_error=on_error)
        threading.Thread(target=pump, daemon=True).start()

        _send(self.ws, {"event": "state", "state": "lars"})
        self.speaking = True
        pending = ""
        full_reply = []
        try:
            while True:
                item = await q.get()
                if item is None:
                    break
                if isinstance(item, tuple) and item[0] == "__error__":
                    _send(self.ws, {"event": "error", "msg": "bridge: " + item[1]})
                    break
                full_reply.append(item)
                _send(self.ws, {"event": "text", "role": "lars", "text": item})
                pending += item
                while _has_sentence_end(pending):
                    sent, pending = _pop_sentence(pending)
                    if sent.strip():
                        await self.speak(sent)
            if pending.strip():
                await self.speak(pending)
        finally:
            self.speaking = False
            self.tts_stop.clear()
            log.info("reply: %.200r", "".join(full_reply))
            _send(self.ws, {"event": "done"})
            # CONTINUOUS loop: mic keeps streaming — fresh turn, back to listening
            self.reset()
            _send(self.ws, {"event": "state", "state": "listening"})

    async def speak(self, text: str):
        """Synthesize one sentence; stream PCM frames to the page as they come."""
        self.tts_stop.clear()
        q: asyncio.Queue = asyncio.Queue()

        def synth_thread():
            try:
                for chunk in _tts.synth(text, stop=self.tts_stop):
                    q.put_nowait(chunk)
            finally:
                q.put_nowait(None)

        threading.Thread(target=synth_thread, daemon=True).start()
        while True:
            chunk = await q.get()
            if chunk is None or self.tts_stop.is_set():
                break
            pcm = chunk.detach().cpu().numpy() if hasattr(chunk, "detach") else np.asarray(chunk)
            pcm16 = (np.clip(pcm, -1, 1) * 32767).astype(np.int16).tobytes()
            await self.ws.send_bytes(pcm16)

    async def barge_in(self):
        log.info("barge-in")
        self.tts_stop.set()
        self.session.interrupt()
        seed = self.prering
        self.reset()
        self.buf = list(seed)       # pre-barge audio seeds the new turn
        self.fed = sum(len(c) for c in seed)
        if self.fed:
            _stt.feed(self.stt_stream, np.concatenate(seed))
        with contextlib.suppress(Exception):
            _send(self.ws, {"event": "interrupted"})
            _send(self.ws, {"event": "state", "state": "listening"})


def _has_sentence_end(s: str) -> bool:
    return any(c in s for c in ".!?\n")


def _pop_sentence(s: str):
    for i, c in enumerate(s):
        if c in ".!?\n":
            return s[:i + 1], s[i + 1:]
    return s, ""


@app.websocket("/ws/voice")
async def voice_endpoint(ws: WebSocket, token: str = ""):
    ws._lars_loop = asyncio.get_running_loop()
    await ws.accept()
    log.info("client connected (origin=%r)", ws.headers.get("origin", ""))
    if not _origin_ok(ws):
        await ws.close(code=4403)
        return
    if not _token_ok(ws, token or ws.headers.get("x-token", "")):
        await ws.close(code=4401)
        return
    await ws.send_text(json.dumps({"event": "hello_ok"}))
    await ws.send_text(json.dumps({"event": "audio_format", "rate": config.TTS_SAMPLE_RATE}))

    session = agent_bridge.LarsBridge(config.BRIDGE_WS_URL, config.PROFILE)
    if not session.wait_ready(20):
        await ws.send_text(json.dumps({"event": "error", "msg": "bridge not ready"}))
        session.close()
        return

    state = "hot"          # HOT_MIC default: page streams, KWS armed
    cap_rate = 16000       # capture sample rate as declared by the page
    wake_stream = _wake.new_stream()
    turn: Turn | None = None

    def idle_off():
        """HOT_MIC_IDLE_S of no speech → mic OFF (mic icon re-arms)."""
        nonlocal state, turn
        if state == "listening" and turn is not None and not turn.speaking \
                and time.time() - turn.last_activity > config.HOT_MIC_IDLE_S:
            log.info("hot-mic idle %.0fs -> off", config.HOT_MIC_IDLE_S)
            turn = None
            state = "off"
            _send(ws, {"event": "state", "state": "off"})

    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            idle_off()
            if "bytes" in msg and msg["bytes"]:
                pcm_i16 = np.frombuffer(msg["bytes"], dtype=np.int16)
                if state == "hot":
                    hit = await asyncio.to_thread(
                        _wake.feed, wake_stream, pcm_i16.astype(np.float32) / 32768.0)
                    if hit.strip():
                        log.info("WAKE: %r", hit)
                        state = "listening"
                        turn = Turn(ws, session, cap_rate)
                        _send(ws, {"event": "state", "state": "listening"})
                        wake_stream = _wake.new_stream()
                elif state == "listening" and turn is not None:
                    await turn.feed(pcm_i16)
                    idle_off()
            elif "text" in msg:
                ev = json.loads(msg["text"])
                kind = ev.get("event")
                if kind == "audio_format":
                    r = ev.get("rate") or 16000
                    if r != cap_rate:
                        log.info("capture rate: %s Hz", r)
                    cap_rate = int(r)
                    if turn:
                        turn.rate = cap_rate
                elif kind in ("listen", "wake"):
                    # mic icon press (or wake hit): hot mic ON, continuous
                    state = "listening"
                    turn = Turn(ws, session, cap_rate)
                    _send(ws, {"event": "state", "state": "listening"})
                elif kind == "stop":
                    state = "off"
                    turn = None
                    _send(ws, {"event": "state", "state": "off"})
                elif kind == "eos":
                    if turn:
                        await turn.finish()
                elif kind == "typed":
                    # typed entry from the panel — same bridge/session as voice
                    text = (ev.get("text") or "").strip()
                    if text:
                        if turn is None:
                            turn = Turn(ws, session, cap_rate)
                        _send(ws, {"event": "state", "state": "processing"})
                        _send(ws, {"event": "text", "role": "user", "text": text})
                        await turn.run_agent(text)
                elif kind == "interrupt":
                    if turn:
                        await turn.barge_in()
    except WebSocketDisconnect:
        pass
    finally:
        session.close()
        log.info("client disconnected")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
