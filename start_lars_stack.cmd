@echo off
REM start_lars_stack.cmd — ONE-SHOT voice-stack starter (run after starting Hermes).
REM
REM ARCHITECTURE (corrected 2026-09-29 v3):
REM   The desktop app's boot shape VARIES:
REM     - some boots it spawns dashboard :9119 itself (dashboard+gateway+plugins);
REM     - other boots it spawns a serve backend on a DYNAMIC port and :9119 never
REM       appears. gui.log shows live tui_gateway traffic either way.
REM   :9119 = dashboard+gateway. NEVER kill a healthy one. But a ZOMBIE listener
REM           (netstat LISTENING yet refuses connections) must be killed before
REM           the fallback launch.
REM   :8000 = Lars voice server. OURS. Needs :9119 up to bridge.
REM Trust only real HTTP responses (200), never netstat alone.
REM Log: %LOCALAPPDATA%\hermes\desktop-plugins\lars\voice\lars_stack.log

setlocal enabledelayedexpansion
set LOG=%LOCALAPPDATA%\hermes\desktop-plugins\lars\voice\lars_stack.log
set REPO=%LOCALAPPDATA%\hermes\desktop-plugins\lars

echo === Lars voice stack start ===
echo !date! !time!  MANUAL: one-shot voice stack start>>"%LOG%"

REM ── 1. wait up to ~3 min for :9119 to answer REAL HTTP ──
echo [1/4] waiting for :9119 to answer HTTP (up to ~3 min) ...
set GOT9119=
for /l %%i in (1,1,18) do (
  if not defined GOT9119 (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://127.0.0.1:9119/' ; if ($r.StatusCode -eq 200) { exit 0 } ; exit 1 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 (
      set GOT9119=1
      echo   :9119 answered HTTP — app dashboard is up
      echo !date! !time!  MANUAL success: :9119 HTTP OK>>"%LOG%"
    ) else (
      ping -n 11 127.0.0.1 >nul
    )
  )
)

REM ── 2. fallback: zombie listener kill + launch dashboard with HERMES_HOME ──
if not defined GOT9119 (
  echo [2/4] :9119 not answering — fallback launch ...
  powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 9119 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Write-Host ('  killing zombie listener pid ' + $_); Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue; ('!date! !time!  MANUAL action: killed zombie :9119 listener pid ' + $_ >> '%LOG%') }"
  start "" /MIN cmd /c "set HERMES_HOME=%LOCALAPPDATA%\hermes&& set HERMES_DASHBOARD_SESSION_TOKEN=lars-voice-bridge-2026&& %LOCALAPPDATA%\hermes\bin\hermes.cmd dashboard --port 9119 --host 127.0.0.1 --no-open"
  echo !date! !time!  MANUAL action: fallback dashboard :9119 launched (HERMES_HOME set)>>"%LOG%"
  echo   waiting for it to come up (~1 min) ...
  for /l %%i in (1,1,6) do (
    if not defined GOT9119 (
      powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 'http://127.0.0.1:9119/' ; if ($r.StatusCode -eq 200) { exit 0 } ; exit 1 } catch { exit 1 }" >nul 2>&1
      if not errorlevel 1 (
        set GOT9119=1
        echo   :9119 fallback dashboard is up
        echo !date! !time!  MANUAL success: fallback dashboard :9119 HTTP OK>>"%LOG%"
      ) else (
        ping -n 11 127.0.0.1 >nul
      )
    )
  )
) else (
  echo [2/4] app's own dashboard is up - not touching it
)

REM ── 3. voice server :8000 — start only if down ──
echo [3/4] voice server :8000 ...
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

REM ── 4. verify lars plugin mounted on :9119 ──
echo [4/4] verifying lars plugin mount on :9119 ...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 -Headers @{Authorization='Bearer lars-voice-bridge-2026'} 'http://127.0.0.1:9119/api/plugins/lars/stats'; if ($r.StatusCode -eq 200) { Write-Host '  lars plugin: MOUNTED' ; Write-Host ('!date! !time!  MANUAL success: lars plugin mounted on :9119' >> '%LOG%') } else { Write-Host '  lars plugin: NOT MOUNTED (status' $r.StatusCode ')' ; Write-Host ('!date! !time!  MANUAL failure: lars not mounted, status ' + $r.StatusCode >> '%LOG%') } } catch { Write-Host '  lars plugin: check failed -' $_.Exception.Message ; Write-Host ('!date! !time!  MANUAL note: mount check failed: ' + $_.Exception.Message >> '%LOG%') }"
echo.
echo Voice note: TTS needs 30-60 s warmup before the first turn.
echo Done. Leave the minimized service windows alone.
pause