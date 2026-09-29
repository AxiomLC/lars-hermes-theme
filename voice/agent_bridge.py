"""agent_bridge.py — Lars Voice Local Core → REAL Hermes session bridge.

Transport (verified 2026-09-27, machine-2):
  POST http://127.0.0.1:9119/api/auth/ws-ticket  — 401 in our setup; instead we
  use the loopback legacy token: WS ws://127.0.0.1:9119/api/ws?token=<TOKEN>.
  The dashboard relays gateway JSON-RPC (tui_gateway.ws.handle_ws) verbatim.
  The dashboard must be launched with HERMES_DASHBOARD_SESSION_TOKEN=<TOKEN>
  (lars-voice-bridge-2026 as of this build — see voice/run-voice-server.ps1).

Protocol (apps/shared/src/gateway-contract.openrpc.json):
  session.most_recent {profile}  -> find the persistent lars session
  session.create      {profile}  -> mint live session (first boot)
  session.resume      {session_id}
  prompt.submit       {session_id, profile, text, surface:'voice'} -> {status:'streaming'}
  notifications: {method:'event', params:{type:'message.delta'|'message.interim'|
  'message.complete'|'message.start'|'tool.start'|..., session_id, payload}}

Usage:
    from agent_bridge import LarsBridge
    b = LarsBridge()  # sync wrapper around an asyncio task
    b.send(text, on_delta=..., on_done=...)
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import threading
from typing import Callable, Optional

import websockets

log = logging.getLogger("lars.bridge")

WS_URL = "ws://127.0.0.1:9119/api/ws?token=lars-voice-bridge-2026"
PROFILE = "lars"


class LarsBridge:
    """One persistent WS connection to the gateway. Thread-safe from the
    (threaded) voice pipeline: send() marshals onto the loop."""

    def __init__(self, ws_url: str = WS_URL, profile: str = PROFILE):
        self.ws_url = ws_url
        self.profile = profile
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="lars-bridge")
        self._ready = threading.Event()
        self._ws = None
        self._rid = 0
        self._pending: dict[int, asyncio.Future] = {}
        self.session_id: Optional[str] = None
        self._turn_queues: list[asyncio.Queue] = []  # per-turn event queues
        self._thread.start()
        # attach happens asynchronously; callers wait on wait_ready()
        fut = asyncio.run_coroutine_threadsafe(self._attach(), self._loop)
        self._attach_fut = fut
        fut.add_done_callback(lambda f: self._ready.set() if not f.exception() else log.error("attach failed: %s", f.exception()))

    # -- loop plumbing ----------------------------------------------------
    def _run_loop(self):
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def wait_ready(self, timeout: float = 20) -> bool:
        return self._ready.wait(timeout) and self.session_id is not None

    def _coro(self, coro, timeout=30):
        return asyncio.run_coroutine_threadsafe(coro, self._loop).result(timeout)

    # -- connection ---------------------------------------------------------
    async def _attach(self):
        self._ws = await websockets.connect(self.ws_url, open_timeout=10)
        self._reader_task = asyncio.get_event_loop().create_task(self._reader())
        await self._resume_session()

    async def _rpc(self, method: str, params: dict, timeout: float = 25) -> dict:
        self._rid += 1
        rid = self._rid
        fut = self._loop.create_future()
        self._pending[rid] = fut
        await self._ws.send(json.dumps({"jsonrpc": "2.0", "id": rid, "method": method, "params": params}))
        return await asyncio.wait_for(fut, timeout)

    async def _reader(self):
        """One reader: resolves RPC futures, fans turn events to subscribers."""
        try:
            async for raw in self._ws:
                try:
                    frame = json.loads(raw)
                except (ValueError, TypeError):
                    continue
                rid = frame.get("id")
                if rid is not None and rid in self._pending:
                    self._pending.pop(rid).set_result(frame)
                    continue
                if frame.get("method") != "event":
                    log.debug("non-event frame: %s", json.dumps(frame)[:200])
                    continue
                ev = frame.get("params") or {}
                if ev.get("session_id") not in (None, "", self.session_id):
                    continue
                etype = ev.get("type", "")
                log.debug("reader ev: sid=%r mine=%r type=%s", ev.get("session_id"), self.session_id, etype)
                if etype in ("message.delta", "message.interim", "message.complete"):
                    payload = ev.get("payload") or {}
                    text = payload.get("text", "") if isinstance(payload, dict) else ""
                    if etype == "message.complete" and not text:
                        # some builds put the full text at top level
                        text = ev.get("text", "") or (payload or {}).get("content", "")
                    evout = {"type": etype, "text": text}
                    for q in list(self._turn_queues):
                        q.put_nowait(evout)
        except websockets.ConnectionClosed:
            log.warning("bridge WS closed; reconnecting")
            # Reconnect with backoff FOREVER — the gateway restarts (app restarts,
            # crashes); a single-shot reconnect killed the bridge for the rest of
            # the server's life (2026-09-28 live failure: STT fine, Lars silent).
            delay = 1.0
            while True:
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30)
                try:
                    await self._attach()
                    log.info("bridge re-attached, session %s", self.session_id)
                    return
                except Exception as e:
                    log.warning("re-attach failed: %s", e)
        except Exception:
            log.exception("bridge reader died")

    async def _resume_session(self):
        """Attach to the persistent lars session; create if none. After resume,
        prompt.submit must use the LIVE session id (resume result), not the
        stored row id — 'session not found' otherwise (verified 2026-09-27)."""
        r = await self._rpc("session.most_recent", {"profile": self.profile})
        sid = (r.get("result") or {}).get("session_id")
        if not sid:
            r = await self._rpc("session.create", {"profile": self.profile})
            res = r.get("result") or {}
            self.session_id = res.get("session_id")
            log.info("created lars session %s (stored %s)", self.session_id, res.get("stored_session_id"))
            return
        r = await self._rpc("session.resume", {"session_id": sid, "profile": self.profile,
                                               "lazy": True, "close_on_disconnect": True})
        res = r.get("result") or {}
        live = res.get("session_id")
        self.session_id = live or sid
        log.info("resumed lars session stored=%s live=%s", sid, live)

    # -- public API ---------------------------------------------------------
    def send(self, text: str,
             on_delta: Optional[Callable[[str], None]] = None,
             on_done: Optional[Callable[[str], None]] = None,
             on_error: Optional[Callable[[str], None]] = None) -> None:
        """Submit a user turn; deltas stream to on_delta, full reply to on_done."""
        self._coro(self._send(text, on_delta, on_done, on_error), timeout=600)

    def interrupt(self):
        self._coro(self._interrupt(), timeout=10)

    async def _send(self, text, on_delta, on_done, on_error):
        # ATTACH-PER-TURN: resume acquires nothing (leases are claimed lazily by
        # the first prompt turn and released only at session.close — see specs/
        # voice-streaming-design.md). We resume at turn start and close at turn
        # end, so the lease is free between turns and the core Sessions UI can
        # use the same session without "open somewhere else" (SESSION_NOT_OWNED).
        self.session_id = None
        await self._resume_session()
        turn_q: asyncio.Queue = asyncio.Queue()
        self._turn_queues.append(turn_q)
        full = []
        try:
            params = lambda: {
                "session_id": self.session_id, "profile": self.profile,
                "text": text, "surface": "voice"}
            r = await self._rpc("prompt.submit", params())
            if "error" in r and "not found" in (r["error"].get("message") or "").lower():
                # live session aged out (scale-to-zero) — rebuild from the stored
                # row and retry once (resume re-mints the live id)
                log.info("live session gone; resuming stored %s", self.session_id)
                rr = await self._rpc("session.resume", {"session_id": self.session_id, "profile": self.profile})
                live = (rr.get("result") or {}).get("session_id")
                if live:
                    self.session_id = live
                r = await self._rpc("prompt.submit", params())
            if "error" in r:
                raise RuntimeError(r["error"].get("message", "submit failed"))
            # pump events until turn completes (message.complete with text, or
            # a quiet gap after streaming stopped)
            while True:
                if await self._drain_turn(turn_q, full, on_delta):
                    break
        except Exception as exc:
            log.exception("send failed")
            if on_error:
                on_error(str(exc))
        finally:
            with contextlib.suppress(ValueError):
                self._turn_queues.remove(turn_q)
            # Release the session lease so the core Sessions UI can use the same
            # session between voice turns (stored row stays resumable).
            with contextlib.suppress(Exception):
                if self.session_id:
                    await self._rpc("session.close", {"session_id": self.session_id,
                                                      "profile": self.profile}, timeout=10)
                    log.info("session closed (lease released): %s", self.session_id)
            if on_done:
                on_done("".join(full))

    async def _drain_turn(self, turn_q: asyncio.Queue, full: list, on_delta=None) -> bool:
        """Wait for one event; returns True when the turn is complete."""
        try:
            ev = await asyncio.wait_for(turn_q.get(), timeout=120)
        except asyncio.TimeoutError:
            return True  # silence = turn over (no deltas for 2 min)
        if ev["type"] in ("message.delta", "message.interim"):
            full.append(ev["text"])
            if on_delta:
                on_delta(ev["text"])
        elif ev["type"] == "message.complete":
            # complete's text is the FULL reply, not incremental — only use it
            # when no deltas streamed (some models answer in a single chunk)
            if ev["text"] and not full:
                full.append(ev["text"])
            return True
        return False

    async def _interrupt(self):
        if self.session_id:
            with contextlib.suppress(Exception):
                await self._rpc("session.interrupt", {"session_id": self.session_id, "profile": self.profile})

    def close(self):
        with contextlib.suppress(Exception):
            if self._ws is not None:
                self._coro(self._ws.close(), timeout=5)
        self._loop.call_soon_threadsafe(self._loop.stop)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    b = LarsBridge()
    if not b.wait_ready(20):
        print("BRIDGE: not ready")
        raise SystemExit(1)
    print("BRIDGE: attached to session", b.session_id)
    b.send("Voice bridge smoke test — reply with exactly: BRIDGE OK",
           on_delta=lambda t: print("DELTA:", t[:80], flush=True),
           on_done=lambda t: print("DONE:", t[:300], flush=True))
    print("BRIDGE: test complete")
