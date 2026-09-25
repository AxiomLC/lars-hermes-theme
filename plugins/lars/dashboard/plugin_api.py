"""Lars utilities backend — live machine stats for the Div 7 utilities rail.

Mounted by the Hermes gateway under /api/plugins/lars (dashboard manifest
declares "api": "plugin_api.py"). Imported ONLY when "lars" is in
plugins.enabled in config.yaml (GHSA-mcfc-hp25-cjv7 boundary).

Routes (psutil, all stdlib-safe fallbacks):
  GET /stats -> cpu %, ram %, disk %, uptime, hostname, python version,
                hermes version, gateway RSS
"""

from fastapi import APIRouter

router = APIRouter()

# Warm the psutil CPU counter at import: cpu_percent(interval=None) returns
# 0.0 on the very first call after process start; seed it once here.
try:
    import psutil as _psutil

    _psutil.cpu_percent(interval=None)
except Exception:
    pass


def _hermes_version() -> str:
    try:
        import importlib.metadata

        return importlib.metadata.version("hermes-agent")
    except Exception:
        return "?"


@router.get("/stats")
async def stats():
    import os
    import platform
    import time

    out = {
        "ok": True,
        "hostname": platform.node() or "?",
        "os": f"{platform.system()} {platform.release()}",
        "python": platform.python_version(),
        "hermes": _hermes_version(),
    }

    try:
        import psutil

        # Hermes gateway process (the one running this code)
        proc = psutil.Process()
        with proc.oneshot():
            # CPU % of THIS process (interval=None = non-blocking, compare to last call)
            cpu_pct = proc.cpu_percent(interval=None)
            out["cpu_percent"] = round(cpu_pct or 0.0, 1)
            # RSS of THIS process
            mem = proc.memory_info()
            out["ram_mb"] = round(mem.rss / 2**20, 1)
            out["ram_percent_of_system"] = round(mem.rss / psutil.virtual_memory().total * 100, 2)
            out["threads"] = proc.num_threads()
            # Process uptime
            out["proc_uptime_s"] = int(time.time() - proc.create_time())
            # Disk: Hermes home directory usage
            hermes_home = os.path.expanduser(r"~\AppData\Local\hermes")
            if os.path.exists(hermes_home):
                du = psutil.disk_usage(hermes_home)
                out["disk_percent"] = round(du.percent, 1)
                out["disk_used_gb"] = round(du.used / 2**30, 2)
                out["disk_total_gb"] = round(du.total / 2**30, 1)
            else:
                out["disk_percent"] = 0.0
    except Exception as exc:
        out["ok"] = False
        out["error"] = str(exc)[:200]

    return out
