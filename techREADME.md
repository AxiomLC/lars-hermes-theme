# techREADME — Lars plugin technical reference

> For maintainers (human or AI). [README.md](README.md) = install/run/user story;
> [voice2/README.md](voice2/README.md) = STT service details; [Utility-Monitor.md](Utility-Monitor.md)
> = not-yet-built resource monitor spec.

## 0. The four Hermes services — what they actually are

Everything people conflate into "Hermes" is **four separate things**. Keep them straight:

| Service | What it is | Port | Who starts it |
|---|---|---|---|
| **`hermes serve`** (desktop backend) | Headless JSON-RPC + WebSocket server. The desktop app's API surface: chat turns, sessions, profiles, plugins REST namespaces | **RANDOM port** each boot (or `:9119` when run headless) | Spawned automatically by the Hermes desktop app; `hermes serve` runs it manually |
| **Messaging gateway** | Platform adapters (WhatsApp/Slack/Telegram…), message routing, session dispatch, delivery, cron. Multiplex mode: ONE gateway process serves ALL profiles (shared listener) | Ephemeral + shared listener | Spawned by `hermes serve`/desktop; `hermes -p default gateway restart` manages it |
| **API server** (`:8642`) | A **platform inside the gateway** (not its own process). OpenAI-compatible HTTP for EXTERNAL frontends (Open WebUI etc.). `/p/<profile>/` prefixes for multiplex profiles | `:8642` | Only when enabled per profile (`API_SERVER_ENABLED=true` in `.env`). **Our app does NOT use it.** |
| **`hermes dashboard`** | The **browser UI** laid on top of the dashboard backend server. `:9119` headless is already up from core start — this command just paints a UI on it | (browser on backend port) | Manual `hermes dashboard`; never needed for our app |

**Rules that follow:**
- Desktop plugin code runs INSIDE the desktop app. All its Hermes traffic (`host.request` RPC, `ctx.rest`) rides the in-app bridge to the backend — **no tokens, no ports, no VBS scripts** for the plugin itself.
- `:9119` hosts the plugin REST namespace (`/api/plugins/lars/...`) — used by our `/stats` chips and `/voice-log`. Headless from core start; standalone browser dashboard is optional tooling.
- No startup scripts, scheduled tasks, or VBS exist on this machine for Hermes anymore. Opening the desktop app is the only "boot". Messaging runs while the desktop app (or a manual `hermes -p default gateway run`) is up.
- After config.yaml changes: `hermes -p default gateway restart`. After `plugin_api.py` changes: **restart the backend server** (full desktop quit + relaunch) — plugin API routes import once at server boot.

## 1. Desktop plugin sandbox — hard constraints

- `plugin.js` imports **only** `@hermes/plugin-sdk`, `react`, `react/jsx-runtime` (plain `jsx()`/`jsxs()`, no JSX loader).
- Disk plugins load via **Blob URL** — no relative file references; images/styles must be data URIs or inline `<style>` tags.
- `host.request(method, params)` = JSON-RPC to the backend; `host.onEvent('*')` = event stream; `pluginCtx.rest(path)` = this plugin's own backend namespace (`/api/plugins/lars/...`) served by `plugins/lars/dashboard/plugin_api.py`.

## 2. The brain: native RPC (verified against `gateway-contract.openrpc.json`)

| Call | Params | Result used |
|---|---|---|
| `session.most_recent` | `{profile}` | `stored_session_id` |
| `session.resume` | `{session_id, profile, lazy:true}` | live `session_id` |
| `session.create` | `{profile, title, source:'voice'}` | ids |
| `prompt.submit` | `{session_id, profile, text, surface:'voice'}` | `{status:'streaming', user_row_id}` |
| `session.interrupt` | `{session_id, profile}` | barge-in |
| `session.close` | `{session_id, profile}` | release turn lease |

Events consumed: `message.delta` / `message.interim` (deltas → chunker → TTS), `message.complete` (fallback). Other sessions' events filtered by live-id match.

Continuity: adopt the focused `lars2` session if one is open (`host.state.focusedSessionProfile` / `focusedStoredSessionId`), else resume most recent, else create. Stale ids recreated on resume failure. `session.close` per finished turn.

Note: `message.delta` streaming to the desktop is **unconditional** — it is NOT gated by the `streaming:` config block (that switch only governs messaging-platform live-edit previews in the gateway).

## 3. The lars2 profile (verified working)

`%LOCALAPPDATA%\hermes\profiles\lars2\`:

- `config.yaml` — `model:` = `gpt-oss-120b`, `provider: custom`, `base_url: https://api.cerebras.ai/v1`, `api_mode: chat_completions`, `reasoning_effort: low`, `context_length: 256000`. NO api_key lines here — the key lives only in `.env`.
- `.env` — `CEREBRAS_API_KEY=csk-…` (**the only holder of this secret**; rotate after beta).
- Skills list heavily trimmed (`skills.disabled`) to keep voice turns small.

Config-split rule (how the Hermes UI writes it too): **config.yaml = behavior/model settings; .env = secrets; profile files override root files.** Root `.env` should carry only the default-profile keys (OpenRouter) — nothing profile-specific.

**Future lars2 revamp (pending):** further trim so a voice turn stays sub-10k input tokens (a full-toolset prompt once hit ~25k); short SOUL.md (≤3 spoken sentences, plain text); confirm TTFB stays ≈ direct Cerebras (~0.5 s).

## 4. plugin.js map (~1135 lines)

- `CFG` — every tuning knob in one block (see voice2/README for the table): `SILENCE_MS` (2 s speech-end timeout), `STT_*` levels, `BARGE_*` thresholds, sentence-length mins.
- `PROFILE = 'lars2'`, `TTS_URL = :8000/tts`, `TTS_VOICE = 'jean'` (single constants).
- `diag(src,msg)` — fire-and-forget `pluginCtx.rest('/voice-log', {method:'POST', body:{src,level,msg}})` → appends one JSON line to `~\AppData\Local\hermes\plugins\lars\voice-events.log`, **hard-capped at the last 100 entries** (the cap IS the pruning). Agents read the file directly; external debug via `GET /api/plugins/lars/voice-log` (needs the dashboard session token only for curl use — the plugin itself needs no token).
- Voice engine (`createVoiceLink`): mic → RMS VAD (~21 ms polls) → capture → 16-bit WAV → POST `:8107/transcribe` → `submitTurn` (RPC) → `message.delta` → sentence chunker → Pocket TTS streamed WAV via Web Audio → barge-in (energy threshold + `session.interrupt`) / re-arm button.
- `makeChunker` / `cleanForSpeech` — streaming sentence cuts + speech-safe text.
- `JarvisMic` — floating reactor, state glow (`deaf|hot|user|lars`), re-arm.
- `LarsPage` — 7 Div pages, staggered expandables, ctx.storage persistence.
- `register()` — ONE voice-link instance (survives nav), event wiring, sidebar + ⌘K.

## 5. Testing & debugging

1. `node --check plugin.js` / `python -m py_compile voice2/stt_local.py` after edits.
2. Typed path: type → reply streams with TTS.
3. Voice path: arm → speak → user text once → streamed spoken reply.
4. Barge-in: arm, let a long answer start, say "stop" loudly → `barge-in` event + `session.interrupt`.
5. STT `len=0`: read `voice2/logs/stt-local.log` (per-request ms/audio-seconds/text, 300 KB tail prune). Our energy-VAD is authoritative — whisper's own Silero VAD is OFF (mic-array channel quirk rejected whole utterances).
6. Voice events: read `~\AppData\Local\hermes\plugins\lars\voice-events.log` (last 100 JSON lines).
7. Gateway: `hermes -p default gateway status`; errors: `hermes logs errors`.
8. Prompt size: `hermes -p lars2 "…" --usage-file out.json`.

## 6. Future: HUD (not built)

Pattern adopted for reference: eadmin2/jarvis_ai `hud_display` (agent tool POSTs media to a voice-server render surface). Ours would be:

1. Agent tool `lars_hud` (tiny plugin tool) POSTs `{title, src|text, position}` to a route in `plugin_api.py` (same door as `/voice-log`).
2. Plugin page subscribes via `ctx.socket('/hud-events')` (SDK's live WS twin of `rest`).
3. Render panels inside the JarvisMic surface. Keep it minimal so voice turns stay fast.
4. Acceptance: prompt → panel visible ≤1 s, zero interference with streaming/barge-in.
