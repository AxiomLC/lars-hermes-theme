@echo off
REM start_lars_stack.cmd — ONE-SHOT voice-stack starter (run after starting Hermes).
REM
REM ARCHITECTURE (corrected 2026-09-29 after gateway-kill incident):
REM   :9119 = the desktop app's OWN dashboard AND the chat gateway. The app spawns
REM           it itself. NEVER kill or relaunch it — killing it kills chat.
REM   :8000 = Lars voice server. OURS to manage. Needs :9119 up to bridge.
REM This script: waits for :9119 (up to ~3 min), starts :8000 if not listening,
REM verifies both, logs, exits.
REM Log: %LOCALAPPDATA%\hermes\desktop-plugins\lars\voice\lars_stack.log

setlocal enabledelayedexpansion
set LOG=%LOCALAPPDATA%\hermes\desktop-plugins\lars\voice\lars_stack.log
set REPO=%LOCALAPPDATA%\hermes\desktop-plugins\lars

echo === Lars voice stack start ===
echo %date% %time%  MANUAL: one-shot voice stack start>>"%LOG%"

REM ── 1. WAIT for :9119 (the app spawns it itself — do not kill) ──
echo [1/3] waiting for the app's dashboard :9119 (up to ~3 min) ...
set GOT9119=
for /l %%i in (1,1,36) do (
  if not defined GOT9119 (
    netstat -ano | findstr /R ":9119 .*LISTENING" >nul 2>&1
    if not errorlevel 1 (
      set GOT9119=1
      echo   :9119 dashboard is up
      echo !date! !time!  MANUAL success: app dashboard :9119 detected>>"%LOG%"
    ) else (
      ping -n 6 127.0.0.1 >nul
    )
  )
)
if not defined GOT9119 (
  echo   :9119 never came up - launching fallback dashboard (NOT the app's gateway; restart Hermes afterwards if chat is dead^)
  echo !date! !time!  MANUAL action: :9119 absent after 3 min - fallback launch with HERMES_HOME>>"%LOG%"
  start "" /MIN cmd /c "set HERMES_HOME=%LOCALAPPDATA%\hermes&& set HERMES_DASHBOARD_SESSION_TOKEN=lars-voice-bridge-2026&& %LOCALAPPDATA%\hermes\bin\hermes.cmd dashboard --port 9119 --host 127.0.0.1 --no-open"
  ping -n 46 127.0.0.1 >nul
)

REM ── 2. voice server :8000 — start only if down ──
echo [2/3] voice server :8000 ...
netstat -ano | findstr /R ":8000 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  start "" /MIN "%REPO%\voice\.venv\Scripts\python.exe" -u "%REPO%\voice\voice_server.py"
  echo !date! !time!  MANUAL action: voice server :8000 launched>>"%LOG%"
  echo   starting :8000 ...
  set GOT8000=
  for /l %%i in (1,1,12) do (
    if not defined GOT8000 (
      netstat -ano | findstr /R ":8000 .*LISTENING" >nul 2>&1
      if not errorlevel 1 (
        set GOT8000=1
        echo   :8000 voice server is up
        echo !date! !time!  MANUAL success: voice :8000 up>>"%LOG%"
      ) else (
        ping -n 6 127.0.0.1 >nul
      )
    )
  )
  if not defined GOT8000 (
    echo   :8000 FAILED to come up
    echo !date! !time!  MANUAL failure: voice :8000 not listening after 60 s>>"%LOG%"
  )
) else (
  echo   :8000 already up - leaving it alone
  echo !date! !time!  MANUAL ok: voice :8000 already listening>>"%LOG%"
)

REM ── 3. verify lars plugin mounted on :9119 (informational) ──
echo [3/3] verifying plugin mount on :9119 ...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 -Headers @{Authorization='Bearer lars-voice-bridge-2026'} 'http://127.0.0.1:9119/api/plugins/lars/stats'; if ($r.StatusCode -eq 200) { Write-Host '  lars plugin: MOUNTED' ; Write-Host ('!date! !time!  MANUAL success: lars plugin mounted on :9119' >> '%LOG%') } else { Write-Host '  lars plugin: NOT MOUNTED (status' $r.StatusCode ')' } } catch { Write-Host '  lars plugin: check failed -' $_.Exception.Message ; Write-Host ('!date! !time!  MANUAL note: mount check failed: ' + $_.Exception.Message >> '%LOG%') }"
echo.
echo Voice note: TTS needs 30-60 s warmup before the first turn.
echo Done. Leave the two minimized service windows alone.
pause