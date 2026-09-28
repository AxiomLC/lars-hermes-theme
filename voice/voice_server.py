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
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s: %(message)s")

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
    return o.startswith(("http://127.0.0.1", "http://localhost"))


def _token_ok(ws: WebSocket, token: str) -> bool:
    return token == config.TOKEN


def _send(ws, obj: dict):
    # ws._lars_loop is captured at endpoint connect (Starlette WS has no .loop)
    loop = getattr(ws, "_lars_loop", None) or asyncio.get_event_loop()
    asyncio.run_coroutine_threadsafe(ws.send_text(json.dumps(obj)), loop)


class Turn:
    """One LISTEN→SPEAK turn; owns capture buffers + VAD + STT + barge-in."""

    def __init__(self, ws, session):
        self.ws = ws
        self.session = session
        self.vad = VAD()
        self.stt_stream = _stt.new_stream()
        self.buf = []            # float32 PCM chunks captured
        self.fed = 0             # samples already fed to STT (feed only NEW audio)
        self.speaking = False
        self.tts_stop = threading.Event()
        self.finishing = False

    async def feed(self, pcm_i16):
        """Audio chunk from the page (int16 16k mono)."""
        pcm = pcm_i16.astype(np.float32) / 32768.0
        speech = self.vad.is_speech(pcm)

        if self.speaking:
            if speech and config.BARGE_IN:
                await self.barge_in()
            return  # while Lars talks, only barge-in matters

        self.buf.append(pcm)
        audio = np.concatenate(self.buf)
        # live partial transcript every ~300 ms of NEW audio
        if len(audio) - self.fed >= 4800:
            _stt.feed(self.stt_stream, audio[self.fed:])
            self.fed = len(audio)
            partial = _stt.partial(self.stt_stream)
            if partial:
                _send(self.ws, {"event": "text", "role": "user", "text": partial})

        # 600 ms of trailing silence ends the turn
        if len(audio) > 16000 * config.ENDPOINT_SILENCE_S and not speech:
            asyncio.get_event_loop().create_task(self.finish())

    async def finish(self):
        if self.finishing:
            return
        self.finishing = True
        try:
            audio = np.concatenate(self.buf) if self.buf else np.zeros(0, np.float32)
            self.buf = []
            if len(audio) < 16000 * 0.3:   # too short to be speech
                return
            text = _stt.finalize(self.stt_stream)
            log.info("user said: %r", text)
            if not text.strip():
                _send(self.ws, {"event": "state", "state": "listening"})
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

    async def run_agent(self, text: str):
        """Bridge → deltas → sentence-chunked TTS → PCM out."""
        loop = asyncio.get_event_loop()
        q: asyncio.Queue = asyncio.Queue()

        def pump():
            def on_delta(d):
                loop.call_soon_threadsafe(q.put_nowait, d)
            self.session.send(text, on_delta=on_delta,
                              on_done=lambda full: loop.call_soon_threadsafe(q.put_nowait, None),
                              on_error=lambda e: (log.error("bridge: %s", e),
                                                  loop.call_soon_threadsafe(q.put_nowait, None)))
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
        self.speaking = False
        self.buf = []
        self.vad = VAD()
        self.stt_stream = _stt.new_stream()
        self.finishing = False
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
    wake_stream = _wake.new_stream()
    turn: Turn | None = None

    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            if "bytes" in msg and msg["bytes"]:
                pcm_i16 = np.frombuffer(msg["bytes"], dtype=np.int16)
                if state == "hot":
                    hit = await asyncio.to_thread(
                        _wake.feed, wake_stream, pcm_i16.astype(np.float32) / 32768.0)
                    if hit.strip():
                        log.info("WAKE: %r", hit)
                        state = "listening"
                        turn = Turn(ws, session)
                        _send(ws, {"event": "state", "state": "listening"})
                        wake_stream = _wake.new_stream()
                elif state == "listening" and turn is not None:
                    await turn.feed(pcm_i16)
            elif "text" in msg:
                ev = json.loads(msg["text"])
                kind = ev.get("event")
                if kind in ("listen", "wake"):
                    state = "listening"
                    turn = Turn(ws, session)
                    _send(ws, {"event": "state", "state": "listening"})
                elif kind == "eos":
                    if turn:
                        await turn.finish()
                elif kind == "typed":
                    # typed entry from the panel — same bridge/session as voice
                    text = (ev.get("text") or "").strip()
                    if text:
                        if turn is None:
                            turn = Turn(ws, session)
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
