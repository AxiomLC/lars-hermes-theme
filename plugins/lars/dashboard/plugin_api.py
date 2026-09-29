"""Lars utilities backend — live machine stats for the Div 7 utilities rail.

Mounted by the Hermes gateway when the lars plugin is loaded (dashboard
manifest declares "api": "plugin_api.py").

Routes:
  GET /stats -> {cpu_percent, ram_mb, hdd_mb, hermes, os, proc_uptime_s, lars_model}
"""

from fastapi import APIRouter, Request

router = APIRouter()

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

    out = {
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


@router.post("/transcribe")
async def transcribe(request: Request):
    """POST JSON {pcm: base64(int16 le mono @16k), rate} -> {ok, text} via local Whisper.

    Records through the local faster-whisper backend (no cloud, no key). The desktop
    plugin captures AudioWorklet PCM in the browser, base64s it, and posts it here.
    """
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    pcm_b64 = payload.get("pcm") or ""
    rate = int(payload.get("rate") or 16000)
    if not pcm_b64:
        return {"ok": False, "text": "", "error": "no audio"}
    try:
        import base64
        pcm = base64.b64decode(pcm_b64)
    except Exception as e:
        return {"ok": False, "text": "", "error": f"bad-base64: {e}"}
    if not pcm:
        return {"ok": False, "text": "", "error": "empty audio"}
    import io, wave, os, tempfile, time
    wav_io = io.BytesIO()
    with wave.open(wav_io, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(max(8000, rate))
        w.writeframes(pcm)
    tmp = os.path.join(tempfile.gettempdir(), f"lars_stt_{int(time.time() * 1000)}.wav")
    try:
        with open(tmp, "wb") as f:
            f.write(wav_io.getvalue())
        from tools.voice_mode import transcribe_recording
        model = payload.get("model") or None
        result = transcribe_recording(tmp, model=model)
        text = str(result.get("transcript") or "").strip()
        return {"ok": True, "text": text}
    except Exception as e:
        return {"ok": False, "text": "", "error": str(e)[:300]}
    finally:
        try:
            os.unlink(tmp)
        except Exception:
            pass
