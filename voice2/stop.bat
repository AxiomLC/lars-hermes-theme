@echo off
:: stop.bat — one-click stop of the Lars voice sidecars ONLY.
:: Kills whatever listens on :8000 (Pocket TTS) and :8107 (STT).
:: Does NOT touch Hermes (backend :9119 / gateway) — restart those from the app.
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8107,8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
echo Voice sidecars stopped (TTS :8000, STT :8107). Hermes untouched.
