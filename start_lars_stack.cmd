@echo off
REM start_lars_stack.cmd — ONE-SHOT stack starter (user runs after starting Hermes).
REM No daemon, nothing to die: kills + starts :9119 dashboard (HERMES_HOME required
REM or NO plugins mount!) and :8000 voice server, verifies, logs, exits.
REM Log: %LOCALAPPDATA%\hermes\desktop-plugins\lars\voice\lars_stack.log

setlocal
set LOG=%LOCALAPPDATA%\hermes\desktop-plugins\lars\voice\lars_stack.log
set REPO=%LOCALAPPDATA%\hermes\desktop-plugins\lars
set TS=%date% %time%

echo === Lars stack start ===
echo %TS%  MANUAL: one-shot stack start>>"%LOG%"

REM ── 1. dashboard :9119 — kill whatever is there, start fresh with HERMES_HOME ──
echo [1/3] dashboard :9119 ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R ":9119 .*LISTENING"') do taskkill /F /PID %%p >nul 2>&1
start "" /MIN cmd /c "set HERMES_HOME=%LOCALAPPDATA%\hermes&& set HERMES_DASHBOARD_SESSION_TOKEN=lars-voice-bridge-2026&& %LOCALAPPDATA%\hermes\bin\hermes.cmd dashboard --port 9119 --host 127.0.0.1 --no-open"
echo %TS%  MANUAL action: dashboard :9119 killed + relaunched (HERMES_HOME set)>>"%LOG%"

REM ── 2. voice server :8000 ──
echo [2/3] voice server :8000 ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R ":8000 .*LISTENING"') do taskkill /F /PID %%p >nul 2>&1
start "" /MIN "%REPO%\voice\.venv\Scripts\python.exe" -u "%REPO%\voice\voice_server.py"
echo %TS%  MANUAL action: voice server :8000 killed + relaunched>>"%LOG%"

REM ── 3. verify — poll until mounted (dashboard needs ~70 s cold) ──
echo [3/3] verifying (may take up to ~80 s on cold start) ...
set OK9119=
set OK8000=
for /l %%i in (1,1,8) do (
  if not defined OK9119 (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Headers @{Authorization='Bearer lars-voice-bridge-2026'} 'http://127.0.0.1:9119/api/plugins/lars/stats'; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 (
      set OK9119=1
      echo   9119 dashboard: OK (lars plugin mounted^)
      echo %TS%  MANUAL success: dashboard :9119 up, lars mounted>>"%LOG%"
    ) else (
      ping -n 11 127.0.0.1 >nul
    )
  )
)
if not defined OK9119 (
  echo   9119 dashboard: FAILED after 8 tries
  echo %TS%  MANUAL failure: dashboard :9119 not healthy after 80 s>>"%LOG%"
)
for /l %%i in (1,1,6) do (
  if not defined OK8000 (
    netstat -ano | findstr /R ":8000 .*LISTENING" >nul 2>&1
    if not errorlevel 1 (
      set OK8000=1
      echo   8000 voice: OK
      echo %TS%  MANUAL success: voice :8000 up>>"%LOG%"
    ) else (
      ping -n 6 127.0.0.1 >nul
    )
  )
)
if not defined OK8000 (
  echo   8000 voice: FAILED after 6 tries
  echo %TS%  MANUAL failure: voice :8000 not listening after 30 s>>"%LOG%"
)
echo.
echo Voice note: TTS needs 30-60 s warmup before the first turn.
echo Done. This window can be closed.
pause