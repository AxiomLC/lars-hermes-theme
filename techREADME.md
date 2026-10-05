# techREADME — Lars plugin technical reference

> For future maintainers (human or AI). Read [README.md](README.md) first for the
> user-facing story; [voice2/README.md](voice2/README.md) covers the voice backend
> (endpoints, env, knobs, log policy — not repeated here);
> [Utility-Monitor.md](Utility-Monitor.md) is the not-yet-built resource monitor spec.

## 1. Hard constraints of the Hermes desktop plugin sandbox

Learned the hard way; do not violate:

- `plugin.js` imports **only** `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`.
  Anything else (npm libs, `window.require`, node builtins) does not resolve.
- No JSX-loader: write `jsx()`/`jsxs()` calls straight out of the JSX transform.
- Disk plugins load via **Blob URL** — relative file references (images, workers,
  child files) don't resolve. Use data URIs or HTTPS.
- Styles must be injected (single `<style>` tag) into the page; pages are
  sandbox-free so this is allowed.
- `host.request(method, params)` = gateway JSON-RPC; `host.onEvent('*', cb)` =
  gateway event stream. Session/profile continuity comes through these, not
  through the OpenAI-compatible API server.

## 2. The brain: native RPC contract (verified against `gateway-contract.openrpc.json`)

| Call | Params | Result used |
|---|---|---|
| `session.most_recent` | `{profile}` | `stored_session_id` |
| `session.resume` | `{session_id, profile, lazy:true}` | live `session_id` |
| `session.create` | `{profile, title, source:'voice'}` | ids |
| `prompt.submit` | `{session_id, profile, text, surface:'voice'}` | `{status:'streaming', user_row_id}` |
| `session.interrupt` | `{session_id, profile}` | — (barge-in) |
| `session.close` | `{session_id, profile}` | — (release lease per turn) |

Events (consumed in `L.handleGatewayEvent`): `message.delta` / `message.interim`
(text deltas → chunker → TTS), `message.complete` (fallback full text when deltas
missed), session id match against `L.liveId` so other sessions' events are ignored.

Continuity: adopt the desktop's focused `lars2` session when open
(`host.state.focusedSessionProfile` / `focusedStoredSessionId`), else resume most
recent, else create. Stale ids recreated on resume failure. `session.close` per
finished turn avoids fighting the desktop composer for the chat lease.

Key setting on the plugin side: `PROFILE = 'lars2'` (line ~99 of plugin.js).

## 3. The lars2 profile — current wiring + the Cerebras streaming setup

Location `%LOCALAPPDATA%\hermes\profiles\lars2\`. Current (verified working):

- `config.yaml`:
  ```yaml
  model:
    default: gpt-oss-120b
    provider: custom
    base_url: https://api.cerebras.ai/v1
    api_mode: chat_completions
    api_key: csk-…            # rotate after beta!
    reasoning effort: low
    context_length: 256000
  custom_providers: [name: Api.cerebras.ai, base_url: …, models_discovered: true]
  ```
- `.env`: `CEREBRAS_API_KEY`, `API_SERVER_ENABLED=true`, `API_SERVER_PORT=8642`,
  `API_SERVER_KEY=<strong>` (only so the shared API-server platform starts; external
  tools can hit `:8642/p/<profile>/v1/…` with the profile key).
- Multiplex: ONE host gateway (default profile) serves all profiles
  (`gateway.multiplex_profiles: true`, `auto_multiplex_migration: true`). lars2
  inherits everything else — do NOT create per-profile gateways.

### Future "revamped lars2" plan (pending)

1. **Streaming always-on** — `model.api_mode: chat_completions`, deltas flow
   through `message.delta` fast enough that TTFB ≈ direct Cerebras (measured 0.47 s
   direct vs comparable via gateway).
2. **Shorter skills list** — a bare math prompt once logged ~25.2k input tokens
   with the full toolset. Either disable more skills in lars2's config
   (`skills.disabled`) or restrict `platform_toolsets` so turns stay small and
   fast. Goal: sub-10k input tokens per voice turn.
3. **Short SOUL.md** for lars2 (spoken replies, ≤3 sentences, plain text).
4. **HUD wiring** — see §6.

## 4. plugin.js function map (voice + shell, ~1135 lines)

- `diag(src,msg)` — fire-and-forget POST to the gateway-mounted plugin backend
  `POST /voice-log` (via `pluginCtx.rest`) → one JSON line appended to
  `...\hermes\plugins\lars\voice-events.log`, hard-capped at the last 100
  entries. Readable by Hermes agents as a plain file, or via
  `GET /api/plugins/lars/voice-log` (loopback, `X-Hermes-Session-Token`).
  (Replaced the old `:1122 /api/diag` mirror; that helper server is deleted.)
- `CFG` — all tuning knobs (see voice2/README table). Edit here, reload plugin.
- `makeChunker(pushSentence)` — streaming text → sentence/first-clause cuts
  (first sentence ≥8 chars or comma ≥40, then sentences ≥24 chars).
- `cleanForSpeech(t)` — strips markdown/URLs/brackets before TTS.
- `createVoiceLink(stateAtom, onText)` — the whole voice engine:
  - playback: `cancelPlayback`, `speakOne` (Pocket `:8000/tts`, streamed WAV
    frames → Web Audio, header parse for rate), `drain`/`speak` (gapless queue),
    `schedule` (shared `nextAt` timeline).
  - brain: `ensureSession` (§2), `submitTurn` (chunks streamed reply),
    `handleGatewayEvent`, `finishTurn` (+5 s finish guard), `bargeIn`.
  - STT mic engine: `startListening` (getUserMedia → Analyser RMS VAD poll ~21 ms
    → Float32 capture w/ pre-roll, commit after `SILENCE_MS` → OfflineAudioContext
    resample 48k→16k → 16-bit WAV → POST :8107 → text → submitTurn) and
    `stopListening`. Safety: 20 s utterance cap; capture disabled while Lars
    speaks (barge channel only).
  - `maybeBarge` — legacy word-based barge check (kept, currently unused).
- `JarvisMic` — floating reactor (pure CSS animation), state glow
  (`deaf|hot|user|lars`), mic on tint, EXPAND → core session chat, re-arm.
- `LarsPage` — 7 Div pages, staggered expandables, state persistence via ctx.storage.
- `register()` — atoms, ONE `createVoiceLink` instance (survives nav),
  `host.onEvent('*') → handleGatewayEvent`, sidebar row + ⌘K entry.

## 5. Testing & debugging

- Syntax: `node --check plugin.js` (and `py_compile stt_local.py`).
- End-to-end typed: type in panel → transcript logs user once, speech starts.
- End-to-end voice: arm → speak → single user entry → streamed TTS.
- Barge-in: arm, wait for a long answer, say "stop" loudly; expect `barge-in` in
  `lars-diag.log`, TTS buffers dropped (`L.gen++`), `session.interrupt` fired.
- STT empty result: read `voice2/logs/stt-local.log`; `len=0` means capture was
  noise (raise `STT_ON_LEVEL`) — whisper VAD is off by design, our energy VAD rules.
- Diag one-stop: `curl -H "X-Hermes-Session-Token: <token>" http://127.0.0.1:9119/api/plugins/lars/voice-log`
  — or just read `~\AppData\Local\hermes\plugins\lars\voice-events.log` directly
  (last 100 JSON lines `{t, src, level, msg}`; the cap IS the pruning).
- Legacy per-request STT log: `voice2/logs/stt-local.log` (ms / audio-seconds /
  text per request, 300 KB tail-pruned). `voice2-frames.log` was deleted with
  the `:1122` helper — raw frames now visible in Hermes `hermes logs --since 5m
  --include-data` if ever needed.
- Prompt size check: `hermes -p lars2 <prompt>` with `--usage-file` to see input tokens.

### Live-verified mounting notes (2026-10-05)

- Plugin backend routes are imported **once at dashboard startup** — after
  editing `plugins/lars/dashboard/plugin_api.py`, restart the dashboard
  (`hermes dashboard --stop` + relaunch) or the new routes 404.
- Route door tested end-to-end: POST `{src,msg}` → `{ok:true,n}`; GET returns
  `{file, entries}`.
- Dashboard session token lives in the user env
  `HERMES_DASHBOARD_SESSION_TOKEN` (somewhat stale copies possible in detached
  processes).

## 6. Future build: HUD (lars_hud tool)

Spec (pocket build doc §7): a gateway-side `lars_hud` tool the lars2 agent can call
to push HUD events (weather, tasks, tickers) into the floating JarvisMic surface:

1. Gateway-side: the plugin plugin backend collects HUD POSTs (add a stub route in
   `plugins/lars/dashboard/plugin_api.py`, same door as `/voice-log`).
2. Add SSE/WebSocket channel (`ctx.socket('/hud-events')` is the sanctioned live twin) → the plugin subscribes at mount.
3. lars2 profile gives the agent a tiny skill/`lars_hud`-tool that POSTs to that route.
4. HUD boxes render inside JarvisMic panel per potential paths in the expanded
   mic UI. Keep prompt/tools minimal so the voice loop stays fast.
5. Acceptance: HUD event from prompt → visible under mic within 1 s, no interference
   with streaming turns (barge-in/log isolation intact).
