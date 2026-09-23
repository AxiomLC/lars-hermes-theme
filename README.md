# lars-hermes-theme

Documentation + theme assets for styling the **Lars** platform on [Hermes Agent](https://github.com/NousResearch/hermes-agent). Handover repo — everything a fresh machine needs to continue.

**Status:** ⚠️ **DIRECTION PIVOT — 2026-09-23.** The official dashboard is **OUT as the UI base** (see §1a below). Jarvis_ai-type **standalone app** is now the direction. Prior dashboard verification (§2–§3) is historical reference only.

---

## 1a. DIRECTION — standalone jarvis_ai-type app (2026-09-23)

**The official Hermes dashboard is rejected as the Lars UI base.** Reasons, verified on the live dashboard + source:

- **Can't eliminate the core chrome.** The sidebar `<aside id="app-sidebar">` is rendered **unconditionally** in `web/src/App.tsx` (`position:fixed; z-50; width:256px`); `tab.override "/"` only swaps the route *content inside* the outlet, never the shell. No "hide chrome / fullscreen" hook in the SDK or `layoutVariant`.
- **Sidebar minimize is not enough.** There IS a collapse (`hermes-sidebar-collapsed` localStorage key → `collapsed` → `isDesktopCollapsed`, hover `PanelLeftOpen/Close` button), but it only shrinks the rail — the shell stays. Rejected.
- **jarvis_ai validates the pattern** (verified in source): a **standalone app** (own server + own full-page HUD) that **iframes Hermes pages into an overlay**. `openView(name,path){ viewerIframe.src = DASH_PROXY+path; }` → `#viewer` = `position:fixed; inset:0; z-index:40; 90%×90%`, with close + pop-out (`window.open`). That's the *only* way to get "nothing-Hermes full-width" — because it lives **outside** Hermes.

**The Lars direction:**

- **Lars UI = its own standalone app** (jarvis_ai-type), full-width, shows nothing-Hermes.
- **Div pages (Div 1/3/4/6/7) are full-width self-hosted sub-pages** of the app, styled after the master Div 7 home page (specs/layout-master.md). **NOT iframes.**
- **The only iframe** is when a **core Hermes menu item** is opened from the Settings→core Hermes menu — that alone opens the core page in an overlay (same-origin, so no proxy needed).
- **Pages host API-calling boxes** — widgets that pull Hermes core APIs for live data/functions.
**Cost (explicit):** this is **a second localhost process** running alongside Hermes core (jarvis_ai runs its own FastAPI server). Two running processes, by design. This is the price of "nothing-Hermes" and is accepted.

**Server kind (verified in source, 2026-09-23):** `:9119` is **uvicorn hosting a FastAPI app** (`hermes_cli/web_server.py::app`), auto-launched by `Hermes_Dashboard.vbs` in Startup. **Lars = the same kind of server on its own port (`:9120`)** — a second uvicorn+FastAPI app, auto-launched by its own VBS in Startup (same pattern). Two uvicorn processes, both self-start at login. **No proxy needed:** CORS is already open to any localhost origin (`allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"`) and the auth gate is off on loopback — so the Lars app on `:9120` can call `:9119`'s `/api/*` straight from the browser. Only iframe = core Hermes page from Settings→core menu.

**Terminology lock:** "sub-page" = full-width self-hosted Div page in our app. "iframe" = ONLY for core-Hermes menu access. Do not conflate.

---

## 1. The decision (as of 2026-09-21)

Lars = AxiomLC's master agent platform on vanilla Hermes. The UI plan pivoted several times; the **current direction** is:

> **Style the official Hermes web dashboard** (`hermes dashboard`, :9119) with a YAML theme, then add the 5 Div pages as dashboard UI plugins. Zero fork, upgrade-proof, drop-in files.

Rationale: dashboard themes are plain YAML (palette triplet cascades sitewide via `color-mix()`), plugins register tabs/full pages without touching core, and the dashboard is the official surface already showing sessions/skills/jobs/config — the pages the workspace re-implements.

## 2. Online references (canonical)

| Ref | What it covers |
|---|---|
| https://hermes-agent.nousresearch.com/docs/user-guide/features/extending-the-dashboard | **MAIN DOC** — dashboard themes (YAML), UI plugins (tabs/page replacement/shell slots), backend plugins, troubleshooting, cockpit layout |
| https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard | Dashboard itself: ports, flags, machine-level profile switcher, OAuth |
| https://github.com/yakuzadevopps/hermes-dashboard-themes | Community dashboard themes (MIT). Source of **Hinokami Night** — user's preferred base style. Fork this repo's YAML structure for the Lars theme |
| https://hermes-agent.nousresearch.com/docs/user-guide/features/skins | CLI terminal skins only — ruled out for UI work |
| https://github.com/nesquena/hermes-webui/blob/master/THEMES.md | Alternative community webui + its THEMES.md — candidate, not evaluated yet |
| https://github.com/outsourc-e/hermes-workspace | React+TS+Tailwind zero-fork workspace (Assistants=profiles, Tasks kanban, MCP/skills marketplaces). Fork exists: `AxiomLC/lars-hermes2-ui` — currently **parked** (see §4) |
| https://github.com/eadmin2/jarvis_ai | The original voice-HUD project (MIT) — voice pipeline source, **no Hermes styling** |
| https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk | Desktop app plugin SDK (themes/pages/panes) — evaluated, viable fallback |

## 3. Former blocker — SOLVED (2026-09-21, target machine)

The "Desktop IPC bridge is unavailable" screen was **not** a desktop-first design. Root cause, verified in `hermes_cli/main_dashboard.py::_is_electron_packaged_web_dist` (comment at :746 documents the exact failure):

> On Windows, the running desktop app exports `HERMES_WEB_DIST` → its Electron `app.asar.unpacked/dist` into child process environments. A `hermes dashboard` launched from such a shell serves the **desktop frontend**, which needs the Electron IPC bridge → that error in any plain browser.

**Fix (verified):**
```bash
unset HERMES_WEB_DIST
hermes dashboard --no-open        # first clean launch npm-builds web/ (minutes)
```
Symptom check: served `<title>` reads **"Hermes Agent - Dashboard"** (correct SPA). "Hermes Agent" alone = desktop frontend = wrong dist.

Also required: Hermes updated to current main (`hermes update` — the old v0.21.3 bundled frontend had no theme picker/UI-plugin support; built-ins only). Close blocker processes first (desktop-spawned `hermes.exe`, `hermes_kernel` python) or the updater refuses on Windows file locks.

## 3b. Verified 9119 host setup (this machine, 2026-09-21)

- **Desktop app** = Electron UI + headless `hermes serve` backend on a random per-boot loopback port (API only, no web UI — its root literally says "use `hermes dashboard`").
- **Browser dashboard** = separate process: `hermes dashboard`, fixed :9119, coexists with the running desktop app. Same `HERMES_HOME` → theme/plugin files are shared by both.
- Theme install: YAML → `<HERMES_HOME>/dashboard-themes/<name>.yaml`; verify via `GET :9119/api/dashboard/themes`. Plugin: `dashboard/` folder → `<HERMES_HOME>/plugins/<name>/dashboard/`; verify via `GET :9119/api/dashboard/plugins` (unauthenticated).
- **GOTCHA:** user-source dashboard plugins are filtered unless in `plugins.enabled` (`web_routers/dashboard_ui.py`: user plugins require `name in enabled_set`). `hermes plugins enable <name>` does NOT work for dashboard-only plugins — use `hermes config set plugins.enabled '["<name>"]'`.
- Theme switching: **"HERMES TEAL" text button, bottom-left of the sidebar** (there is no palette icon; older builds have no picker at all).
- Working proof installed: `strike-freedom.yaml` (theme) + `strike-freedom-cockpit/` (plugin) from github.com/NousResearch/hermes-example-plugins — the reference implementation for theme+plugin combined reskins (cockpit layout variant, slot-injected sidebar, `tab.override` for page replacement).

## 3c. Yakuza styling direction (lars.yaml)

Base: **Hinokami Night** structure (this repo, `themes/hinokami-night.yaml`) re-skinned Yakuza: **near-black indigo ground, gold primary (irezumi gold), crimson accent** — flame orange dropped per user's palette note. `radius: 0` (angular, not Hinokami's 0.75rem), compact density, `layoutVariant: cockpit` for the plugin sidebar rail. Draft shipped: `themes/lars-yakuza.yaml` — drop into `<HERMES_HOME>/dashboard-themes/`, verify in the theme menu, iterate.

Per-Div accents (cards/pages, set per-division in the plugin config, not the global theme): Div 7 dark blue / Div 1 deep gold / Div 3 pink / Div 4 green / Div 6 yellow.

## 3d. Lars UI format (agreed spec)

- **Home page** = kanban-style board: one card per Division (summary stats), click → full dashboard page per Div.
- Div pages as **dashboard UI plugins** (tabs / `tab.override`), profiles `div7/div1/div3/div4/div6`; a plugin replaces the home page and renders the 5 cards; stock Hermes pages stay reachable (untouched, just themed).
- **Full-width pages; input parity (voice + click/type); all future modules adopt the theme; nothing voice-only.**
- Mic module: styled mic button on the home page wired to Hermes' **native** voice (desktop app ships a working mic; no jarvis pipeline needed — that stays parked as an optional voice upgrade).

**Div 7 Master "Lars"** (dark blue): coordinator + mic; dashboard = consolidated Div stats, social posts/comments out, GI Gross Income (weekly manual entry), truncated crucial comms, n8n flow stats, custom stocks, browser panel on demand. **Div 1 Comms** (deep gold): WhatsApp/FB/social DMs, filtered email, voicemails; Slack = master mobile channel. **Div 3 Records** (pink): central files, address-book DB, client records, invoices, treasury. **Div 4 Coding Production** (green): 2 agents (py/js react-vite/vue builder; n8n specialist into Div 6), graph-DB production, key MCPs. **Div 6 Public CRM** (yellow): n8n marketing flows, marketing DB, graph DBs → Div 1.

## 3e. Next steps

1. Drop `themes/lars-yakuza.yaml` into `dashboard-themes/`, pick it in the theme menu, iterate palette/typography against the live board
2. **Plugin installed:** `plugins/lars/` (forked from `strike-freedom-cockpit`) — replaces home page (`tab.override: "/"`), injects sidebar/header/footer slots. Source in repo, symlinked to `~/.hermes/plugins/lars/` for live editing. Identity renamed: `strike-freedom-cockpit` → `lars`, `hermes agent` → `Lars`.
3. Build Div 7 Master page: 5 Div cards (kanban grid), per-Div tabs, mic button; data via `plugin_api.py` backend routes
4. Corner mic module using Hermes' **native** voice
5. Optional later: tunnel :9119 for phone/second-machine access (dashboard auth gate stays on)

## 4. Evaluated surfaces (superseded ideas — why not)

| Surface | Verdict | Why not the main path |
|---|---|---|
| **jarvis_ai fork** (`AxiomLC/lars-hermes`, local `C:\Users\Admin\lars-hermes`) | **Parked — voice server only** | Standalone HUD web page; does NOT style Hermes core (confirmed). Voice server (whisper STT + Groq/Kokoro TTS hybrid, measured: Groq 1.36s / Kokoro 9.2s, runtime toggle, auto-fallback) is done and verified — keep as optional voice upgrade. Legacy HUD + orb layout superseded |
| **hermes-workspace fork** (`AxiomLC/lars-hermes2-ui`, local `C:\Users\Admin\lars-hermes2-ui`) | **Parked — viable fallback** | Fully bootable (React 19 + TS + Tailwind 4, installed and verified end-to-end on :3000 against live gateway, sessions streaming). Strengths: Assistants=profiles (Div mechanism), Tasks kanban, marketplaces for skills+MCP, 10-theme CSS-var system, best place for custom pages (3D graph, CRM). Why parked: it's a *parallel* UI, not a Hermes restyle — user wants the official surface; and this machine (16GB) strains running all services. LARS-README.md in that repo consolidates the Div specs — still the authoritative UI-requirements doc |
| **Desktop app plugin SDK** (`@hermes/plugin-sdk`) | **Evaluated — fallback** | Verified ~90% paint restylable (11-seed color chain), fonts+terminal first-class, pages can inject own CSS (no sandbox). But: no radii/shadows/spacing in theme format (needs injected-CSS workaround), pages compete with chat in one renderer, and user hasn't chosen the desktop app as the core app |
| **CLI skins** (`/skin`) | Ruled out | Terminal-only colors |

## 5. Environment facts (carry over)

- Windows 10 bare metal, i7-6600U 2c/4t, 16GB — CPU-only, no CUDA
- Hermes home: `C:\Users\Admin\AppData\Local\hermes\` (`.env` holds all keys; native Windows path — some tools wrongly expect `~/.hermes/`)
- Gateway API :8642 autostarts at login; dashboard :9119 must be started manually (`hermes dashboard --port 9119 --host 127.0.0.1 --no-open`)
- Keys in `.env`: OPENROUTER_API_KEY (brain, GLM primary + DeepSeek fallback chain), DEEPINFRA_API_KEY, GROQ_API_KEY, ELEVENLABS_API_KEY (last two = parked voice pipeline)
- Model chain: z-ai/glm-5.3-flash primary → openrouter deepseek-v4-flash → deepinfra deepseek-v4-flash

## 6. Next steps (on the target machine)

1. Verify dashboard boots there (with desktop app running — or standalone, if a build without the IPC requirement)
2. Apply **Hinokami Night** (from yakuzadevopps repo → `~/.hermes/dashboard-themes/`) — user approved the style direction
3. Fork it into **`lars.yaml`**: deep-blue futuristic base (user's palette, replacing flame orange), **radius 0** (Hinokami uses 0.75rem), per-Div accent scheme (Div7 dark blue / Div1 deep gold / Div3 pink / Div4 green / Div6 yellow), futuristic font
4. Add Div pages as dashboard UI plugins (tabs), profiles `div7/div1/div3/div4/div6`
5. Corner mic module using Hermes' **native** voice (Edge TTS configured; desktop app ships wired mic)
6. Div specs: see §4 pointer to `lars-hermes2-ui/LARS-README.md` (or the copy below if that repo is unavailable)

**Div 7 Master "Lars"** (dark blue): coordinator + mic; dashboard = consolidated Div stats, social posts/comments out, GI Gross Income (weekly manual entry), truncated crucial comms, n8n flow stats, custom stocks, browser panel on demand. **Div 1 Comms** (deep gold): WhatsApp/FB/social DMs, filtered email, voicemails; Slack = master mobile channel. **Div 3 Records** (pink): central files, address-book DB, client records, invoices, treasury. **Div 4 Coding Production** (green): 2 agents (py/js react-vite/vue builder; n8n specialist into Div 6), graph-DB production, key MCPs. **Div 6 Public CRM** (yellow): n8n marketing flows, marketing DB, graph DBs → Div 1. Cross-rules: full-width pages, input parity (voice+click/type), all future modules adopt the theme, nothing voice-only.

---

MIT — part of the Lars platform (AxiomLC).
