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
        "uptime_s": int(time.time() - getattr(platform, "_psutil_boot", 0) or 0),
    }

    try:
        import psutil

        out["cpu_percent"] = round(psutil.cpu_percent(interval=None) or 0.0, 1)
        vm = psutil.virtual_memory()
        out["ram_percent"] = round(vm.percent, 1)
        out["ram_used_gb"] = round(vm.used / 2**30, 2)
        out["ram_total_gb"] = round(vm.total / 2**30, 1)
        du = psutil.disk_usage(os.path.expanduser("~"))
        out["disk_percent"] = round(du.percent, 1)
        out["uptime_s"] = int(time.time() - psutil.boot_time())
        proc = psutil.Process()
        out["proc_rss_mb"] = round(proc.memory_info().rss / 2**20, 0)
        out["proc_threads"] = proc.num_threads()
    except Exception as exc:  # degrade, never 500 the rail
        out["ok"] = False
        out["error"] = str(exc)[:200]

    return out
