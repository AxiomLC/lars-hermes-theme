' Lars_Stack.vbs — EVENT-DRIVEN stack keeper for the Lars Hermes plugin.
' NO polling. NO visible windows. Wakes only when a Hermes process starts.
'
' Design (user-directed 2026-09-29):
'   - Trigger = WMI process-start event (Hermes electron app / its backend),
'     NOT a 20 s cron loop.
'   - On boot: if the backend is already up, one refresh pass runs; otherwise
'     the script just waits silently for the start event.
'   - Every powershell call is INVISIBLE (cmd /c ... > tmpfile, window style 0).
'   - Mutex: lock-file with PID — a second copy exits immediately.
'   - Refresh cascade: kill+relaunch :9119 dashboard (bridge token), then :8000
'     voice server. FUTURE_SERVICES slot in Refresh().
'   - Gateway is NOT managed (manual restart when changed).
'   - Self-installs to Windows Startup folder on first run.
' Machine-agnostic: %LOCALAPPDATA% paths only. Win10/Win11.

Option Explicit
Dim sh, fso, LOCAL, REPO, VOICE, VENV, LOGF, STARTUP, LOCKF, TMPD
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

LOCAL   = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%")
REPO    = LOCAL & "\hermes\desktop-plugins\lars"
VOICE   = REPO & "\voice"
VENV    = VOICE & "\.venv\Scripts\python.exe"
LOGF    = VOICE & "\lars_stack.log"
STARTUP = sh.ExpandEnvironmentStrings("%APPDATA%") & "\Microsoft\Windows\Start Menu\Programs\Startup"
LOCKF   = LOCAL & "\hermes\lars_stack.lock"
TMPD    = sh.ExpandEnvironmentStrings("%TEMP%")

' ── mutex: exit if another watcher is already running ───────────────────────
' Lock = file created exclusively. If it exists, check if any wscript.exe is
' actually running Lars_Stack.vbs; if yes quit, if not it's stale → take over.
Dim running : running = PS("(Get-CimInstance Win32_Process -Filter ""Name='wscript.exe'"" | Where-Object { $_.CommandLine -match 'Lars_Stack' } | Measure-Object).Count")
If fso.FileExists(LOCKF) And running <> "0" And running <> "" Then
  WScript.Quit   ' another watcher is alive — silently exit
End If
Dim f
Set f = fso.CreateTextFile(LOCKF, True)
f.WriteLine Now
f.Close

' ── self-install to Startup (idempotent) ────────────────────────────────────
Dim startupCopy, oldVbs
startupCopy = STARTUP & "\Lars_Stack.vbs"
oldVbs = STARTUP & "\Hermes_Gateway.vbs"
If LCase(WScript.ScriptFullName) <> LCase(startupCopy) Then
  If Not fso.FileExists(startupCopy) Then
    fso.CopyFile WScript.ScriptFullName, startupCopy, True
    Log "installed watcher to Startup"
  End If
End If
If fso.FileExists(oldVbs) Then
  fso.DeleteFile oldVbs, True
  Log "removed old Hermes_Gateway.vbs from Startup (gateway is manual now)"
End If

' ── one boot pass: refresh only if backend already up ───────────────────────
Dim lastPort : lastPort = ""
Dim be : be = FindBackendPort()
If be <> "" Then
  lastPort = be
  Refresh be
Else
  Log "boot: hermes backend not up yet — waiting for start event"
End If

' ── event loop: WAKE ONLY when a Hermes backend process starts ──────────────
' __InstanceCreationEvent WITHIN 3 = WMI-internal poll (no windows, near-zero
' CPU). ProcessStartTrace needs SeSecurityPrivilege — Access denied even
' elevated (tested), so this is the reliable event door.
Dim wmi, ev, obj
Set wmi = GetObject("winmgmts:{impersonationLevel=impersonate}!\\.\root\cimv2")
Do While True
  On Error Resume Next
  Set ev = wmi.ExecNotificationQuery( _
    "SELECT * FROM __InstanceCreationEvent WITHIN 3 WHERE " & _
    "TargetInstance ISA 'Win32_Process' AND " & _
    "(TargetInstance.Name='python.exe' OR TargetInstance.Name='Hermes.exe')")
  If Err.Number <> 0 Then
    Log "WMI subscribe failed: " & Err.Description & " — retry in 60 s"
    Err.Clear
    WScript.Sleep 60000
  Else
    Exit Do
  End If
Loop

Do While True
  On Error Resume Next
  Set obj = ev.NextEvent             ' BLOCKS here — no CPU, no windows
  If Err.Number = 0 Then
    WScript.Sleep 4000               ' let the backend bind its port
    be = FindBackendPort()
    If be <> "" And be <> lastPort Then
      Log "backend detected on port " & be & " (was: " & lastPort & ") -> refreshing"
      lastPort = be
      Refresh be
    End If   ' wake without new port = non-backend python (cron etc.) — ignore
  Else
    Err.Clear
    WScript.Sleep 5000
  End If
Loop

' ── helpers ──────────────────────────────────────────────────────────────────
Function PS(psCmd)
  ' run powershell INVISIBLE, return trimmed stdout (via temp file)
  Dim tf : tf = TMPD & "\lars_out.txt"
  sh.Run "%SystemRoot%\System32\cmd.exe /c powershell -NoProfile -Command """ & _
         Replace(psCmd, """", "\""") & """ > """ & tf & """ 2>nul", 0, True
  If fso.FileExists(tf) Then
    Set f = fso.OpenTextFile(tf, 1)
    If Not f.AtEndOfStream Then PS = Replace(Replace(Trim(f.ReadAll), vbCr, ""), vbLf, "")
    f.Close
    fso.DeleteFile tf, True
  End If
End Function

Function FindBackendPort()
  Dim pid, out
  FindBackendPort = ""
  pid = PS("Get-CimInstance Win32_Process -Filter ""Name='python.exe'"" | Where-Object { $_.CommandLine -match 'serve' -and $_.CommandLine -match 'port 0' } | Select-Object -First 1 -ExpandProperty ProcessId")
  If pid = "" Then Exit Function
  out = PS("(Get-NetTCPConnection -OwningProcess " & pid & " -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty LocalPort)")
  If out <> "" And out <> "9119" And out <> "8000" And out <> "9120" Then FindBackendPort = out
End Function

Sub KillPort(port)
  PS "Get-NetTCPConnection -LocalPort " & port & " -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
End Sub

Sub Refresh(bePort)
  ' 1. dashboard :9119 — fresh, with bridge token
  KillPort 9119
  sh.Run "%SystemRoot%\System32\cmd.exe /c powershell -NoProfile -Command ""$env:HERMES_DASHBOARD_SESSION_TOKEN='lars-voice-bridge-2026'; $env:HERMES_PROFILE='hermes-desktop-coder'; Start-Process -WindowStyle Hidden -FilePath '" & LOCAL & "\hermes\bin\hermes.cmd' -ArgumentList 'dashboard','--port','9119','--host','127.0.0.1','--no-open'""", 0, False
  WScript.Sleep 12000
  Log "dashboard :9119 relaunched (token-authed, backend " & bePort & ")"
  ' 2. voice server :8000
  KillPort 8000
  sh.Run "%SystemRoot%\System32\cmd.exe /c powershell -NoProfile -Command ""Start-Process -WindowStyle Hidden -FilePath '" & VENV & "' -ArgumentList '-u','voice_server.py' -WorkingDirectory '" & VOICE & "'""", 0, False
  WScript.Sleep 10000
  Log "voice server :8000 relaunched"
  ' 3. FUTURE SERVICES — add kill+start pairs here following the same pattern
End Sub

Sub Log(msg)
  On Error Resume Next
  Set f = fso.OpenTextFile(LOGF, 8, True)
  f.WriteLine Now & "  " & msg
  f.Close
End Sub
