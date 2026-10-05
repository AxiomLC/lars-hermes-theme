# voice2 — Lars 2.0 streaming voice module

> Beta 2.0 — replaces the old `voice/` Python stack entirely (deleted). The plugin
> (`../plugin.js`) owns the whole voice loop in-page; this folder only provides the
> local STT endpoint plus optional diag/TTS logging helpers.

## What it is

Voice chat for the Lars desktop plugin: user speaks → **local STT** (faster-whisper,
CPU) → text goes to the **`lars2` Hermes profile** via the plugin's native gateway
RPC (`prompt.submit` — the brain lives in `plugin.js`, NOT here) → streamed reply →
**Pocket TTS** (`:8000`, voice `alba`) spoken sentence-by-sentence while still
streaming, with energy-based **barge-in** and a re-arm button.

```
mic → VAD (plugin.js) → WAV → POST :8107/transcribe → text →
  prompt.submit (lars2 profile, native session) → stream deltas →
  sentence chunker → Pocket TTS :8000 → gapless playback → barge-in/re-arm
```

## Run

```powershell
cd voice2
start.bat          # starts STT (:8107, detached) + voice2 server (:1122)
```

Separately (once each, must be up):

```powershell
uvx pocket-tts serve                  # TTS on :8000 (voice 'alba' chosen by plugin)
# Hermes multiplex gateway must be running (serves all profiles): hermes -p default gateway status
```

Health checks:
- STT: `curl http://127.0.0.1:8107/health`
- TTS: `curl http://127.0.0.1:8000/health`
- Hermes API platform: `curl http://127.0.0.1:8642/health`

## The lars2 profile (the brain)

Created via Hermes UI. Lives at `%LOCALAPPDATA%\hermes\profiles\lars2\`:

- `config.yaml` — `model.default: gpt-oss-120b`, `provider: custom`,
  `base_url: https://api.cerebras.ai/v1`, `api_mode: chat_completions`,
  `reasoning_effort: low`, `context_length: 256000`. Trim `skills.disabled` /
  toolsets to keep prompt input tokens small (a bare prompt was ~25k tokens once
  the full toolset attached — trim it).
- `.env` — `CEREBRAS_API_KEY=csk-...` (rotate the beta key after testing),
  `API_SERVER_ENABLED/PORT/KEY` (`8642` strong key) so the shared API-server
  platform can expose per-profile endpoints for external tools.
- Multiplex: ONE host gateway serves every profile (`gateway.multiplex_profiles:
  true` in the default profile config). `lars2` inherits everything else.

## voice2 server (server.js, :1122)

Thin helper only — not the brain.

| Endpoint | Purpose |
|---|---|
| `GET /api/config` | host/CPU info + which upstreams are up (Pocket, Hermes :8642) |
| `POST /api/chat` | SSE bridge — Hermes Sessions API (`LLM_MODE=hermes`) or Cerebras direct (`LLM_MODE=cerebras`), translated to OpenAI-style `data:` frames |
| `POST /api/tts` | pass-through to Pocket TTS |
| `POST /api/diag` | the plugin mirrors its transcript/events here |
| `GET /api/diag` | last 200 diag lines (agent-readable) |

Auth: `Authorization: Bearer ${LARS_VOICE_TOKEN}` on `/api/*`.

### stt_local.py (:8107)

Flask + faster-whisper (`pip install faster-whisper flask`).

- `POST /transcribe` — raw WAV body (`Content-Type: audio/wav`) or multipart
  (`audio` field) → `{text, language}`. Mono downmix built in. 12 MB cap.
- `GET /health` — `{ok, model, device}`.
- Env: `STT_MODEL` (default `base`; `tiny` ≈2× faster — the latency knob),
  `STT_DEVICE` (`cpu` default / `auto`), `STT_COMPUTE` (`int8` on CPU),
  `STT_PORT`, `LARS_VOICE_TOKEN`.
- **VAD note:** whisper's internal Silero VAD is deliberately OFF
  (`vad_filter=False`) — the Silicon Graphics Intel mic-array channel delivers
  near-silence on some channels and Silero rejected whole utterances; the
  plugin's energy-VAD does the segmentation instead. `condition_on_previous_text`
  also off (short one-shot utterances, no cross-utterance hallucination).

## Tuning knobs (plugin.js `CFG`) — the ones you'll actually touch

| Key | Default | Meaning |
|---|---|---|
| `SILENCE_MS` | 2000 | **user-speech end timeout** — silence this long commits the utterance to the LLM. Raise for slow speakers, lower for snappier turns. |
| `STT_ON_LEVEL` | 0.030 | mic peak amplitude = "user is speaking". Raise if false-triggered by room noise. |
| `STT_MIN_AUDIO_MS` | 400 | shorter than this is noise → discarded. |
| `BARGE_RMS` | 0.060 | peak level while Lars is speaking that counts as a barge (keep above `STT_ON_LEVEL`, above room noise). |
| `BARGE_POLLS` | 4 | consecutive ~21 ms polls needed → beats echo/TTS bleed. |
| `BARGE_GRACE_MS` | 500 | ignore mic right after our audio starts. |
| 20 s cap | — | utterance hard cap → force-commit. |

## Logging (self-pruning, `voice2/logs/`)

All logs share one policy: hard cap 300 KB per file; when exceeded, keep only the
tail half (split at the next full line). No rotation daemons, no date files —
files just never exceed the cap.

| File | Written by | Content |
|---|---|---|
| `lars-diag.log` | server (`/api/diag`) | every transcript/event the plugin page emits — the debugging log |
| `stt-local.log` | stt_local.py | per-request: ms, audio length, final text (or error) |
| `voice2-frames.log` | server.js | raw upstream Hermes/Cerebras SSE frames (lowest-level fixture) |
| `server.log` / `server-err.log` | start.bat redirect | console + crash output |
| `hermes-session.json` | server.js | cached lars2 session id (continuity across restarts) |

## Test / debug procedure

1. `node --check ../plugin.js` (or `devenv` syntax check) after edits.
2. Reload lars plugin (`⌘K → Reload desktop plugins`).
3. Type in the box → expect `lars2` turn streamed with TTS (typed path).
4. Arm voice (mic button) → speak → transcript shows your text once (once! dupes
   were a bug) → streamed spoken reply.
5. Barge-in: arm, let Lars start a long answer, say **"stop"** (or just talk over
   it — energy threshold) → TTS halts mid-word, interrupt fires, state goes `hot`.
6. If STT fails: read `stt-local.log` — `len=0` = capture had no usable speech
   (noise/mic issue); `transcribe failed` = engine error; nothing = request never
   arrived (server down — `/health`).
7. Session leaks/duplicate replies: check `lars-diag.log` (`prompt.submit`,
   `session adopted …`) and Hermes `hermes logs --since 5m`.

## Not here / by design

- No wake word, no whisper.cpp, no sherpa — old `voice/` stack deleted for good.
- No OpenAI-compatible round-trips through :8642 for the voice loop; that server
  stays for external automation. Native RPC only (per proposal).
- HUD wiring (lars_hud tool → floating panels) not in this module yet — spec in
  the main README / pocket build doc.
