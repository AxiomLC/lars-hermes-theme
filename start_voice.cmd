@echo off
REM start_voice.cmd — start Lars voice server :8000 (minimized, detached).
set REPO=%LOCALAPPDATA%\hermes\desktop-plugins\lars
netstat -ano | findstr /R ":8000 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  start "" /MIN cmd /c "cd /d %REPO%\voice && .venv\Scripts\python.exe -u voice_server.py"
  echo Voice :8000 started (TTS warmup ~30 s).
) else (
  echo Voice :8000 already running.
)
timeout /t 3 >nul
