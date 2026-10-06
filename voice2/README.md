# voice2 — Lars 2.0 voice backend helpers

> Beta 2.0 — the voice engine lives in `../plugin.js` (in-page: STT capture, brain
> via native RPC, TTS playback, barge-in). This folder holds only backend helpers.

## What's here

- **`stt_local.py`** — local STT endpoint on `:8107` (engine: **Moonshine** default,
  faster-whisper fallback — see "Switching STT engine" below).
  - `POST /transcribe` — raw WAV body (`Content-Type: audio/wav`) or multipart
    (`audio` field) → `{text, language}`. Mono downmix built in, 12 MB cap.
  - `GET /health` — `{ok, engine, model, device}`.
  - Reads sibling `.env` on boot: `STT_PORT`, `STT_ENGINE`, `STT_MOONSHINE_MODEL`,
    `STT_MODEL` (whisper), `STT_DEVICE`, `STT_COMPUTE`. Loopback-only, no auth token.
  - whisper's Silero VAD is OFF by design — the Intel Smart mic-array channel
    quirk made whisper's own VAD reject whole utterances; the plugin's energy-VAD
    does segmentation, the engine just decodes.
- **`start.bat`** — one click: starts Pocket TTS `:8000` (reused if up) + STT `:8107`, both detached.
- **`stop.bat`** — one click: kills both sidecars (`:8000` + `:8107` by port). Hermes untouched.

### Switching STT engine (moonshine ⇄ whisper)

Moonshine is the default (faster, better WER). If it misbehaves (quirky output,
empty text on real speech), flip the FIRST choice back to whisper:

1. Edit `voice2/.env`: set `STT_ENGINE=whisper` (and optionally `STT_MODEL=base|tiny|small`).
2. Restart STT: run `stop.bat` then `start.bat`.
3. Verify: `curl http://127.0.0.1:8107/health` → should report `"engine":"whisper"`.

Conversely, to run moonshine again: `STT_ENGINE=moonshine` (recommended once stable).
Whisper also auto-serves on a per-request basis if moonshine errors at runtime —
see the `[warn] … falling back` line in `stt-local.log`.

```

- **`logs/`** (gitignored) — `stt-local.log`: per-request ms / audio-seconds /
  text, 300 KB cap with keep-tail-half pruning.

```env
# voice2/.env — current live values
STT_PORT=8107
STT_ENGINE=moonshine      # flip to 'whisper' to make whisper the first choice
STT_MOONSHINE_MODEL=base  # moonshine: tiny | base
# STT_MODEL=base          # whisper fallback engine only
```

## The full voice loop (for context)

```
mic → energy-VAD (plugin.js) → 16 kHz WAV → POST :8107/transcribe → text →
  prompt.submit (lars2 profile, native desktop session) → stream deltas →
  sentence chunker → Pocket TTS :8000 (voice set in plugin.js, currently `jean`) → gapless playback →
  energy barge-in / re-arm button
```
(Pocket TTS voice is set in `../plugin.js` — `TTS_VOICE` constant, currently `jean`.)

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
