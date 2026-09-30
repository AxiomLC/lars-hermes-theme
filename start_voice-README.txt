@start_voice.cmd — start Lars voice server :8000 (double-click me).

WHAT IT DOES
  Checks port 8000. If free, starts voice_server.py DETACHED (minimized window)
  from the voice venv with the working directory set correctly.

NOTE
  The minimized helper window closes when the server starts; that is normal.
  TTS needs ~30 s warmup after start before first reply.

TROUBLE / TTS NOT WORKING
  Run the long-form PowerShell version (known-good):

    Start-Process -WindowStyle Hidden -FilePath 'C:\Users\Admin\AppData\Local\hermes\desktop-plugins\lars\voice\.venv\Scripts\python.exe' -ArgumentList '-u','voice_server.py' -WorkingDirectory 'C:\Users\Admin\AppData\Local\hermes\desktop-plugins\lars\voice'

  Check the port:
    netstat -ano | findstr ":8000"
  Tail the log:
    C:\Users\Admin\AppData\Local\hermes\desktop-plugins\lars\voice\voice_server.log
