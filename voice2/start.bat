@echo off
cd /d %~dp0
:: Lars voice services — starts everything the plugin needs besides Hermes itself:
::   STT :8107 (faster-whisper 'base')   - voice2\stt_local.py, starts detached here
::   TTS :8000 (Pocket TTS)              - reused if already up, else started detached
:: Hermes brings up its own backend (:9119) + multiplex gateway when the desktop
:: app starts. Diagnostics: ~\AppData\Local\hermes\plugins\lars\voice-events.log

set STT_PORT=8107

:: --- Pocket TTS :8000 (reuse if up) ---
curl -s -o nul --max-time 2 http://127.0.0.1:8000/health
if errorlevel 1 (
  echo Starting Pocket TTS on :8000 detached...
  start "lars-tts" /min powershell -NoProfile -WindowStyle Hidden -Command "uvx pocket-tts serve"
) else (
  echo Pocket TTS already running on :8000, reusing.
)

:: --- STT :8107 ---
start "lars-stt" /min powershell -NoProfile -WindowStyle Hidden -Command "python '%~dp0stt_local.py'"
echo STT starting on :8107.
echo Voice ready once Hermes desktop is up and the Lars plugin is armed.
