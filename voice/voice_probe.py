
import asyncio, json, wave, numpy as np, websockets
async def main():
    wav = r"models\sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile\test_wavs\0.wav"
    with wave.open(wav) as w: rate = w.getframerate(); data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    print("wav rate", rate, "samples", len(data))
    async with websockets.connect("ws://127.0.0.1:8000/ws/voice?token=lars-voice-dev-token", origin="file://") as ws:
        print(await ws.recv()); print(await ws.recv())
        await ws.send(json.dumps({"event":"listen"}))
        # cadence: 0.1 s chunks (rate samples per 100 ms)
        async def stream():
            chunk = rate // 10
            for i in range(0, len(data), chunk):
                await ws.send(data[i:i+chunk].tobytes())
                await asyncio.sleep(0.1)
            # trailing silence 3x rate
            silence = np.zeros(rate//10, np.int16).tobytes()
            for _ in range(30):
                await ws.send(silence); await asyncio.sleep(0.1)
        st = asyncio.ensure_future(stream())
        partials = []
        while True:
            m = await asyncio.wait_for(ws.recv(), timeout=60)
            if isinstance(m, bytes): continue
            d = json.loads(m)
            ev = d.get("event"); 
            if ev == "text" and d.get("role") == "user": partials.append(d.get("text"))
            if d.get("event") == "done":
                # next should be listening
                m2 = await asyncio.wait_for(ws.recv(), timeout=30)
                if not isinstance(m2, bytes): print("after done:", m2)
                break
        st.cancel()
        print("PARTIALS:", partials[-3:])
asyncio.run(main())
