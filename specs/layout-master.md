# Lars Layout — Master Page Structure (v1, hardened 2026-09-22)

Canonical page skeleton for ALL Lars display pages. Every page = this shell, with
pages differing only in the card content region (staggered cards).

## Global chrome (every page)

- **NO top menu, NO top header.** The page owns the full viewport; only the slim
  core Hermes brand/nav surround is inherited (and themed) from the host.
- **Far right, top**: logo image placeholder + "**Lars**" + smaller "personal
  Hermes genius" underneath.
- **Far upper right**: two toggles —
  - **Menu left/right** (flips the vertical menu rail to the opposite side)
  - **Light/dark theme** — dark = Lars Jarvis, light = Lars Yakuza (right now)

## The menu (custom, vertical)

Items: **7 Lars · 1 Comms · 2 Clients · 3 Records · 4 Production · 5 Debug ·
6 Public · Settings**

- **2 Clients** and **5 Debug** are NOT yet specced → placeholder pages "Coming Soon".
- Others are placeholders too **except Div 7** (under active build); 1/3/4/6 are specced.
- **No border lines on the menu** — but a faint shadow may suggest barely-visible
  borders.
- **Settings** item: clicking expands *below it* (smaller font) revealing the
  ENTIRE core Hermes menu + plugins section. It operates normally — opens any
  chosen Hermes function. (This is how all core UI stays reachable from a Lars page.)

## Chat box (agent dock)

- Sits in the **opposite lower corner** from the menu rail.
- **Toggles automatically** when the top menu-toggle is flipped.
- **Defaults to the agent profile for that page** — e.g. Div 7 = "Lars" (will get
  his own skill set + instructs later).
- **Three modes** (toggle):
  1. **Off** — tiny corner button; full flex for the page content.
  2. **25% of screen WIDTH** (not height) — a tall, readable chat column. Shows:
     name (Lars), model choice, token/char count, last sessions scrolling down,
     chat box, user-type box, mini mic graphic (with talking/listening graphics).
  3. **Full screen** — becomes the default main view like the core Hermes desktop
     app: option buttons across top, sidebar/bottom-bar toggles, layout editor,
     terminal, preview, browser, folder tree — the whole works. Full Hermes with
     Lars styling + a "small"/"minimized" toggle back down.

## Utility monitor strip

- Thin strip, **above the Chat box** (opposite side from the menu).
- **Very thin — ~1/15 screen width** (a narrow vertical-ish sliver of stat chips).
- Shows params/stats, **no title** (obvious what they are), truncated,
  small font, abbreviations. **Coloring: base it on the coolest styling seen for
  these status strips in existing monitor/HUD modules** (not fixed green/orange).
- Candidates: local CPU, RAM, active agent threads, live crons, Hermes version,
  Lars version, avg time-to-first-token, total token usage/day. Tweak later.
- Steal styling from existing monitor modules others have built.

## Page content region

- Staggered cards (this is where pages differ; Div 7 = more + smaller cards
  because of its data dump; others more broad).
- Cards are **flex layout, the page just scrolls down**.
- Some cards **expand on click** — to full or ~2x bigger, pushing others aside/down.

### Div 7 placeholder grid (first pass, 10 boxes)

- **10 placeholder boxes**, staggered: 1 long across the top, then a row of 4,
  then 3, then 2 at the bottom (1 + 4 + 3 + 2 = 10).
- **Top long box** = slight yellow extra hue/glow (Div 1 Comms).
- **Next 5** = slight hue color of their Divs (per §3c accents: Div 7 dark blue,
  Div 1 deep gold, Div 3 pink, Div 4 green, Div 6 yellow).
- First ~6 boxes get placeholder text = their Div name ("Comms", etc.).
- **Last 4** = neutral placeholders labelled just "A" / "B" / "C" / "D".

## Theme mapping

- Dark = **Lars Jarvis** (lars-jarvis.yaml)
- Light = **Lars Yakuza** (lars-yakuza.yaml)