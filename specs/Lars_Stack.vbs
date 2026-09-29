' Lars_Stack.vbs — one-click always-on stack for the Lars Hermes plugin.
' Installs itself into the Windows Startup folder (self-install), then runs a
' hidden watcher that:
'   1. waits for the Hermes desktop app backend (random port) to appear
'   2. tracks its port; on change (app restart) or first appearance:
'        - kills stale :9119 dashboard, relaunches WITH bridge token
'        - kills stale :8000 voice server, relaunches
'        - slot for future services (FUTURE_SERVICES array)
'   3. logs every action to <repo>\voice\lars_stack.log
' Machine-agnostic: all paths under %LOCALAPPDATA%. Works on Win10/Win11.
' Gateway is intentionally NOT managed here (restart it manually when needed).

Option Explicit
Dim sh, fso, LOCAL, REPO, VOICE, VENV, LOGF, STARTUP
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

LOCAL = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%")
REPO  = LOCAL & "\hermes\desktop-plugins\lars"
VOICE = REPO & "\voice"
VENV  = VOICE & "\.venv\Scripts\python.exe"
LOGF  = VOICE & "\lars_stack.log"
STARTUP = sh.ExpandEnvironmentStrings("%APPDATA%") & "\Microsoft\Windows\Start Menu\Programs\Startup"

' ── self-install: replace old Hermes_Gateway.vbs with this one ──────────────
Dim oldVbs, mePath
oldVbs = STARTUP & "\Hermes_Gateway.vbs"
mePath = WScript.ScriptFullName
If LCase(mePath) <> LCase(STARTUP & "\Lars_Stack.vbs") Then
  ' copy THIS script into Startup as Lars_Stack.vbs (only if not already there)
  If Not fso.FileExists(STARTUP & "\Lars_Stack.vbs") Then
    fso.CopyFile mePath, STARTUP & "\Lars_Stack.vbs", True
    Log "installed watcher to Startup"
  End If
  ' retire the old gateway autostart (gateway is manual from now on)
  If fso.FileExists(oldVbs) Then
    fso.DeleteFile oldVbs, True
    Log "removed old Hermes_Gateway.vbs from Startup (gateway is manual now)"
  End If
End If

' ── run the watcher hidden, detached from this installer process ────────────
If InStr(LCase(WScript.FullName), "wscript") > 0 And WScript.Arguments.Count = 0 Then
  ' first run = installer; relaunch self with /watch hidden
  sh.Run "wscript.exe """ & WScript.ScriptFullName & """ /watch", 0, False
  WScript.Quit
End If

' ── watcher loop (arguments contains /watch) ────────────────────────────────
Dim lastPort, dashPID, voicePID
lastPort = "": dashPID = 0: voicePID = 0

Do While True
  Dim bePort : bePort = FindBackendPort()
  If bePort <> "" And bePort <> lastPort Then
    Log "hermes backend on port " & bePort & " (was: " & lastPort & ") -> refreshing stack"
    lastPort = bePort
    RestartDashboard bePort
    RestartVoice
    ' FUTURE: add more services here (e.g. RestartOther)
  ElseIf bePort = "" And lastPort <> "" Then
    Log "hermes backend gone (app closed?) — keeping services, waiting"
    lastPort = ""
  End If
  WScript.Sleep 20000   ' 20 s poll
Loop

' ── find the desktop app backend port: python.exe running `hermes serve --port 0`
' (its listening port is dynamic; we detect via its command line + netstat)
Function FindBackendPort()
  Dim p, out, pid
  FindBackendPort = ""
  ' backend = python (Hermes tools runtime) running `hermes.exe serve --port 0`
  ' — the compiled hermes.exe has NO socket itself; its python child holds it.
  p = "powershell -NoProfile -Command ""Get-CimInstance Win32_Process -Filter \""Name='python.exe'\"" | Where-Object { $_.CommandLine -match 'serve' -and $_.CommandLine -match 'port 0' } | Select-Object -First 1 -ExpandProperty ProcessId"""
  out = sh.Exec(p).StdOut.ReadAll()
  pid = Replace(Replace(Trim(out), vbCr, ""), vbLf, "")
  If pid = "" Then Exit Function
  ' find which LISTENING port that PID owns (exclude our known static ports)
  p = "powershell -NoProfile -Command ""(Get-NetTCPConnection -OwningProcess " & pid & " -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty LocalPort)"""
  out = sh.Exec(p).StdOut.ReadAll()
  Dim line
  line = Replace(Replace(Trim(out), vbCr, ""), vbLf, "")
  If line <> "" And line <> "9119" And line <> "8000" And line <> "9120" Then FindBackendPort = line
End Function

' ── kill anything on a port, then start fresh ───────────────────────────────
Sub KillPort(port)
  Dim p, out
  p = "powershell -NoProfile -Command ""Get-NetTCPConnection -LocalPort " & port & " -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"""
  sh.Run p, 0, True
End Sub

Sub RestartDashboard(bePort)
  On Error Resume Next
  If dashPID <> 0 Then
    sh.Run "powershell -NoProfile -Command ""Stop-Process -Id " & dashPID & " -Force -ErrorAction SilentlyContinue""", 0, True
    dashPID = 0
  End If
  KillPort 9119
  Dim env, hermesCmd
  hermesCmd = LOCAL & "\hermes\bin\hermes.cmd"   ' full path — PATH may differ in VBS child
  env = "$env:HERMES_DASHBOARD_SESSION_TOKEN='lars-voice-bridge-2026'; $env:HERMES_PROFILE='hermes-desktop-coder'"
  sh.Run "powershell -NoProfile -Command """ & env & "; Start-Process -WindowStyle Hidden -FilePath '" & hermesCmd & "' -ArgumentList 'dashboard','--port','9119','--host','127.0.0.1','--no-open'""", 0, False
  WScript.Sleep 12000   ' let dashboard boot + pick up backend port
  Log "dashboard :9119 relaunched (token-authed, fresh backend " & bePort & ")"
End Sub

Sub RestartVoice()
  On Error Resume Next
  KillPort 8000
  sh.Run "powershell -NoProfile -Command ""Start-Process -WindowStyle Hidden -FilePath '" & VENV & "' -ArgumentList '-u','voice_server.py' -WorkingDirectory '" & VOICE & "'""", 0, False
  WScript.Sleep 10000   ' engines load ~6-9 s
  Log "voice server :8000 relaunched"
End Sub

Sub Log(msg)
  On Error Resume Next
  Dim f
  Set f = fso.OpenTextFile(LOGF, 8, True)
  f.WriteLine Now & "  " & msg
  f.Close
End Sub
