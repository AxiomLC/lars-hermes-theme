
import sys, wave, numpy as np, asyncio, os
sys.path.insert(0, ".")
import config
config.HYBRID_STT = False
import voice_server as vs
from stt_service import STT

class FakeWS:
    def __init__(self): self.sent=[]
    async def send_text(self, s): self.sent.append(s)
    async def send_bytes(self, b): pass
    _lars_loop = asyncio.get_event_loop()

async def main():
    st = STT()
    wav = r"models\sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile\test_wavs\0.wav"
    with wave.open(wav) as w: rate=w.getframerate(); data=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16)
    stream = st.new_stream()
    total = np.concatenate([data.astype(np.float32)/32768.])
    st.feed(stream, total)
    text = st.finalize(stream)
    print("FINALIZE:", repr(text))
asyncio.run(main())
