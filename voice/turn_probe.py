
"""simulate Turn.feed at 100 ms chunks with the wav, capture finish decision."""
import sys, wave, numpy as np, asyncio, os
sys.path.insert(0, ".")
os.environ.setdefault("LARS_HYBRID","0")
import config
config.HYBRID_STT = False   # keep probe independent of :9119
import voice_server as vs, agent_bridge, json

class FakeWS:
    async def send_text(self, s): print("SEND:", s[:100])
    async def send_bytes(self, b): pass
    _lars_loop = asyncio.get_event_loop()

async def main():
    vs._stt = vs.STT()
    wav = r"models\sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile\test_wavs\0.wav"
    with wave.open(wav) as w: rate=w.getframerate(); data=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16)
    t = vs.Turn(FakeWS(), None)   # session unused unless finish->run_agent>send... run_agent needs session; finish would call run_agent -> bridge. Avoid by faking: instead monkeypatch run_agent 
    async def fake_agent(text): print(">>> SUBMITTED:", text); return
    t.run_agent = fake_agent
    chunk = rate//10
    for i in range(0, len(data), chunk):
        await t.feed(data[i:i+chunk])
        await asyncio.sleep(0)   # let scheduled finish run? finish schedules at 2 s silence after speech; wav = 6.6 s speech then silence
    silence = np.zeros(rate//10, np.int16)
    for _ in range(25):
        await t.feed(silence)
        await asyncio.sleep(0.05)
    if t.finish_task:
        try:
            await asyncio.wait_for(t.finish_task, timeout=10)
        except Exception as e:
            print("finish task err", e)
    else:
        print("NO finish_task scheduled!")
    print("heard:", t.heard_speech, "buffer len", 0)
asyncio.run(main())
