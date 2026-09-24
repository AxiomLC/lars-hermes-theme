# lars-hermes-theme

The **Lars** platform UI for [Hermes Agent](https://github.com/NousResearch/hermes-agent) — AxiomLC's
master agent command center, split into **Divisions** (Div 7 Master "Lars", plus Comms / Clients /
Records / Production / Debug / Public).

**Status: STABLE TEMPLATE STRUCTURE — decided.** The primary surface is the **Hermes Electron desktop
app** running our **desktop plugin SDK build** (`desktop-plugins/lars/plugin.js`). Development and daily
use happen there. The browser dashboard (`:9119`) stays running for whatever endpoints we need from it;
the browser-plugin half of `plugins/lars/` is kept for no-conflict and is NOT the UI direction.

Build docs that are part of this design, referenced here and living in this repo:

- **Voice/Mic (Div 7)** → [Voice-AI-README.md](Voice-AI-README.md) — the agreed build spec (rev 2):
  local STT/TTS service, AudioWorklet PCM capture, wake word, barge-in, WS protocol, security.
- **Resource monitor/utilities** → [Utility-Monitor-README.md](Utility-Monitor-README.md) — the design
  for a whole-tree Hermes process monitor (replaces the stripped utilities rail; not built yet).

---

## Quick Install (fresh machine, default Hermes install)

### Prerequisites
- Windows 10/11 (tested)
- [Hermes Agent desktop app](https://github.com/NousResearch/hermes-agent) installed (v0.21.4+)
- Git

### 1. Install Hermes (if not already)
```powershell
scoop install hermes-agent
# OR download hermes-setup.exe from GitHub releases
```

### 2. Clone this repo
```powershell
git clone https://github.com/AxiomLC/lars-hermes-theme.git
cd lars-hermes-theme
git checkout main
```

### 3. Install the desktop plugin (one-time)
The plugin lives in `desktop-plugins/lars/plugin.js`. Copy it to Hermes' plugin door:

```powershell
$src = ".\desktop-plugins\lars\plugin.js"
$dst = "$env:LOCALAPPDATA\hermes\desktop-plugins\lars\plugin.js"
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
Copy-Item $src $dst -Force
```

### 4. Reload the desktop plugin (hot reload)
```powershell
# In Hermes desktop: ⌘K → "Reload desktop plugins"
```
You should now see:
- **Sidebar → "Lars"** (order 50, next to Kanban)
- Clicking "Lars" opens the **Div 7 Master page** (resolver to last-visited Div page)
- Left rail: 7 Div menu items (7/1/2/3/4/5/6) with per-Div colors, collapsible to thin strip
- **Rail logo**: real Lars logo above the "Lars" wordmark (embedded data URI — disk plugins load via
  Blob URL, so no relative file references)
- **JarvisMic** reactor (lower-right, floating: no border/background, pulse orb + waveform bars;
  graphic placeholder — real voice per Voice-AI-README.md)
- **Titlebar ownership while on Div 7**: Lars chips replace the app's fixed titlebar clusters
  (MOD/PRF/GW live from `host.state`; CPU/RAM/DISK/CRN are `β` placeholders until the revised
  resource monitor lands)

No Python backend is installed with the current plugin — the previous `plugin_api.py` utilities
backend was removed pending the revised monitor (Utility-Monitor-README.md).

---

## What's in this repo (main)

```
lars-hermes-theme/
├── desktop-plugins/lars/
│   ├── plugin.js                  # DESKTOP PLUGIN (primary) — copy to %LOCALAPPDATA%\hermes\desktop-plugins\lars\
│   └── logo.png                   # Lars logo source (full-res; plugin embeds a downscaled data URI)
├── plugins/lars/
│   ├── dashboard/                 # browser dashboard plugin (legacy, kept for no-conflict — NOT the UI)
│   │   ├── manifest.json
│   │   └── dist/index.js
│   └── theme/strike-freedom.yaml  # dashboard theme (legacy)
├── specs/layout-master.md         # canonical page layout spec
├── themes/hinokami-night.yaml     # desktop theme (dark)
├── themes/lars-yakuza.yaml        # desktop theme (light)
├── Voice-AI-README.md             # voice/mic build spec (rev 2) — agreed design
├── Utility-Monitor-README.md      # resource monitor build spec — agreed design
└── README.md                      # this file
```

**Key file for a fresh install:** `desktop-plugins/lars/plugin.js` (single file, everything else optional).

---

## Architecture (current build)

### Desktop Plugin SDK (primary — the decided surface)
- **Entry point:** `desktop-plugins/lars/plugin.js` (plain ESM, no build, hot reload)
- **Import surface:** `@hermes/plugin-sdk` + `react` + `react/jsx-runtime` **only** — the renderer
  resolves nothing else. External libs must be inlined or moved to the Python backend.
- **Route areas:** 7 `ROUTES_AREA` pages at `/lars`, `/lars-comms`, `/lars-clients`,
  `/lars-records`, `/lars-production`, `/lars-debug`, `/lars-crm`
- **Sidebar nav:** 1 `SIDEBAR_NAV_AREA` row ("Lars", codicon, order 50); ⌘K palette entry too
- **Resolver:** `/lars` restores `lastPage` from `ctx.storage` + per-page state (collapsed menu,
  expanded boxes, scroll position) — nav away and back keeps state
- **Titlebar:** while Div 7 is up, mount-scoped `<Contribute>` into `titleBar.left`/`titleBar.right`
  makes the page own the chrome — app clusters hide, Lars chips render (MOD/PRF/GW live + `β`
  placeholders). Ownership leaves with the page.
- **Voice module:** `JarvisMic` — floating reactor graphic (no border/bg), EXPAND → core Session chat
  (native voice). Real voice per **Voice-AI-README.md**.
- **Theme:** Jarvis palette (cyan `#40f3ff`, amber `#ffb648`, near-black `#02070c`, Chakra Petch +
  JetBrains Mono)

### Ports on this machine (current state)
| What | Port | Notes |
|---|---|---|
| Hermes browser dashboard | **:9119** | running — endpoints available there for whatever we need |
| n8n (automation hub) | **:5678** | bare-metal |
| PostgreSQL | **:5432** | local |
| pgweb | **:8081** | reads `PGPASSWORD` from `.env` |

Hermes home: `C:\Users\q1fre\AppData\Local\hermes\` · Secrets in `.env` (OPENROUTER_API_KEY,
DEEPINFRA_API_KEY, GROQ_API_KEY, ELEVENLABS_API_KEY, N8N_API_KEY, PGPASSWORD, SLACK_*, WHATSAPP_*,
META_ACCESS_TOKEN)

---

## Development workflow

### Edit the desktop plugin
```powershell
# Edit source, save → Hermes hot-reloads (or ⌘K → Reload desktop plugins)
code .\desktop-plugins\lars\plugin.js
# Syntax check, then sync to the live door:
node --check .\desktop-plugins\lars\plugin.js
Copy-Item .\desktop-plugins\lars\plugin.js "$env:LOCALAPPDATA\hermes\desktop-plugins\lars\plugin.js" -Force
```

### Sync to repo
```powershell
git add -A
git commit -m "message"
git push origin machine-2     # develop on machine-2
git push origin main          # promote to main when stable
```

---

## Branching strategy (current)

- **`machine-2`** — development fork; work happens here.
- **`main`** — canonical/stable current; promoted from `machine-2` when stable (forced-update to
  match, since both machines share this repo and `main` was re-based onto the desktop-plugin build).
- Both machines + mobile share this repo; `machine-2` work is the source that `main` mirrors.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Plugin lars failed to load" toast | Check `plugin.js` syntax: `node --check %LOCALAPPDATA%\hermes\desktop-plugins\lars\plugin.js` |
| JarvisMic not animating | `⌘K → Reload desktop plugins`; ensure no JS errors in devtools (F12 in Hermes) |
| Sidebar "Lars" missing | Plugin not loaded; check door path matches exactly `desktop-plugins\lars\plugin.js` |
| Titlebar chips not showing on Div 7 | Reload plugins; chips mount only while a Lars page is up (mount-scoped `titleBar.*`) |
| Theme not applying | Themes register in `THEMES_AREA`; select via ⌘K |

---

## References

| Ref | Covers |
|---|---|
| https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk | **Desktop plugin SDK** — the surface we build on |
| [Voice-AI-README.md](Voice-AI-README.md) | Voice/mic build spec (rev 2) — agreed |
| [Utility-Monitor-README.md](Utility-Monitor-README.md) | Resource monitor build spec — agreed |
| https://github.com/Itsme23476/jarvis-hermes-dashboard | Styling source (local clone in `Git-Repos/`) |
| https://hermes-agent.nousresearch.com/docs/ | Hermes docs (dashboard/desktop/plugins) |

---

MIT — part of the Lars platform (AxiomLC).
