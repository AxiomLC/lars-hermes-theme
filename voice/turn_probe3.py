
import sys, wave, numpy as np, asyncio, os
sys.path.insert(0, ".")
import config
config.HYBRID_STT = False
import voice_server as vs

class FakeWS:
    def __init__(self): self.sent=[]
    async def send_text(self, s): self.sent.append(s)
    async def send_bytes(self, b): pass
    _lars_loop = asyncio.get_event_loop()

async def main():
    vs._stt = STT = vs.STT()
    wav = r"models\sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile\test_wavs\0.wav"
    with wave.open(wav) as w: rate=w.getframerate(); data=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16)
    t = vs.Turn(FakeWS(), None)
    submitted = []
    async def agent(text): submitted.append(text)
    t.run_agent = agent
    chunk = rate//10
    # crop to 3.5 s so we see intermediate state?
    for i in range(0, len(data), chunk):
        await t.feed(data[i:i+chunk])
    print("after speech: heard", t.heard_speech, "silence", t.silence, "finishing", t.finishing, "buf chunks", len(t.buf))
    silence = np.zeros(rate//10, np.int16)
    for _ in range(25):
        await t.feed(silence)
        await asyncio.sleep(0.02)
        if t.finish_task and t.finish_task.done(): break
    print("post-silence: finishing", t.finishing, "finish_task?", t.finish_task is not None)
    if t.finish_task:
        try:
            await asyncio.wait_for(asyncio.shield(t.finish_task), timeout=30)
        except Exception as e: print("finish err:", repr(e))
    for s in t.ws.sent: print("WS:", s[:120])
    print("submitted:", submitted)
asyncio.run(main())
