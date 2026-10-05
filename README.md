# lars-hermes-theme

> **Beta 2.0 — streaming Lars voice chat.** Jarvis-style Divisions UI for the
> [Hermes Agent](https://github.com/NousResearch/hermes-agent) desktop app, now with a
> working voice loop: local Whisper STT → `lars2` profile brain (Cerebras `gpt-oss-120b`,
> streaming) → Pocket TTS spoken live with barge-in.

**This README covers install + run only.** Deep technical reference (library settings,
function map, dynamic logs, debug procedures, future HUD build) lives in
[**techREADME.md**](techREADME.md) and [voice2/README.md](voice2/README.md).

---

## What Lars does

The Lars plugin is the master command center for the Hermes desktop app — seven
"Division" pages under one shell:

- **Div 7 Exec (`/lars`)** — home; staggered click-to-expand boxes (stats, comms,
  n8n, stocks, browser panel…), the floating **JarvisMic** voice module, and the
  voice **transcript + type box** (panel mode).
- **Div 1 Comms** — messaging triage surface (Slack/WhatsApp/email land in the
  Hermes gateway; Lars pages read/send via the profile agent).
- **Div 2 Clients · Div 3 Records · Div 6 CRM** — client runbooks, record lookup,
  CRM prompts routed to the profile agent.
- **Div 4 Code Prod · Div 5 Debug** — production/debug prompts for coding agents.
- **Titlebar ownership** while a Lars page is up: left = Lars logo/name; right =
  desktop params (`Lars model`, `Ver`, `OS`, `Gateway`, `Agents`, `Sessions`,
  `Uptime`) + resources (`CPU`, `RAM`, `HDD`) from the gateway-mounted
  `plugin_api.py` (`/stats`).

Voice chat (Beta 2.0): hot-mic with 2 s silence commit, streamed LLM reply spoken
sentence-by-sentence via Pocket TTS, **barge-in** ("stop" or just talk over it) and
a **re-arm** button on the JarvisMic. Voice turns run in the same native `lars2`
session as typed turns (voice ⇄ typed continuity).

## Stack

| Layer | Thing | Where |
|---|---|---|
| UI | Hermes desktop plugin (`plugin.js`, plain ESM, `@hermes/plugin-sdk` + react only) | this repo |
| Brain | Hermes profile `lars2` — Cerebras `gpt-oss-120b`, reasoning low, streaming | `%LOCALAPPDATA%\hermes\profiles\lars2\` |
| STT | `voice2/stt_local.py` — faster-whisper `base`, CPU, Flask, `:8107` | `voice2/` |
| TTS | Pocket TTS (`uvx pocket-tts serve`), voice `alba`, `:8000` | external pip tool |
| Transport | Native gateway RPC (`prompt.submit`/`host.onEvent`) — **no API server in the voice loop** | Hermes |
| Diag/TLS helper | `voice2/server.js`, `:1122` (diag mirror + optional SSE bridge) | `voice2/` |

## Install

Prereqs: Windows 10/11, [Hermes Agent](https://github.com/NousResearch/hermes-agent)
(v0.21.4+), Git, Python 3.11+ (`pip install faster-whisper flask`), Node ≥20.6 for
voice2 server.

```powershell
# 1. Hermes (if not already)
scoop install hermes-agent

# 2. Clone + install the plugin
git clone https://github.com/AxiomLC/lars-hermes-theme.git
cd lars-hermes-theme
New-Item -ItemType Directory -Force -Path "$env:LOCALAPPDATA\hermes\desktop-plugins\lars" | Out-Null
Copy-Item .\plugin.js "$env:LOCALAPPDATA\hermes\desktop-plugins\lars\plugin.js" -Force
```

Then create the **`lars2` profile** in the Hermes desktop UI (Settings → profiles):
set model/provider to `custom` + `https://api.cerebras.ai/v1` + `gpt-oss-120b`,
reasoning `low`, put your `CEREBRAS_API_KEY` in the profile `.env`, and trim its
skills list (see `techREADME.md` §lars2 profile).

## Run

1. **Gateway** — start Hermes desktop (it spawns the multiplex gateway that serves
   every profile, incl. `lars2`). CLI check: `hermes -p default gateway status`.
2. **TTS** — `uvx pocket-tts serve` (keep detached).
3. **STT + helper** — `cd voice2 && start.bat` (STT detached on `:8107`, server on `:1122`).
4. **Plugin** — click **Lars** in the sidebar; mic button arms voice.

Port map: `:9119` dashboard · `:8642` API server (external automation; not the voice
loop) · `:5678` n8n · `:5432` PostgreSQL · `:1122` voice2 · `:8107` STT · `:8000` TTS.

## Repo layout

```
lars-hermes-theme/
├── plugin.js                # the desktop plugin — pages, JarvisMic, whole voice engine
├── plugins/lars/            # browser-dashboard half (legacy) + plugin_api.py stats backend
├── specs/Hermes_Gateway.vbs # boot helper (gateway + stats)
├── themes/                  # desktop themes (hinokami-night, lars-yakuza)
└── voice2/                  # Beta 2.0 voice module — see voice2/README.md
    ├── server.js  stt_local.py  start.bat  .env
    ├── public/              # standalone tester page for the voice loop
    └── logs/                # self-pruning runtime logs
```

## Troubleshooting (quick)

| Symptom | Fix |
|---|---|
| Plugin fails to load | `node --check plugin.js`; reload via ⌘K → Reload desktop plugins |
| `stt: network` / no transcripts | STT server down → `curl :8107/health`; restart via `start.bat` |
| Transcript shows your text twice | stale build — reload plugins (fixed in Beta 2.0) |
| Barge-in never fires | turn **arm** on before Lars speaks; if still silent, check mic level vs `BARGE_RMS` in `plugin.js` CFG |
| TTS `Failed to fetch` | Pocket TTS not running → `uvx pocket-tts serve` |
| Typed path dead | gateway down → `hermes -p default gateway restart` |

MIT — part of the Lars platform (AxiomLC).
