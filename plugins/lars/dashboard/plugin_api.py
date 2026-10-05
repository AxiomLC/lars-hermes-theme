"""Lars utilities backend — live machine stats for the Div 7 utilities rail.

Mounted by the Hermes gateway when the lars plugin is loaded (dashboard
manifest declares "api": "plugin_api.py").

Routes:
  GET /stats -> {cpu_percent, ram_mb, hdd_mb, hermes, os, proc_uptime_s, lars_model}
"""

from fastapi import APIRouter, Request

router = APIRouter()

# ---- voice log (dynamic, self-pruning, last ~100 entries) ----
# The plugin's voice engine POSTs one JSON line per status/error here via
# ctx.rest('/voice-log'); anything (agent or human) reads the tail via GET.
# Kept in Hermes home so the gateway/agents reach it by file path too.
import json as _json
import os
import time as _time

VOICE_LOG_MAX = 100                      # keep the last N entries
VOICE_LOG_PATH = os.path.expanduser(r"~\AppData\Local\hermes\plugins\lars\voice-events.log")

def _read_voice_log():
    try:
        with open(VOICE_LOG_PATH, encoding="utf-8") as f:
            return [ln for ln in f.read().splitlines() if ln.strip()]
    except FileNotFoundError:
        return []
    except Exception:
        return []

@router.post("/voice-log")
async def voice_log_post(request: Request):
    try:
        payload = await request.json()
        entry = {
            "t": _time.strftime("%Y-%m-%dT%H:%M:%S"),
            "src": str(payload.get("src") or "page")[:40],
            "level": str(payload.get("level") or "info")[:12],
            "msg": str(payload.get("msg") or "")[:500],
        }
    except Exception as exc:
        return {"ok": False, "error": f"bad payload: {exc}"[:200]}
    try:
        os.makedirs(os.path.dirname(VOICE_LOG_PATH), exist_ok=True)
        lines = _read_voice_log()
        lines.append(_json.dumps(entry, ensure_ascii=False))
        if len(lines) > VOICE_LOG_MAX:
            lines = lines[-VOICE_LOG_MAX:]
        with open(VOICE_LOG_PATH, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        return {"ok": True, "n": len(lines)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:200]}

@router.get("/voice-log")
async def voice_log_get():
    return {"ok": True, "file": VOICE_LOG_PATH, "entries": _read_voice_log()}

# Prime cpu_percent() at import so first API call returns real data, not 0.0
try:
    import psutil as _psutil
    for _p in _psutil.process_iter(["pid", "name"]):
        try:
            _pn = (_p.info["name"] or "").lower()
            if _pn == "hermes.exe" or _pn == "hermes":
                _p.cpu_percent(interval=None)
        except Exception:
            pass
except Exception:
    pass


# Seed HDD cache at import so first /stats call isn't slow
_home_size_cache = (0.0, 0)


def _prime_cache():
    import os
    import time
    home = os.path.expanduser(r"~\AppData\Local\hermes")
    total = 0
    try:
        for dirpath, dirnames, files in os.walk(home):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(dirpath, f))
                except Exception:
                    pass
            if total > 10 * 2 ** 30:
                break
    except Exception:
        pass
    global _home_size_cache
    _home_size_cache = (round(total / 2 ** 20, 1), time.time())


_prime_cache()


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

    out: dict[str, object] = {
        "ok": True,
        "hostname": platform.node() or "?",
        "os": f"{platform.system()} {platform.release()}",
        "python": platform.python_version(),
        "hermes": _hermes_version(),
    }

    try:
        import psutil

        hermes_procs = []
        for p in psutil.process_iter(["pid", "name", "cmdline", "exe"]):
            try:
                pinfo = p.info
                name = (pinfo["name"] or "").lower()
                if name == "hermes.exe" or name == "hermes":
                    hermes_procs.append(p)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        out["hermes_proc_count"] = len(hermes_procs)

        # RAM: sum RSS across all Hermes.exe, rounded
        total_rss = 0
        for p in hermes_procs:
            try:
                total_rss += p.memory_info().rss
            except Exception:
                pass
        out["ram_mb"] = round(total_rss / 2 ** 20)

        # CPU: sum across Hermes.exe, normalize by core count
        cpu_count = psutil.cpu_count(logical=True) or 1
        total_cpu = 0.0
        for p in hermes_procs:
            try:
                total_cpu += p.cpu_percent(interval=None)
            except Exception:
                pass
        out["cpu_percent"] = round(total_cpu / cpu_count, 1)

        # Gateway process uptime
        out["proc_uptime_s"] = int(time.time() - psutil.Process().create_time())

        # HDD = Hermes install folder size (MB), cached 60s
        out["hdd_mb"] = round(_get_home_size())

        # Lars profile model: read from config file
        try:
            import yaml as _yaml
            _p = os.path.expanduser(r"~\AppData\Local\hermes\profiles\lars\config.yaml")
            if os.path.exists(_p):
                _c = _yaml.safe_load(open(_p, encoding="utf-8")) or {}
                _m = _c.get("model") or {}
                if isinstance(_m, dict):
                    out["lars_model"] = _m.get("default") or _m.get("model") or "?"
                else:
                    out["lars_model"] = str(_m)
            else:
                out["lars_model"] = "?"
        except Exception:
            out["lars_model"] = "?"
    except Exception as exc:
        out["ok"] = False
        out["error"] = str(exc)[:200]

    return out


def _get_home_size():
    import time
    global _home_size_cache
    now = time.time()
    if now - _home_size_cache[1] < 60:
        return _home_size_cache[0]

    import os
    home = os.path.expanduser(r"~\AppData\Local\hermes")
    total = 0
    try:
        for dirpath, dirnames, files in os.walk(home):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(dirpath, f))
                except Exception:
                    pass
    except Exception:
        pass
    size_mb = round(total / 2 ** 20, 1)
    _home_size_cache = (size_mb, now)
    return size_mb
