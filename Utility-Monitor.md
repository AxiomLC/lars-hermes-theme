# Lars Utilities & Resource Monitor — concise spec

> Folded 2026-10-05 from `Utility-Monitor-README.md` + `Util-List.md` (both deleted).
> Status: design agreed, not built yet (utilities rail was stripped 2026-09-24).

## Goal

Whole-tree Hermes resource monitor embedded in the Lars plugin page(s): all
`*hermes*` process instances (gateway, dashboard, CLI, subagents) plus app
telemetry (sessions, crons, tokens) in one panel that feeds the Div-7 titlebar
chips and future HUD boxes.

## Data sources (two legs)

### Leg 1 — Hermes telemetry over HTTP (no auth on loopback)

`GET http://127.0.0.1:8642/api/status` (whole install; add `?profile=<name>` for per-profile) and
`GET http://127.0.0.1:8642/api/system/stats`. Key fields:

- `/api/status`: `version`, `gateway_state` (running|stopped|starting|degraded|startup_failed),
  `gateway_platforms` per-platform state, `gateway_shared_with` (multiplex profiles),
  `active_agents`, `gateway_busy`, `active_sessions` (<5 min activity),
  `gateway_mode` (`multiplex`|`standalone`), `profiles`, auth fields,
  `memory.pressure` / `disk.pressure` (low|medium|high|critical),
  `components` (gateway/dashboard/storage/platforms), `overall` (ok|degraded).
  No-auth-on-loopback extras: `hermes_home`, `gateway_pid`, `gateways[]` topology.
- `/api/system/stats`: `cpu_percent`, `cpu_count`, `memory {total,used,percent}`,
  `disk` on HERMES_HOME, `uptime_seconds`, `python_version`, `hermes_version`,
  `process {pid, rss, num_threads}`, `psutil` (enriched or not).

Auth-gated (skip for the monitor): `/api/cron/jobs`, `/api/cron/jobs/{id}/runs`,
`/api/curator`, `/api/learning/graph`, `/api/portal`.

### Leg 2 — OS process footprint (Windows PowerShell, every 3–5 s)

```powershell
$p = Get-Process | Where-Object { $_.ProcessName -like '*hermes*' }
if ($p) { $m = ($p | Measure-Object -Property WorkingSet64 -Sum).Sum / 1MB
          "$([math]::Round($m))|$(($p | Measure-Object).Count)" } else { "0|0" }
```

Do NOT query a single static PID — misses subagents. Sum across the whole
`*hermes*` family.

## Implementation notes (plugin constraints!)

The desktop plugin renderer resolves **only** `@hermes/plugin-sdk`, `react`,
`react/jsx-runtime` — no `window.require('child_process')`, no raw JSX files. So:

- Leg 1 (HTTP telemetry) can be fetched **directly from the plugin page** with
  `fetch` (loopback is unauthenticated) — same pattern as the diag helper.
- Leg 2 (PowerShell) must run **behind the gateway-mounted Python backend**
  `plugins/lars/dashboard/plugin_api.py` (already serves `/stats` for the
  titlebar chips) — add a `/processes` route there returning `{ram_mb, pids}`;
  plugin reads via `pluginCtx.rest('/stats')` pattern. Never shell out from the
  renderer.
- Poll cycle: telemetry 4–5 s; process footprint 3–5 s; pin both behind one
  interval + aborted-signal fetch() to avoid request pileups.

## UI shape (Jarvis theme)

Two-panel monitor box matching `JV` palette (cyan telemetry panel, violet
process panel): sessions/crons/tokens + status pill on the left; Hermes PIDs,
RAM sum, CPU% on the right. Rendered inside the Div-7 "Div Stats" expandable
box (or its own page later).
