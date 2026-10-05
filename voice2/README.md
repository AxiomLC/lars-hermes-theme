# voice2 — Lars 2.0 voice backend helpers

> Beta 2.0 — the voice engine lives in `../plugin.js` (in-page: STT capture, brain
> via native RPC, TTS playback, barge-in). This folder holds only backend helpers.

## What's here

- **`stt_local.py`** — Flask+faster-whisper STT endpoint on `:8107`.
  - `POST /transcribe` — raw WAV body (`Content-Type: audio/wav`) or multipart
    (`audio` field) → `{text, language}`. Mono downmix built in, 12 MB cap.
  - `GET /health` — `{ok, model, device}`.
  - Reads sibling `.env` on boot: `STT_PORT`, `STT_MODEL` (default `base`;
    `tiny` ≈2× faster — the latency knob), `STT_DEVICE` (`cpu`/`auto`),
    `STT_COMPUTE`, `LARS_VOICE_TOKEN` (bearer gate; blank = open, local-only bind).
  - **whisper's Silero VAD is OFF by design** — the Intel Smart mic-array channel
    quirk made whisper's own VAD reject whole utterances; the plugin's energy-VAD
    does segmentation, whisper just decodes.
- **`start.bat`** — starts STT detached (minimized), nothing else.
- **`logs/`** (gitignored) — `stt-local.log`: per-request ms / audio-seconds /
  text, 300 KB cap with keep-tail-half pruning.

## The full voice loop (for context)

```
mic → energy-VAD (plugin.js) → 16 kHz WAV → POST :8107/transcribe → text →
  prompt.submit (lars2 profile, native desktop session) → stream deltas →
  sentence chunker → Pocket TTS :8000 ('alba') → gapless playback →
  energy barge-in / re-arm button
```

External processes that must be up: Pocket TTS (`uvx pocket-tts serve` → `:8000`)
and the Hermes multiplex gateway (serves every profile incl. `lars2` —
`hermes -p default gateway status`).

## Diagnostics (not HTTP-logged anymore)

Every transcript/status/error the voice engine emits is mirrored to Hermes' own
log via the gateway-mounted plugin backend:

- File: `~\AppData\Local\hermes\plugins\lars\voice-events.log` — last 100 JSON
  lines `{t, src, level, msg}` (the cap IS the pruning).
- Agents read it as a plain file; humans/agents can also
  `GET /api/plugins/lars/voice-log` on `:9119` with the dashboard session token.
- After editing `../plugins/lars/dashboard/plugin_api.py`, restart the dashboard
  or new routes won't mount (import-once at startup).

## Not here / by design

- No helper HTTP server (`:1122` deleted with `server.js` + `public/` tester —
  the plugin page doesn't need it).
- No wake word, no sherpa/whisper.cpp — old `voice/` stack deleted for good.
- OpenAI-compatible `:8642` stays for EXTERNAL automation only.
