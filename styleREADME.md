# styleREADME — Lars visual style guide

> Where the look comes from, what's already applied, and how to grow it.

## The donor

**Emulate (in parts):** [Itsme23476/jarvis-hermes-dashboard](https://github.com/Itsme23476/jarvis-hermes-dashboard) — `ui/styles.css` is the source of truth for palette/fonts/glass panels.

Secondary reference (not adopted): [eadmin2/jarvis_ai](https://github.com/eadmin2/jarvis_ai) `server/hud/index.html` — same genre (Orbitron/Rajdhani, `#00e5ff` cyan, cut-corner `clip-path` chamfers, boot sequence). Its ideas may be borrowed later (scanning panels, boot sequence), but the palette/fonts we use are the ITSME repo's.

## Palette already in the codebase

`const JV` at the top of `plugin.js` (~line 71) — lifted from the donor repo and used as inline-style values throughout:

| Token | Value | Use |
|---|---|---|
| `JV.bg` | `#02070c` | deep navy background |
| `JV.bg2` | `#061722` | secondary background |
| `JV.panel` | `rgba(5,18,28,.64)` | translucent panel fill |
| `JV.edge` | `rgba(57,232,255,.24)` | hairline cyan border |
| `JV.edge2` | `rgba(57,232,255,.55)` | bright border (hover/active) |
| `JV.cyan` | `#40f3ff` | primary accent |
| `JV.cyan2` | `#16b8d4` | dim accent |
| `JV.ink` | `#e8fbff` | main text |
| `JV.mut` | `#83b7c4` | secondary text |
| `JV.dim` | `#47717f` | faint labels |
| `JV.amber` | `#ffb648` | warnings/highlight (our accent bloodline) |
| `JV.red` | `#ff5d6c` | errors |
| `JV.green` | `#39f5a6` | ok/user-mic |
| `JV.violet` | `#a884ff` | Lars-speaking glow |
| `JV.disp` | `"Chakra Petch"` | display font (Google Fonts) |
| `JV.mono` | `"JetBrains Mono"` | labels/mono (Google Fonts) |

## Design DNA to keep copying

- **Floating boxes, no hard shadows** — translucent glass fills, 1px hairline cyan borders, generous border-radii (donor uses 18–28px), soft outer/inner glow via faint `rgba(64,243,255,.08)` box-shadows. Barge-in-era "box shouldn't have a shadow" = donor glass style.
- **Type**: Chakra Petch for display, JetBrains Mono for small-caps labels with big letter-spacing (`.2em`+), small font sizes (9–13px).
- **Ambiance** (optional, cheap): faint 54px blueprint grid + slow drifting scanline band + blurred ambient blobs (see donor `.grid-bg`, `.scan`, `.a1/.a2`).
- **Reactor orb**: center orb + concentric dashed rings + 2–3 colored comet arcs (cyan/amber/violet) counter-rotating SVG/canvas, big letter-spaced state word in the middle. State colors: standby cyan, listening green, Lars-speaking violet, error red.
- **History**: the Utility Strip (`plugins/lars/dashboard/dist/index.js`) already borrowed only the hairline borders (`rgba(64,200,255,…)`) — future work should bring it fully onto `JV`.

## How styling lives in plugin.js (single file)

All styling is inside `plugin.js` — that's our standard and it stays:

1. **`JV` token object** (top of file) — the single palette/font source. NEW COLORS GO HERE ONLY. Reference as `JV.edge`, `JV.cyan`, etc.
2. **Inline `style:` objects** on `jsx()` elements — the plugin sandbox loads via Blob URL so separate `.css` files don't resolve.
3. **Injected `<style>` blocks** (`micCSS` in `JarvisMic`, plus page-level ones) — used only for what inline styles can't do: `@keyframes` animations (ljSpin / ljReverse / ljOrbPulse hues). Keep token colors interpolated from `JV` into these template strings.

No external CSS-in-JS library, no separate stylesheet files, no `window.require`. If styling ever feels too big for one file, the sanctioned expansion is *more token entries + a larger injected `<style>` string* — still inside `plugin.js`.

## The JarvisMic orb — Reactor spec (as built, Oct 2026)

The voice module (`JarvisMic` in `plugin.js`) renders a donor-style reactor orb
—all inline SVG, ~104px, drag handle, no npm/Canvas deps:

- **Layers (out → in)**: `r=21` dashed comet arcs (3 speeds/directions — cyan
  ghosted, the 12 s one is deliberately near-invisible; it is the pulse
  surrogate) → `r=20.6` faint solid base ring → **24-tick compass dial at
  r=23–24 (`23.0–24.0`), every 3rd tick dark red/black `#8b1f2b`, rest cyan**
  → dashed slow rings at r=19 / r=15 → **hollow core ring `#ljCore` at r=5.4,
  stroke-width 0.45, cyan @ 0.25 opacity** (NO solid disc, NO idle pulse).
- **Audio-reactive halos** (`ljHaloU`/`ljHaloL`, r=15 = the first dot-ring):
  radial gradients — **green for the user, violet for Lars** — opacity 0 when
  idle. Driven every 60 ms by a **window-level `setInterval`** in `JarvisMic`
  that reads the engine's live `voiceLink.level` / `voiceLink.levelWho`
  (written each ~21 ms VAD poll in `createVoiceLink`). Idle → both halos off,
  core static. The interval is **versioned** (`window._ljPulseVoice !==
  voiceLink` → restart): plugin reload must not leave it listening to a dead
  engine, or pulsing silently dies.
- **Core pulse**: scales 1 → 1.3 with the real mic envelope (user) or a
  synthetic `sin(t/220)` speaking pattern (Lars — his audio isn't in the mic
  analyser). SVG `transform` attribute scales from the origin, so the loop
  uses `translate(24 24) scale(s) translate(-24 -24)` to stay centered.
- **Label**: `L.A.R.S` letter-spaced, ±ghosted (`rgba(232,251,255,0.29)`),
  absolutely centered in the orb, pointerEvents none.
- **Voice box**: no border, no backdrop blur, no shadow — fully transparent in
  both collapsed and TYPE modes (the inner transcript/type boxes keep hairline
  `JV.edge` edges for readability). Panel = `82vh` tall, auto-scrolls to the
  newest entry on every transcript bump (id `ljTranscript`). User speech text
  in the transcript renders in Utility-cyan `rgba(64,200,255,1)`.

## Tuning knobs (orb + voice panel)

All in `plugin.js`, `JarvisMic` / `CFG`:

| Knob | Where | Default | Effect |
|---|---|---|---|
| Halo reach | `r` on `ljHaloU`/`ljHaloL` | 15 | glow extent (first dot-ring) |
| Level sensitivity | `* 6` in the poll's `L.level` | 6 | mic→glow gain |
| Core pulse depth | `0.3` in `setScale(1 + …)` | 0.3 | core ±30% |
| Lars pulse speed | `/ 220` in the sine | 220 ms | speaking-pulse rate |
| L.A.R.S visibility | `0.29` in the label color | 0.29 | ghost text opacity |
| Halo brightness | `0.25 + 0.7*lvl` / `0.15 + 0.75*p` | — | glow floor/ceiling |

## Rules for future edits

- Colors/fonts/spacings: only via `JV` (or a `THEME` block next to it if it grows). No new hard-coded hex values in components.
- Visuals are frozen (user-locked): matching the donor is incremental — never break JarvisMic layout, Div pages, or buttons.
- Fonts load from Google Fonts (`@import` or `<link>` preserved in injected style); plugin is Electron-hosted so remote fonts are fine.
