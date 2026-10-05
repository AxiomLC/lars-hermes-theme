@echo off
cd /d %~dp0
:: Lars voice helpers — only the local STT endpoint is needed now:
::   STT :8107 (faster-whisper 'base') — the plugin page talks to it directly.
:: TTS is Pocket TTS (:8000, started separately: uvx pocket-tts serve).
:: Brain is the lars2 Hermes profile over native gateway RPC — no helper server.
:: Diagnostics live in Hermes: ~\AppData\Local\hermes\plugins\lars\voice-events.log
:: (gateway-mounted plugin_api /voice-log, last 100 entries).
set STT_PORT=8107
start "lars-stt" /min powershell -NoProfile -WindowStyle Hidden -Command "python '%~dp0stt_local.py'"
echo STT starting on :8107 (TTS :8000 and Hermes gateway must be up separately)
