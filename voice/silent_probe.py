
import asyncio, json, websockets, sys
async def main():
    async with websockets.connect("ws://127.0.0.1:8000/ws/voice?token=lars-voice-dev-token", origin="file://") as ws:
        print("open; reading hello+fmt")
        print(await ws.recv()); print(await ws.recv())
        await ws.send(json.dumps({"event":"listen"}))
        m = await asyncio.wait_for(ws.recv(), timeout=10)
        print("after listen:", m)
        await ws.send(json.dumps({"event":"typed","text":"Say OK."}))
        seen_done = False
        while True:
            m = await asyncio.wait_for(ws.recv(), timeout=60)
            if isinstance(m, bytes): continue
            d = json.loads(m); print("EV:", d)
            if d.get("event") == "done": seen_done = True; continue_f = True
            if d.get("event") == "state" and d.get("state") == "listening":
                print("CONTINUOUS CONFIRMED (listening after done)")
                break
        # silence for 12 s
        import numpy as np
        silence = np.zeros(1600, np.int16).tobytes()
        async def stream():
            for _ in range(120):
                try: await ws.send(silence)
                except Exception: return
                await asyncio.sleep(0.1)
        st = asyncio.ensure_future(stream())
        t0 = asyncio.get_event_loop().time(); state=None
        try:
            while asyncio.get_event_loop().time() - t0 < 15:
                m = await asyncio.wait_for(ws.recv(), timeout=17)
                if isinstance(m, bytes): continue
                d = json.loads(m)
                if d.get("event") == "state":
                    state = d.get("state"); print(f"state {state} at {asyncio.get_event_loop().time()-t0:.1f}s")
                    if state == "off": break
        except asyncio.TimeoutError: print("no off within 15s")
        st.cancel()
        print("FINAL:", state)
asyncio.run(main())
