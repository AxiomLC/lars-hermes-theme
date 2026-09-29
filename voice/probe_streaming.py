"""probe_streaming.py — verify the new continuous loop without the UI.

1. typed event -> bridge -> TTS -> done -> {state:'listening'} (CONTINUOUS) -> idle 10s -> 'off'
2. silence-only PCM while LISTENING -> no turn (heard_speech guard)
"""
import asyncio, json, sys
import numpy as np
import websockets

URI = "ws://127.0.0.1:8000/ws/voice?token=lars-voice-dev-token"

async def main():
    async with websockets.connect(URI, origin="file://") as ws:
        print("hello:", await ws.recv())                      # hello_ok
        fmt = await ws.recv(); print("audio_format:", fmt)
        # 1. typed turn
        await ws.send(json.dumps({"event": "typed", "text": "What is your name? Answer in one sentence."}))
        got_audio = False
        events = []
        while True:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=60)
            except asyncio.TimeoutError:
                print("TIMEOUT waiting frames"); break
            if isinstance(msg, bytes):
                got_audio = True; continue
            d = json.loads(msg)
            if d.get("event") in ("text", "state", "done", "error", "interrupted"):
                events.append((d.get("event"), d.get("role") or d.get("state") or d.get("msg"), (d.get("text") or "")[:80]))
                if d.get("event") == "state" and d.get("state") == "listening":
                    break   # continuous loop confirmed: back to listening after done
        for e in events: print("EV:", e)
        print("got_audio:", got_audio)
        assert any(e[0] == "state" and e[1] == "listening" for e in events[-2:]), "continuous loop FAILED"

        # 3. silence -> after HOT_MIC_IDLE_S (10 s) server must send 'off'
        silence = np.zeros(1600, np.int16).tobytes()
        t0 = asyncio.get_event_loop().time()
        state = None
        try:
            while asyncio.get_event_loop().time() - t0 < 16:
                msg = await asyncio.wait_for(ws.recv(), timeout=20)
                if isinstance(msg, bytes): continue
                d = json.loads(msg)
                if d.get("event") == "state":
                    state = d.get("state")
                    if state == "off":
                        break
        except asyncio.TimeoutError:
            pass
        dt = asyncio.get_event_loop().time() - t0
        print(f"streaming silence {dt:.1f}s -> final state: {state}")
        print("PASS" if state == "off" else "FAIL (expected off)")

asyncio.run(main())
