import asyncio, json
import websockets, numpy as np

async def main():
    async with websockets.connect("ws://127.0.0.1:8000/ws/voice?token=lars-voice-dev-token", origin="file://") as ws:
        print("hello:", await ws.recv())
        print("fmt:", await ws.recv())
        await ws.send(json.dumps({"event": "typed", "text": "Say OK."}))
        while True:
            m = await asyncio.wait_for(ws.recv(), timeout=60)
            if isinstance(m, bytes): continue
            d = json.loads(m)
            print("EV:", d)
            if d.get("event") == "done":
                m2 = await asyncio.wait_for(ws.recv(), timeout=60)
                if not isinstance(m2, bytes):
                    print("EV:", json.loads(m2))
                break
        # now stream pure silence for 12 s — expect 'off' after ~10 s
        silence = np.zeros(1600, np.int16).tobytes()
        async def stream():
            for _ in range(100):
                await ws.send(silence)
                await asyncio.sleep(0.1)
        st = asyncio.ensure_future(stream())
        t0 = asyncio.get_event_loop().time(); state = None
        try:
            while asyncio.get_event_loop().time() - t0 < 14:
                m = await asyncio.wait_for(ws.recv(), timeout=16)
                if isinstance(m, bytes): continue
                d = json.loads(m)
                if d.get("event") == "state":
                    state = d.get("state")
                    print("state:", state, f"after {asyncio.get_event_loop().time()-t0:.1f}s")
                    if state == "off": break
        except asyncio.TimeoutError:
            print("recv timeout")
        st.cancel()
        print("FINAL:", state)
asyncio.run(main())
