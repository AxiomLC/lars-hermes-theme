
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
    vs._stt = vs.STT()
    wav = r"models\sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile\test_wavs\0.wav"
    with wave.open(wav) as w: rate=w.getframerate(); data=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16)
    t = vs.Turn(FakeWS(), None)
    submitted = []
    async def agent(text): submitted.append(text)
    t.run_agent = agent
    chunk = rate//10
    for i in range(0, len(data), chunk):
        await t.feed(data[i:i+chunk])
    silence = np.zeros(rate//10, np.int16)
    for _ in range(25):
        await t.feed(silence)
        await asyncio.sleep(0.02)
    print("silence:", t.silence, "heard:", t.heard_speech, "finishing:", t.finishing)
    if t.finish_task:
        await asyncio.wait_for(t.finish_task, timeout=30)
    else:
        print("NO finish_task!")
    for s in t.ws.sent: print("WS:", s[:120])
    print("submitted:", submitted)
asyncio.run(main())
