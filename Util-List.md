Here's the complete list of **resource/utility monitor params exposed at `:8642`** (gateway port) via `/api/status` and `/api/system/stats`:

---

### `/api/status` (Public, no auth on loopback)

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Hermes version (e.g. `0.21.3`) |
| `release_date` | string | Release date |
| `config_version` | int | Current config schema version |
| `latest_config_version` | int | Latest available config version |
| `can_update_hermes` | bool | Whether auto-update is available |
| `gateway_running` | bool | Is gateway process alive |
| `gateway_state` | string | `running`, `stopped`, `starting`, `degraded`, `startup_failed` |
| `gateway_platforms` | object | Per-platform state: `{ "telegram": { "state": "connected", ... }, "slack": {...} }` |
| `gateway_exit_reason` | string/null | Why gateway stopped (if not clean) |
| `gateway_updated_at` | string/null | RFC3339 timestamp of last heartbeat |
| `gateway_heartbeat_stale_s` | number/null | Seconds since last heartbeat (if PID alive but stamp stale) |
| `gateway_shared_with` | array/null | Profiles served by multiplexed gateway |
| `active_agents` | int | Active agent turns in flight |
| `gateway_busy` | bool | NAS lifecycle gate (in-flight turns > 0) |
| `gateway_drainable` | bool | Can safely drain/shutdown |
| `restart_drain_timeout` | number | Seconds to wait for drain on restart |
| `active_sessions` | int | Sessions with activity < 5 min |
| `auth_required` | bool | Is auth gate engaged |
| `auth_providers` | array | Registered auth providers |
| `auth_flows` | array | `["cookie"]` or `["cookie", "native_pkce"]` |
| `nous_session_valid` | string | `valid`, `expired`, `unknown` |
| `install_id` | string/null | Per-install UUID |
| `components` | object | Sub-component health: `gateway`, `dashboard`, `storage`, `platforms` |
| `overall` | string | `ok` or `degraded` (rollup) |
| `memory` | object | `{ "pressure": "low\|medium\|high\|critical", ... }` |
| `disk` | object | `{ "pressure": "low\|medium\|high\|critical", ... }` |
| `fts_rebuild` | object/null | Full-text search rebuild progress |
| `profiles` | array | Profile names + gateway_mode |
| `gateway_mode` | string | `multiplex` or `standalone` |

**If no auth gate (loopback):**
| `hermes_home` | string | Absolute path |
| `config_path` | string | Absolute path |
| `env_path` | string | Absolute path |
| `gateway_pid` | int/null | Gateway process PID |
| `gateway_health_url` | string | Internal health endpoint |
| `gateways` | array | Per-gateway topology (host, port, profiles) |

---

### `/api/system/stats` (Public, no auth on loopback)

| Field | Type | Description |
|-------|------|-------------|
| `system` | string | OS (Windows/Linux/Darwin) |
| `release` | string | Kernel release |
| `version` | string | Kernel version |
| `platform` | string | Platform label |
| `arch` | string | `x64`, `arm64` |
| `hostname` | string | Machine hostname |
| `python_version` | string | e.g. `3.11.16` |
| `python_impl` | string | `CPython` |
| `hermes_version` | string | Hermes version |
| `cpu_count` | int | Logical cores |
| `memory` | object | `{ total, available, used, percent }` (if psutil) |
| `disk` | object | `{ total, used, free, percent }` on HERMES_HOME |
| `cpu_percent` | number | Current CPU % |
| `load_avg` | array | 1/5/15 min load (Unix) |
| `uptime_seconds` | int | System uptime |
| `process` | object | `{ pid, rss, create_time, num_threads }` |
| `psutil` | bool | Whether psutil enriched the response |

---

### Cron endpoints (auth-gated)
| Endpoint | Description |
|----------|-------------|
| `GET /api/cron/jobs` | List all cron jobs (per profile) |
| `GET /api/cron/jobs/{id}/runs` | Recent runs for a job |

---

### Curator endpoints (auth-gated)
| Endpoint | Description |
|----------|-------------|
| `GET /api/curator` | Enabled, paused, interval, last_run_at, thresholds |

---

### Learning graph (auth-gated)
| Endpoint | Description |
|----------|-------------|
| `GET /api/learning/graph` | Skill/memory dependency graph |

---

### Portal (auth-gated)
| Endpoint | Description |
|----------|-------------|
| `GET /api/portal` | Nous auth status, subscription features, provider |

---

**External apps/plugins read these via HTTP GET to `http://127.0.0.1:8642/api/status` (or with `?profile=<name>` for per-profile scope).**
