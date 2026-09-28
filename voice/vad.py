"""vad.py — silero VAD via sherpa-onnx VadModel (1.13.x real API:
VadModel.create(config), .is_speech(samples), .window_size, .reset).
Handles the 600 ms endpoint rule ourselves (config.ENDPOINT_SILENCE_S)."""

import sherpa_onnx

from config import VAD_MODEL, ENDPOINT_SILENCE_S

SR = 16000


class VAD:
    """Simple stateful speech detector. Feed 16k mono float32 in any chunk
    size; we buffer to the model's window and track the latest verdict."""

    def __init__(self):
        silero = sherpa_onnx.SileroVadModelConfig(
            model=VAD_MODEL, threshold=0.5,
            min_speech_duration=0.25, min_silence_duration=ENDPOINT_SILENCE_S)
        cfg = sherpa_onnx.VadModelConfig(silero_vad=silero, sample_rate=SR, num_threads=1)
        self.model = sherpa_onnx.VadModel.create(cfg)
        self._buf = []
        self._window = self.model.window_size() if callable(self.model.window_size) else 512

    def is_speech(self, pcm_f32) -> bool:
        """Feed a chunk; returns True if the LATEST window contains speech."""
        self._buf.extend(pcm_f32)
        w = self._window
        speech = False
        while len(self._buf) >= w:
            chunk = self._buf[:w]
            self._buf = self._buf[w:]
            speech = bool(self.model.is_speech(chunk))
        return speech

    def reset(self):
        self.model.reset()
        self._buf = []
