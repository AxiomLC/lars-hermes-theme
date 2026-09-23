# lars-hermes-theme

The **Lars** platform UI for [Hermes Agent](https://github.com/NousResearch/hermes-agent) — AxiomLC's
master agent command center, split into **Divisions** (Div 7 Master "Lars", plus Comms / Clients /
Records / Production / Debug / Public).

**Status:** BUILDING. Current direction (2026-09-24): **Lars = desktop-app SDK plugins.** Build in the
desktop app; mirror the same schema in a browser app later. Analysis/history of rejected paths lives
in [`OLD-README.md`](OLD-README.md) — this README is the plan going forward.

---

## 1. Direction: build Lars as desktop SDK plugins

Lars is built as **desktop-app SDK plugins** (`@hermes/plugin-sdk`) against the real Hermes desktop app.

### Why
- **Pages are fully custom.** A `ROUTES_AREA` page is your own React component with **injected CSS (no
  sandbox)** — glows, radius:0 boxes, staggered Div layout, per-Div hues: all achievable. The theme-only
  limits apply to core chrome, not to pages we render.
- **Core chrome is one collapsible left sidebar.** No top bar / top-logo slot to fight.
- **Voice is native.** Desktop ships a working mic; our big-mic / voice wiring rides Hermes' voice
  endpoints (`/api/audio/transcribe`, `/api/audio/speak`, `/api/audio/voice-live/*`).

### Known limits (accepted)
- **Core composer's chat + mic are core-owned** — we don't retrofit them; our chat/mic live in *our*
  pages. The full desktop Session chat (folder tree, terminal, preview, browser, layout) is reached by
  navigation, not embedded.
- **Sidebar**: `SIDEBAR_NAV_AREA` *adds* items below Artifacts; we cannot remove/reorder core items.
- **Every machine runs the same repo + same plugins** so pages render correctly everywhere (host +
  remotes connect over a tunneled port; remotes are NOT browser-rendered).
- **Cost**: this is the ~1.5 GB desktop app (live-measured). The browser build (~176 MB, live) is the
  RAM-cheap mirror (see §6).

### SDK quick facts (verified)
- Doors: `$HERMES_HOME/desktop-plugins/<id>/plugin.js` **or** `$HERMES_HOME/plugins/<id>/desktop/plugin.js`.
- Single ESM file, no build step; hot reload via **⌘K → Reload desktop plugins**.
- Imports: only `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`. Write UI with `jsx('div', …)`, NOT JSX.
- Key areas: `ROUTES_AREA` (full pages), `SIDEBAR_NAV_AREA` (nav rows), `PALETTE_AREA` (⌘K commands),
  `panes`, `statusBar.left/right`, `THEMES_AREA` (DesktopTheme), `TRANSCRIPT_DIRECTIVE_AREA`.
- Navigation: `host.navigate('/my-page')`. Data: `host.request` (gateway JSON-RPC), `host.onEvent`.
- Full human reference: `reference/desktop-plugins.md` in the `hermes-agent` skill, and
  `hermes_cli` desktop-plugin docs.

---

## 2. The build (ordered)

1. **Install the SDK plugin** (door above). Loads within seconds; hot reload on save.
2. **One sidebar item: "Lars"** — `SIDEBAR_NAV_AREA` + `PALETTE_AREA` command + `ROUTES_AREA` page →
   opens the **Div 7 (Lars) custom page**.
3. **Create the 7 Div pages** per the layout in `specs/layout-master.md` (master Div 7 grid: 1 long top
   box, then 4 / 3 / 2; per-Div hues). On OUR pages, the left Lars menu is **collapsible not fully, but
   to a thin strip of just the number text** ("7" "1" "2" "3" "4" "5" "6"), each in its **Div color**.
   Persist the collapsed state.
4. **Div 7 chat/voice (see §3).**
5. **Six Div agents**, one per division, named by full title — e.g. agent **"Public Div 6"**, "Lars Div 7",
   etc. Skill files come later; chat→page navigation wiring figures out later.
6. **Style all pages after `Itsme23476/jarvis-hermes-dashboard`** (local clone:
   `Git-Repos/jarvis-hermes-dashboard`) — its shadow/lighting, fonts, highlights:
   cyan `#40f3ff`, amber `#ffb648`, near-black `#02070c`, glow `0 0 26px rgba(64,243,255,.55)` — in our
   Lars layout.

---

## 3. Div 7 chat / voice module

- **Div 7 page** shows a **custom voice/Mic module (Jarvis-styled), lower right**, to chat with the
  **Lars agent**, plus an **"Expand"** button.
- **"Expand"** navigates to the real desktop **Session chat** (full bells & whistles: folder tree,
  terminal, preview, browser, layout), with the **native mic/voice button there wired into the STT/TTS
  we use for the big mic**.
- **Div 7 hot-mic ("hey Lars")**: optional hot-word listener on page load → on "hey Lars," **streaming
  hands-free mode** (no button): listens → responds **and cuts itself off if it hears the user again
  (barge-in)**. A **toggle disables hot-mic** back to press-to-talk. Runs **only on Div 7**; desktop
  Session chat stays standard voice (no hot-word).
- Voice reference: desktop repo `use-voice-*` hooks + `/api/audio/*` + jarvis voice behavior.

---

## 4. The Divisions (canonical roles)

- **Div 7 Master "Lars"** (dark blue): coordinator + mic; consolidated Div stats; social posts/comments
  out; **GI Gross Income** (weekly manual entry); truncated crucial comms; n8n flow stats; custom stocks;
  browser panel on demand.
- **Div 1 Comms** (deep gold): WhatsApp/FB/social DMs, filtered email, voicemails; Slack = master mobile
  channel.
- **Div 2 Clients** (not-specced) — placeholder "Coming Soon".
- **Div 3 Records** (pink): central files, address-book DB, client records, invoices, treasury.
- **Div 4 Coding Production** (green): 2 agents (py/js react-vite/vue builder; n8n specialist into Div 6),
  graph-DB production, key MCPs.
- **Div 5 Debug** (not-specced) — placeholder "Coming Soon".
- **Div 6 Public CRM** (yellow): n8n marketing flows, marketing DB, graph DBs → Div 1.

**Cross-rules:** full-width pages; input parity (voice + click/type); all future modules adopt the theme;
nothing voice-only.

---

## 5. Page layout (master)

Full canonical spec: **`specs/layout-master.md`**. Skeleton for every Lars page:
- **No top menu / no top header.** Page owns the viewport.
- **Far right top**: logo placeholder + "**Lars**" + "personal Hermes genius". Far upper right: menu
  left/right toggle + light/dark toggle.
- **Left rail**: custom vertical menu — 7 Lars / 1 Comms / 2 Clients / 3 Records / 4 Production /
  5 Debug / 6 Public / Settings. No border lines (faint shadow). **Settings expands the full core Hermes
  menu + plugins** (smaller font), nav normally.
- **Chat dock**: opposite lower corner, auto-flips with menu side; defaults to that page's agent;
  3 modes — off / 25% of screen width / full (see §3 for the desktop-build override).
- **Utility strip**: thin (~1/15 width) above chat; CPU, RAM, agent threads, live crons, Hermes + Lars
  versions, time-to-first-token, tokens/day. No title; coolest-styled status chips.
- **Content region**: staggered flex cards, some expand on click; page scrolls.

**Theme mapping:** dark = Lars Jarvis, light = Lars Yakuza.

---

## 6. Browser-app build (second, to follow)

A **standalone browser app** mirroring the same schema (jarvis_ai-validated pattern): own full-width HUD,
no Hermes chrome; same Div pages/cards; the only iframe = opening a core Hermes page from the Settings
menu. Served by **uvicorn + FastAPI on `:9120`** (same stack as `:9119`), auto-launched by its own VBS in
Startup. **No proxy needed** — CORS is already open to localhost origins
(`allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"`) and the auth gate is off on loopback.
Runs as a **second process** next to Hermes core (the accepted cost of "nothing-Hermes"). RAM-cheap
(~176 MB class vs desktop ~1.5 GB).

---

## 7. Integration stack / ports / environment (this machine)

| What | Where | Port |
|---|---|---|
| **Hermes browser dashboard** | auto-launched via `Startup\Hermes_Dashboard.vbs` → `hermes dashboard --no-open --isolated --host 127.0.0.1 --port 9119` (removes `HERMES_WEB_DIST`) | **:9119** |
| **Gateway API** | auto-starts at login (`Startup\Hermes_Gateway.vbs` → `gateway-service\`) | **:8642** |
| **n8n** (automation hub) | bare-metal, self-started via own bat | **:5678** |
| **PostgreSQL** | local server | **:5432** |
| **pgweb** (Postgres table viewer in browser) | `bin\pgweb-start.bat` (reads `PGPASSWORD` from hermes `.env`) | **:8082** (changed from :8081) |
| **Docker Desktop** (SAAS org-board containers) | self-started | **:8080** |
| **Hermes home** | `C:\Users\q1fre\AppData\Local\hermes\` (config.yaml, `.env`, dashboard-service, plugins) | — |

**Port notes:** Hermes itself does NOT use 8080/8081. pgweb moved **8081 → 8082** so an app that wants
8081 is free. 8080 is claimed by Docker/WSL relay when running.

**Secrets in `.env`:** OPENROUTER_API_KEY (primary brain), DEEPINFRA_API_KEY, GROQ_API_KEY,
ELEVENLABS_API_KEY (voice), N8N_API_KEY, PGPASSWORD, SLACK_*, WHATSAPP_*, META_ACCESS_TOKEN.

**Model chain:** z-ai/glm-5.3-flash primary → openrouter deepseek-v4-flash → deepinfra deepseek-v4-flash.

---

## 8. Online references

| Ref | Covers |
|---|---|
| https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk | **Desktop plugin SDK** — the surface we build on |
| https://github.com/Itsme23476/jarvis-hermes-dashboard | Styling source (local clone in `Git-Repos/`) |
| https://github.com/eadmin2/jarvis_ai | Voice-HUD + iframe-overlay pattern reference (standalone build) |
| https://hermes-agent.nousresearch.com/docs/ | Hermes docs (dashboard/desktop/plugins) |

---

## 9. Open questions (parked)

- Exact voice wiring detail: big-mic → STT/TTS (endpoints exist: `/api/audio/transcribe`, `/api/audio/speak`, `/api/audio/voice-live/*`).
- Agent→page navigation from chat (tool or slash commands) — later.
- Skill files per Div agent — later.

---

MIT — part of the Lars platform (AxiomLC).