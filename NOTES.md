# NOTES — Lars working notes (informal, ours)

Informal companion to README. Not user-facing. Everything decided/stated about structure,
references, styling, and what we're stealing from whom. Update this instead of the README
when a decision changes.

---

## Confirmed direction (as of 2026-09-24)

- **Lars runs as a desktop plugin SDK build** in the Hermes **Electron desktop app**. That's the
  primary surface — we develop AND use it there. Decided fact, not up for re-litigation.
- Browser dashboard `:9119` stays running for anything we need endpoint-wise (it's up — the
  API there is usable), but it is **not** the UI direction. Its plugin half stays as
  no-conflict legacy only.
- This is an informal repo. No product promises, no install polish — working notes + current code.
- Branching: develop on `machine-2`, promote to `main` by making main mirror machine-2. Both
  machines + mobile share this repo.

---

## The 7 Divisions (structure)

Menu order: **7 · 1 · 2 · 3 · 4 · 5 · 6 · Settings**

| Div | Name | Color | Spec |
|---|---|---|---|
| 7 | Master "Lars" | dark blue `#1e3a8a` | coordinator + mic; dashboard = consolidated Div stats, social posts/comments out, **GI Gross Income** (weekly manual entry), truncated crucial comms, **n8n flow stats**, custom stocks, browser panel on demand |
| 1 | Comms | deep gold `#b8860b` (chip `#d4a017`) | WhatsApp/FB/social DMs, filtered email, voicemails; **Slack = master mobile channel** |
| 2 | Clients | slate `#64748b` | **coming soon** (not specced) |
| 3 | Records | pink `#db2777` (chip `#ec4899`) | central files, address-book DB, client records, invoices, treasury |
| 4 | Coding Production | green `#16a34a` (chip `#22c55e`) | 2 agents (py/js react-vite/vue builder; n8n specialist into Div 6), graph-DB production, key MCPs |
| 5 | Debug | violet `#a855f7` | **coming soon** (not specced) |
| 6 | Public CRM | yellow `#eab308` | n8n marketing flows, marketing DB, graph DBs → feed Div 1 |

Cross-rules (all pages): **full-width pages; input parity (voice + click/type); every future
module adopts the theme; nothing voice-only.**

Div 7 profile = "Lars" (will get his own skill set + instructs later). Div 7 = the template:
staggered click-to-expand boxes, mic module lower-right, utilities rail right edge.

---

## Layout (canonical skeleton — see specs/layout-master.md v1)

- **NO top menu / NO top header** on Lars pages; page owns the viewport, host chrome themed only.
- Far right top: logo + "Lars" + "personal Hermes genius" underneath.
- Two toggles (far upper right): **menu left/right flip**, **light/dark theme**
  (dark = Lars Jarvis, light = Lars Yakuza).
- Custom vertical menu: 7 Lars · 1 Comms · 2 Clients · 3 Records · 4 Production · 5 Debug ·
  6 Public · Settings. 2 & 5 → "Coming Soon". No border lines on menu (faint shadow ok).
  **Settings expands below it revealing the ENTIRE core Hermes menu** (smaller font) — that's how
  all core UI stays reachable from a Lars page.
- **Chat dock**: opposite lower corner from menu rail; auto-flips with the menu toggle; defaults
  to the page's agent profile; 3 modes — off (tiny corner button) / **25% screen width** tall
  column (name, model, token/char count, last sessions, chat box, type box, mini mic graphic) /
  **full screen** (becomes full Hermes main view — option buttons, toggles, layout editor,
  terminal, preview, browser, folder tree; with a small/minimized toggle back down).
- **Utility strip**: thin, above the chat dock, ~1/15 screen width, stat chips, no title, small
  font, truncated abbreviations. Candidates: local CPU, RAM, active agent threads, live crons,
  Hermes version, Lars version, avg time-to-first-token, total tokens/day. Tweak later.
- **Page content**: staggered cards, flex layout, page scrolls down; some cards expand on click
  (full or ~2x, pushing others aside).
- Div 7 placeholder grid (first pass): 10 boxes — 1 long across top (COM abbreviation, slight
  yellow hue), row of 4, row of 3, row of 2 (1+4+3+2). Div-colored hues on ~6, last 4 labelled
  just A/B/C/D.

---

## Styling ideas (agreed + in debate)

- **Jarvis palette** (theft — Itsme23476/jarvis-hermes-dashboard, ui/styles.css):
  cyan `#40f3ff`, cyan2 `#16b8d4`, amber `#ffb648`, near-black `#02070c` / `#061722`,
  panel `rgba(5,18,28,.64)`, ink `#e8fbff`, mut `#83b7c4`, dim `#47717f`, red `#ff5d6c`,
  green `#39f5a6`. Fonts: Chakra Petch (display) + JetBrains Mono. **Dark theme = Lars Jarvis.**
- **Yakuza** (lars-yakuza.yaml, Hinokami Night structure re-skinned): near-black indigo ground,
  irezumi gold primary (c8a03c family), crimson accent `#b91c1c`, `radius: 0` (angular),
  compact density, cockpit layout variant. Fonts: Rajdhani/Oswald + JetBrains Mono.
  **Light theme = Lars Yakuza (for now).**
- Per-Div accents = thin glowing edge treatment on cards/menu chips, not filled recolor
  (2 of 4 edges on menu chips; "div edge" via boxShadow, NOT background).
- Utility strip color: steal the coolest status-strip styling from existing monitor/HUD modules
  — not fixed green/orange.
- Radius 0 is the angular aesthetic (Yakuza). Jarvis orb/rings keep the cyan glow.

---

## Reference list (canonical)

| Ref | What it's for |
|---|---|
| https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk | **Desktop plugin SDK** — THE surface we build on |
| https://hermes-agent.nousresearch.com/docs/user-guide/features/extending-the-dashboard | Dashboard themes (YAML) + UI plugins (browser surface — legacy ref) |
| https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard | Dashboard ports/flags (we run :9119 for endpoints) |
| https://github.com/yakuzadevopps/hermes-dashboard-themes | Community themes — source of **Hinokami Night** (our Yakuza base structure) |
| https://github.com/Itsme23476/jarvis-hermes-dashboard | **Styling theft source** — palette, fonts, monitor-HUD look (local clone in Git-Repos/) |
| https://github.com/eadmin2/jarvis_ai | Voice-HUD / reactor visuals + iframe-overlay pattern (standalone build; voice server parked) |
| https://github.com/outsourc-e/hermes-workspace  (+ our fork `AxiomLC/lars-hermes2-ui`) | PARKED parallel UI — best Div-spec/requirements notes live in its LARS-README.md; not the surface |
| https://github.com/nesquena/hermes-webui/blob/master/THEMES.md | Alternative community webui (unused candidate) |
| https://hermes-agent.nousresearch.com/docs/user-guide/features/skins | CLI skins — ruled out (terminal only) |
| https://hermes-agent.nousresearch.com/docs/ | Hermes docs general |

---

## Theft map (what we steal from whom)

- **Palette/fonts/monitor-look** → Itsme23476/jarvis-hermes-dashboard (cyan/amber on near-black,
  Chakra Petch + JetBrains Mono, glows).
- **Theme skeleton (radius-0 angular Yakuza)** → yakuzadevopps/hermes-dashboard-themes
  (Hinokami Night) re-skinned: gold + crimson instead of flame orange.
- **Voice/orb reactor visuals** → eadmin2/jarvis_ai (rings, pulsing orb, waveform bars).
  Voice SERVER stays parked; desktop mic is native.
- **Utility strip styling** → "coolest monitor/HUD status strips others built" (TBD, sweep repos).
- **Div specs / requirements wording** → lars-hermes2-ui/LARS-README.md (still the most complete
  UI-requirements text).

---

## Current build state (desktop plugin, plugins→desktop-plugins/lars/plugin.js)

- 7 ROUTES_AREA pages (`/lars`, `-comms`, `-clients`, `-records`, `-production`, `-debug`,
  `-crm`); sidebar nav row order 50; ⌘K palette entry; `/lars` = resolver to last-visited page.
- Per-page persisted state: collapsed menu, expanded boxes, scroll (ctx.storage).
- Real Lars logo embeds as data URI (Blob URL load → no relative file refs). Full-res at
  desktop-plugins/lars/logo.png.
- JarvisMic: floating reactor graphic (border/bg removed), EXPAND → core Sessions chat (native
  voice). Voice build spec = Voice-AI-README.md (rev 2).
- Titlebar: on Div 7, mount-scoped Contribute into titleBar.left/right → page owns the chrome,
  app clusters hide, Lars chips show (MOD/PRF/GW live + CPU/RAM/DISK/CRN β placeholders).
- Utilities rail + plugin_api.py removed pending revised monitor (Utility-Monitor-README.md).
- :9119 dashboard running (endpoints usable). n8n :5678, Postgres :5432, pgweb :8081.
- Hermes home: C:\Users\q1fre\AppData\Local\hermes\; secrets in .env.

### Gotchas learned (write these down, they bit us)

- Plugins load as plain ESM from Blob URL → only `@hermes/plugin-sdk`, `react`,
  `react/jsx-runtime` resolve; NO npm/local/CDN files; no relative asset refs.
- React 19 jsx contract: `jsx(type, config, maybeKey)` — children ALWAYS in `config.children`,
  NEVER positional (positional = key → crash "Cannot read properties of undefined (reading 'key')").
  Keys go INSIDE config (`key:` in the object), not as a `key` prop.
- Area values are the CONSTANTS' literals: ROUTES_AREA=`'routes'`, SIDEBAR_NAV_AREA=`'sidebar.nav'`.
- Desktop reconcile skips junctioned plugin folders (isDirectory filter) → copy the file into
  `desktop-plugins/<id>/` directly (standalone, auto-enables).
- Live dev loop: edit repo file → `node --check` → copy to live door → ⌘K reload (or restart).
- Python backends (`plugin_api.py`) load at gateway start and need `plugins.enabled` + full
  restart; the standalone desktop-plugins copy won't host a backend.

---

## Voice (Div 7 mic) — what we agreed (full: Voice-AI-README.md)

Constraint: plugin page CANNOT touch core Hermes STT/TTS/mic. So: local voice service (:8000),
AudioWorklet Int16 PCM capture (NOT MediaRecorder), sherpa-onnx STT + keyword "hey lars"
(no training), streaming local TTS per sentence (drop Edge TTS — cloud), barge-in,
5-state machine (HOT_MIC → LISTENING 60s → CAPTURING → PROCESSING → SPEAKING → back to
LISTENING), page owns mic + pauses on route-leave, Origin + per-boot token on the WS.
Bridge to real Lars session = the seam to pin first (token streaming; :9119 CORS / gateway RPC;
reconnect). State/memory = free via the one session SESSIONS shows.

## Utilities monitor — what we agreed (full: Utility-Monitor-README.md)

Whole-Hermes process family (gateway + Electron + dashboard + subagents), NOT one PID.
Our plan: extend plugin_api.py with psutil process_iter family scan (backend-side), telemetry
via SDK atoms (host.status / cron.manage / host.state) + :9119 where it makes sense
(remote/Cloudflare door). CORS on :9119 from the desktop renderer = verify.
