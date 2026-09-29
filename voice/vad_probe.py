
import sys, wave, numpy as np
sys.path.insert(0, ".")
import vad
wav = r"models\sherpa-onnx-streaming-zipformer-en-20M-2023-02-17-mobile\test_wavs\0.wav"
with wave.open(wav) as w: rate=w.getframerate(); data=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16)
v = vad.VAD()
flags=[]
chunk = rate//10
for i in range(0, len(data), chunk):
    flags.append(v.is_speech(data[i:i+chunk].astype(np.float32)/32768.))
print("speech frames:", sum(flags), "/", len(flags))
