@echo off
REM start_voice_stack.cmd — start :9119 dashboard (bridge token) + :8000 voice.
REM Run this BEFORE/alongside Hermes. The app ADOPTS an already-running :9119
REM (its own token then matches ours); if the app spawns its own backend instead,
REM the voice bridge cannot authenticate — order matters. No killing, no watching.
setlocal
set LOG=%LOCALAPPDATA%\hermes\desktop-plugins\lars\voice\lars_stack.log
set REPO=%LOCALAPPDATA%\hermes\desktop-plugins\lars

echo %date% %time%  START: begin>>"%LOG%"

netstat -ano | findstr /R ":9119 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  echo [1/2] starting dashboard :9119 ...
  start "" /MIN cmd /c "set HERMES_HOME=%LOCALAPPDATA%\hermes&& set HERMES_DASHBOARD_SESSION_TOKEN=lars-voice-bridge-2026&& %LOCALAPPDATA%\hermes\bin\hermes.cmd dashboard --port 9119 --host 127.0.0.1 --no-open"
  echo %date% %time%  START action: dashboard :9119 launched (HERMES_HOME+token)>>"%LOG%"
  ping -n 46 127.0.0.1 >nul
) else (
  echo [1/2] :9119 already up
  echo %date% %time%  START ok: :9119 already listening>>"%LOG%"
)

netstat -ano | findstr /R ":8000 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  echo [2/2] starting voice :8000 ...
  start "" /MIN "%REPO%\voice\.venv\Scripts\python.exe" -u "%REPO%\voice\voice_server.py"
  echo %date% %time%  START action: voice :8000 launched>>"%LOG%"
) else (
  echo [2/2] :8000 already up
  echo %date% %time%  START ok: :8000 already listening>>"%LOG%"
)
echo Done. Then start Hermes (it will adopt the running :9119).
pause