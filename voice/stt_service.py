"""stt_service.py — sherpa streaming Zipformer (En-20M, int8) wrapper."""

import sherpa_onnx

from config import STT_DIR


class STT:
    def __init__(self):
        self.recognizer = sherpa_onnx.OnlineRecognizer.from_transducer(
            tokens=f"{STT_DIR}\\tokens.txt",
            encoder=f"{STT_DIR}\\encoder-epoch-99-avg-1.int8.onnx",
            decoder=f"{STT_DIR}\\decoder-epoch-99-avg-1.onnx",
            joiner=f"{STT_DIR}\\joiner-epoch-99-avg-1.int8.onnx",
            num_threads=1, sample_rate=16000, feature_dim=80,
            decoding_method="greedy_search")

    def new_stream(self):
        return self.recognizer.create_stream()

    def feed(self, stream, pcm_f32):
        stream.accept_waveform(16000, pcm_f32)
        while self.recognizer.is_ready(stream):
            self.recognizer.decode_stream(stream)

    def partial(self, stream) -> str:
        return self.recognizer.get_result(stream)

    def finalize(self, stream) -> str:
        """Accept a tail of zeros and pull the final text."""
        import numpy as np
        tail = np.zeros(16000, dtype=np.float32)  # 1 s tail padding
        stream.accept_waveform(16000, tail)
        stream.input_finished()
        while self.recognizer.is_ready(stream):
            self.recognizer.decode_stream(stream)
        return self.recognizer.get_result(stream)
