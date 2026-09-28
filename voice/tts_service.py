"""tts_service.py — pocket-tts streaming, per-sentence, stateful, barge-in
via stop Event (all verified in the skill reference — do not redesign)."""

import threading

from pocket_tts import TTSModel

from config import TTS_LANGUAGE, TTS_VOICE, TTS_SAMPLE_RATE


class TTS:
    """One model instance = one concurrent generation (not thread-safe)."""

    def __init__(self):
        self.model = TTSModel.load_model(language=TTS_LANGUAGE)
        self.state = self.model.get_state_for_audio_prompt(TTS_VOICE)
        self.sample_rate = TTS_SAMPLE_RATE
        self._lock = threading.Lock()

    def warmup(self):
        """One tiny synth at boot so the first real turn isn't cold."""
        for _ in self.synth("Warm up.", stop=None):
            break

    def synth(self, text: str, stop: threading.Event = None):
        """Generator: yields float32 PCM chunks (24 kHz mono, ±1.0).
        Caller must hold the instance (single generation at a time)."""
        with self._lock:
            for chunk in self.model.generate_audio_stream(self.state, text, stop=stop):
                if stop is not None and stop.is_set():
                    break
                yield chunk
