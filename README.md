# lars-hermes-theme (machine-2 branch)

The **Lars** platform UI for [Hermes Agent](https://github.com/NousResearch/hermes-agent) — AxiomLC's
master agent command center, split into **Divisions** (Div 7 Master "Lars", plus Comms / Clients /
Records / Production / Debug / Public).

**This branch (`machine-2`)** is the development fork from the 2nd machine. The `main` branch lives on
the primary machine. This branch contains the **desktop plugin SDK build** (primary) with the browser
app documented as the deferred mirror.

---

## Quick Install (fresh machine, default Hermes install)

### Prerequisites
- Windows 10/11 (tested)
- [Hermes Agent desktop app](https://github.com/NousResearch/hermes-agent) installed (v0.21.4+)
- Python 3.11+ (Hermes bundles its own; used for gateway + plugin backends)
- Git

### 1. Install Hermes (if not already)
```powershell
# Official installer or scoop/chocolatey
scoop install hermes-agent
# OR download hermes-setup.exe from GitHub releases
```

### 2. Clone this repo
```powershell
git clone https://github.com/AxiomLC/lars-hermes-theme.git
cd lars-hermes-theme
git checkout machine-2
```

### 3. Install the desktop plugin (one-time)
The desktop plugin lives in `desktop-plugins/lars/plugin.js`. Copy it to Hermes' plugin door:

```powershell
# Hermest home on Windows:
$env:LOCALAPPDATA\hermes\desktop-plugins\lars\plugin.js
```

**Copy command:**
```powershell
$src = ".\desktop-plugins\lars\plugin.js"
$dst = "$env:LOCALAPPDATA\hermes\desktop-plugins\lars\plugin.js"
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
Copy-Item $src $dst -Force
```

### 4. Install the Python backend (for live CPU/RAM/Disk/Cron stats)
The backend lives in `plugins/lars/dashboard/plugin_api.py` and is mounted by the gateway at
`/api/plugins/lars/stats`. It requires the `lars` plugin to be **enabled in `config.yaml`**.

**Copy command:**
```powershell
$srcDir = ".\plugins\lars\dashboard"
$dstDir = "$env:LOCALAPPDATA\hermes\plugins\lars\dashboard"
New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
Copy-Item "$srcDir\*" $dstDir -Force -Recurse
```

**Enable in config.yaml (required for Python backend):**
```powershell
# Edit C:\Users\<you>\AppData\Local\hermes\config.yaml
# Find plugins.enabled and ensure "lars" is listed:
# plugins:
#   enabled: ["lars", "strike-freedom-cockpit"]
```

Or via CLI:
```powershell
hermes config set plugins.enabled '["lars", "strike-freedom-cockpit"]'
```

### 5. Restart Hermes (gateway) once
The gateway imports `plugin_api.py` at startup. After step 4, **restart Hermes completely**
(close app, kill any `gateway-service` processes, relaunch). After this, the Utilities rail
will show live CPU/RAM/Disk/Uptime/Cron data on its 5s/15s polls.

### 6. Reload the desktop plugin (hot reload)
```powershell
# In Hermes desktop: ⌘K → "Reload desktop plugins"
```
You should now see:
- **Sidebar → "Lars"** (order 50, next to Kanban)
- Clicking "Lars" opens the **Div 7 Master page** (resolver to last-visited Div page)
- Left rail: 7 Div menu items (7 / 1 / 2 / 3 / 4 / 5 / 6) with per-Div colors, collapsible to thin strip
- Right side: **JarvisMic** reactor module (lower-right, cyan/amber rings + pulsing orb + waveform bars)
- **Utilities rail** (thin vertical, ~64px): cpu%, ram%, disk%, up(h), rel, sess, gw, model, profile, ctx%, crn

---

## What's in this repo (machine-2)

```
lars-hermes-theme/
├── desktop-plugins/lars/plugin.js     # DESKTOP PLUGIN (primary) — copy to %LOCALAPPDATA%\hermes\desktop-plugins\lars\
├── plugins/lars/
│   ├── dashboard/
│   │   ├── manifest.json              # declares "api": "plugin_api.py"
│   │   ├── plugin_api.py              # Python backend: /stats (psutil), mounted at /api/plugins/lars/
│   │   └── dist/index.js              # browser dashboard plugin (legacy, kept for no-conflict)
│   ├── theme/strike-freedom.yaml      # dashboard theme (legacy, kept for no-conflict)
│   └── README.md                      # browser plugin docs (legacy)
├── specs/layout-master.md             # canonical page layout spec
├── themes/hinokami-night.yaml         # desktop theme (dark)
├── themes/lars-yakuza.yaml            # desktop theme (light)
├── OLD-README.md                      # archived history (dashboard pivots)
└── README.md                          # this file
```

**Key files for a fresh install:** `desktop-plugins/lars/plugin.js` + `plugins/lars/dashboard/` (manifest + plugin_api.py)

---

## Architecture (machine-2 build)

### Desktop Plugin SDK (primary)
- **Entry point:** `desktop-plugins/lars/plugin.js` (plain ESM, no build, hot reload)
- **Import surface:** `@hermes/plugin-sdk` + `react` + `react/jsx-runtime` only
- **Route areas:** 7 `ROUTES_AREA` pages at `/lars`, `/lars-comms`, `/lars-clients`, `/lars-records`, `/lars-production`, `/lars-debug`, `/lars-crm`
- **Sidebar nav:** 1 `SIDEBAR_NAV_AREA` row ("Lars", codicon `LayoutDashboard`, order 50)
- **Resolver:** `/lars` restores `lastPage` from `ctx.storage` + per-page state (collapsed menu, expanded boxes, scroll position)
- **Utilities rail:** live data from `host.status()` + `host.state.*` + `ctx.rest('/stats')` (Python backend) + `host.request('cron.manage')`
- **Voice module:** `JarvisMic` — self-contained SVG reactor (counter-rotating rings, pulsing orb, 7 waveform bars, EXPAND button → core Session chat)
- **Theme:** Jarvis palette (cyan `#40f3ff`, amber `#ffb648`, near-black `#02070c`, Chakra Petch + JetBrains Mono) — injected CSS, no sandbox

### Browser App (deferred mirror)
- Kept in `plugins/lars/dashboard/` (manifest + `dist/index.js`) — **web dashboard plugin only**
- Purpose: folder/naming/loading conflict avoidance with desktop plugin
- Direction: standalone FastAPI/uvicorn on `:9120` (mirror schema later, not built yet)

### Theme Assets
- `themes/hinokami-night.yaml` — dark DesktopTheme (registers in `THEMES_AREA`)
- `themes/lars-yakuza.yaml` — light DesktopTheme
- Applied via `useTheme().setTheme('hinokami-night')` or palette command

---

## Machine-2 specifics (this environment)

| What | Where | Port |
|---|---|---|
| **Hermes browser dashboard** | `Startup\Hermes_Dashboard.vbs` → `hermes dashboard --no-open --isolated --host 127.0.0.1 --port 9119` | **:9119** |
| **Gateway API** | `Startup\Hermes_Gateway.vbs` → `gateway-service\` | **:8642** |
| **n8n** (automation hub) | bare-metal bat | **:5678** |
| **PostgreSQL** | local server | **:5432** |
| **pgweb** | `bin\pgweb-start.bat` (reads `PGPASSWORD` from `.env`) | **:8082** |
| **Docker Desktop** | self-started | **:8080** |
| **Hermes home** | `C:\Users\q1fre\AppData\Local\hermes\` | — |

**Secrets in `.env`:** OPENROUTER_API_KEY, DEEPINFRA_API_KEY, GROQ_API_KEY, ELEVENLABS_API_KEY, N8N_API_KEY, PGPASSWORD, SLACK_*, WHATSAPP_*, META_ACCESS_TOKEN

**Model chain:** z-ai/glm-5.3-flash primary → openrouter deepseek-v4-flash → deepinfra deepseek-v4-flash

---

## Development workflow (this machine)

### Edit the desktop plugin
```powershell
# Edit the source
code .\desktop-plugins\lars\plugin.js
# Save → Hermes hot-reloads automatically (or ⌘K → Reload desktop plugins)
```

### Edit the Python backend
```powershell
# Edit source
code .\plugins\lars\dashboard\plugin_api.py
# Copy to live (gateway imports at startup only)
Copy-Item .\plugins\lars\dashboard\plugin_api.py "$env:LOCALAPPDATA\hermes\plugins\lars\dashboard\plugin_api.py" -Force
# Restart Hermes (gateway) to pick up changes
```

### Sync back to repo
```powershell
git add -A
git commit -m "message"
git push origin machine-2
```

### Pull to primary machine (main branch)
```powershell
# On primary machine:
git fetch origin
git checkout main
git merge origin/machine-2  # or cherry-pick specific commits
# Re-run install steps 3-4 if new files added
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Plugin lars failed to load" toast | Check `plugin.js` syntax: `node --check %LOCALAPPDATA%\hermes\desktop-plugins\lars\plugin.js` |
| Utilities rail shows `β` for cpu/ram/disk/up | Python backend not loaded: verify `lars` in `plugins.enabled` in `config.yaml`, restart Hermes |
| `crn` shows `0` / `β` | No cron jobs defined yet (normal); or `cron.manage` RPC failed — check gateway logs |
| JarvisMic not animating | `⌘K → Reload desktop plugins`; ensure no JS errors in devtools (F12 in Hermes) |
| Sidebar "Lars" missing | Plugin not loaded; check door path matches exactly `desktop-plugins/lars/plugin.js` |
| Theme not applying | Themes register in `THEMES_AREA`; select via ⌘K → "Theme: hinokami-night" |

---

## Branching strategy

- **`main`** — owned by primary machine; stable, installable
- **`machine-2`** — this machine's development fork; push here, merge/cherry-pick to `main` when ready
- **Never force-push `main`** — only fast-forward or PR from `machine-2`

---

## References

| Ref | Covers |
|---|---|
| https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk | **Desktop plugin SDK** — the surface we build on |
| https://github.com/Itsme23476/jarvis-hermes-dashboard | Styling source (local clone in `Git-Repos/`) |
| https://github.com/eadmin2/jarvis_ai | Voice-HUD + iframe-overlay pattern reference (standalone build) |
| https://hermes-agent.nousresearch.com/docs/ | Hermes docs (dashboard/desktop/plugins) |

---

MIT — part of the Lars platform (AxiomLC).