"""wake_engine.py — sherpa KWS for "hey lars" (BPE keywords file — see NOTES)."""

import sherpa_onnx

from config import KWS_DIR, KWS_KEYWORDS


class Wake:
    def __init__(self):
        self.kws = sherpa_onnx.KeywordSpotter(
            tokens=f"{KWS_DIR}\\tokens.txt",
            encoder=f"{KWS_DIR}\\encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
            decoder=f"{KWS_DIR}\\decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
            joiner=f"{KWS_DIR}\\joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
            keywords_file=KWS_KEYWORDS,
            num_threads=1, sample_rate=16000, feature_dim=80)

    def new_stream(self):
        return self.kws.create_stream()

    def feed(self, stream, pcm_f32) -> str:
        """Feed audio; returns 'hey lars' when spotted, else ''. """
        stream.accept_waveform(16000, pcm_f32)
        while self.kws.is_ready(stream):
            self.kws.decode_stream(stream)
        return self.kws.get_result(stream) or ""

    def reset_stream(self, stream):
        """Keep spotting after a miss — KWS stream must be recreated after hit."""
        return self.new_stream()
