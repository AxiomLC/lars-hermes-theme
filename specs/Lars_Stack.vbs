' Lars_Stack.vbs v2 — stack keeper for the Lars Hermes plugin.
'
' Design (user-directed 2026-09-29, post-incident):
'   - Installed as a Scheduled Task with an ONLOGON trigger (survives boot;
'     the Startup-folder vbs did NOT auto-run on the 2026-09-29 boot).
'   - Trigger: WMI __InstanceCreationEvent WITHIN 3 on python.exe/Hermes.exe
'     start (proven working in vbs on this machine). ProcessStartTrace is
'     Access denied even elevated — never use. On repeated subscribe failure
'     the script continues in poll-only mode.
'   - Poll safety net every 15 s + an Ensure pass on every event wake.
'   - Ensure = verify first, kill+relaunch only if broken:
'       :9119 dashboard  - must listen AND mount /api/plugins/lars/stats.
'         CRITICAL: launch with HERMES_HOME=%LOCALAPPDATA%\hermes and
'         HERMES_DASHBOARD_SESSION_TOKEN set. Without HERMES_HOME the
'         dashboard scans the wrong home, mounts ZERO plugins and the plugin
'         UI dies (root cause of the 2026-09-29 outage).
'         Do NOT set HERMES_PROFILE (untested; the verified-good launch has
'         only HERMES_HOME + token).
'       :8000 voice server - launch only if not listening. Needs 30-60 s TTS
'         warmup after start before the first turn.
'   - Every powershell call INVISIBLE (cmd /c ... > tmpfile, window style 0).
'     Never sh.Exec — it flashes visible windows.
'   - Mutex: lock file + live wscript check; stale lock is taken over.
'   - Logs action/success/failure to voice\lars_stack.log.
' Machine-agnostic: %LOCALAPPDATA% paths only. Win10/Win11.

Option Explicit
Dim sh, fso, LOCAL, REPO, VOICE, VENV, LOGF, STARTUP, LOCKF, TMPD, TASKNAME
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

LOCAL    = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%")
REPO     = LOCAL & "\hermes\desktop-plugins\lars"
VOICE    = REPO & "\voice"
VENV     = VOICE & "\.venv\Scripts\python.exe"
LOGF     = VOICE & "\lars_stack.log"
STARTUP  = sh.ExpandEnvironmentStrings("%APPDATA%") & "\Microsoft\Windows\Start Menu\Programs\Startup"
LOCKF    = LOCAL & "\hermes\lars_stack.lock"
TMPD     = sh.ExpandEnvironmentStrings("%TEMP%")
TASKNAME = "LarsStackWatcher"
Randomize
Dim IID : IID = Int(Rnd(1) * 1000000)   ' unique tmpfile suffix per instance (concurrent copies race on a shared name)

' ── mutex: exit if another watcher is already running ───────────────────────
' Lock file + live wscript check; stale lock (no wscript running) is taken over.
Dim running : running = PS("(Get-CimInstance Win32_Process -Filter ""Name='wscript.exe'"" | Where-Object { $_.CommandLine -match 'Lars_Stack' } | Measure-Object).Count")
If fso.FileExists(LOCKF) And running <> "0" And running <> "" Then
  WScript.Quit   ' another watcher is alive — silently exit
End If
WriteLock

' ── install: scheduled task (ONLOGON, primary) + Startup copy (backup) ──────
InstallTask

' ── boot pass: ensure everything now ─────────────────────────────────────────
EnsureAll

' ── main loop: WMI event trigger + 15 s poll fallback ───────────────────────
Dim wmi, ev, subscribed : subscribed = False
Set wmi = GetObject("winmgmts:{impersonationLevel=impersonate}!\\.\root\cimv2")
Dim fails : fails = 0
Do While Not subscribed And fails < 3
  On Error Resume Next
  Set ev = wmi.ExecNotificationQuery( _
    "SELECT * FROM __InstanceCreationEvent WITHIN 3 WHERE " & _
    "TargetInstance ISA 'Win32_Process' AND " & _
    "(TargetInstance.Name='python.exe' OR TargetInstance.Name='Hermes.exe')")
  If Err.Number <> 0 Then
    Log "failure: WMI subscribe: " & Err.Description & " — retry " & (fails + 1) & "/3"
    Err.Clear
    fails = fails + 1
    WScript.Sleep 60000
  Else
    subscribed = True
    Log "success: WMI event subscription active"
  End If
  On Error GoTo 0
Loop
If Not subscribed Then Log "action: WMI unavailable after 3 tries — poll-only mode (15 s)"

Dim lastCheck : lastCheck = Now
Do While True
  On Error Resume Next
  Dim gotEvent : gotEvent = False
  If subscribed Then
    Dim obj
    Set obj = ev.NextEvent(15000)          ' 15 s timeout -> fall through to poll
    If Err.Number = 0 Then gotEvent = True Else Err.Clear
  Else
    WScript.Sleep 15000
  End If
  If gotEvent Then
    WScript.Sleep 5000                     ' let the new process bind its port
    EnsureAll
  ElseIf DateDiff("s", lastCheck, Now) >= 15 Then
    lastCheck = Now
    EnsureAll                              ' poll safety net
  End If
  If Err.Number <> 0 Then Err.Clear
  On Error GoTo 0
Loop

' ── helpers ──────────────────────────────────────────────────────────────────
Sub EnsureAll
  On Error Resume Next
  ' 1. dashboard :9119 — listening AND lars plugin mounted
  If Not PortListening(9119) Then
    Log "action: dashboard :9119 down -> relaunch"
    LaunchDashboard
    If PortListening(9119) Then
      Log "success: dashboard :9119 listening"
    Else
      Log "failure: dashboard :9119 did not come up"
    End If
  ElseIf Not LarsMountedRetry() Then
    Log "action: dashboard :9119 up but lars plugin NOT mounted (3 checks failed) -> kill + relaunch with HERMES_HOME"
    KillPort 9119
    LaunchDashboard
    Dim tries : tries = 0
    Do While tries < 5 And LarsMounted() <> "200"
      WScript.Sleep 10000
      tries = tries + 1
    Loop
    If LarsMounted() Then
      Log "success: dashboard :9119 relaunched, lars mounted"
    Else
      Log "failure: dashboard :9119 relaunched but lars still not mounted"
    End If
  Else
    Log "ok: dashboard :9119 healthy (lars mounted)"
  End If
  ' 2. voice server :8000 — launch only if down
  If Not PortListening(8000) Then
    Log "action: voice server :8000 down -> launch"
    LaunchVoice
    If PortListening(8000) Then
      Log "success: voice server :8000 listening (30-60 s TTS warmup before first turn)"
    Else
      Log "failure: voice server :8000 did not come up"
    End If
  Else
    Log "ok: voice server :8000 healthy"
  End If
  On Error GoTo 0
End Sub

Function PortListening(port)
  PortListening = False
  Dim out : out = PS("(Get-NetTCPConnection -LocalPort " & port & " -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count")
  If out <> "" And out <> "0" Then PortListening = True
End Function

Function LarsMounted()
  ' GET /api/plugins/lars/stats with bridge token.
  ' Returns "200" (healthy), "refused" (nothing listening), "stall" (up but
  ' event loop stalled — dashboard stalls up to ~40 s under GIL pressure;
  ' a stall must NEVER trigger a relaunch).
  Dim out
  out = PS("try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Headers @{Authorization='Bearer lars-voice-bridge-2026'} 'http://127.0.0.1:9119/api/plugins/lars/stats').StatusCode } catch { if ($_.Exception.Message -match 'Unable to connect') { 'refused' } else { 'stall' } }")
  If out = "200" Then LarsMounted = "200" Else LarsMounted = out
End Function

Function LarsMountedRetry()
  ' 3 checks with 5 s gaps — must see "refused" every time to declare the
  ' dashboard down; stalls alone never trigger a relaunch.
  LarsMountedRetry = False
  Dim n, r, refused : refused = True
  For n = 1 To 3
    r = LarsMounted()
    If r = "200" Then
      LarsMountedRetry = True
      Exit Function
    End If
    If r <> "refused" Then refused = False
    If n < 3 Then WScript.Sleep 5000
  Next
  If Not refused Then
    Log "note: dashboard :9119 stalled (event loop under load) — not relaunching"
  End If
  LarsMountedRetry = False
  If Not refused Then LarsMountedRetry = True   ' stalled-but-alive = leave it alone
End Function

Sub LaunchDashboard
  ' CRITICAL: HERMES_HOME must be the machine home or NO plugins mount.
  Dim tf : tf = TMPD & "\lars_dash_launch.log"
  sh.Run "%SystemRoot%\System32\cmd.exe /c set HERMES_HOME=" & LOCAL & "\hermes&& set HERMES_DASHBOARD_SESSION_TOKEN=lars-voice-bridge-2026&& %LOCALAPPDATA%\hermes\bin\hermes.cmd dashboard --port 9119 --host 127.0.0.1 --no-open > """ & tf & """ 2>&1", 0, False
  WScript.Sleep 25000
End Sub

Sub LaunchVoice
  sh.Run "%SystemRoot%\System32\cmd.exe /c powershell -NoProfile -Command ""Start-Process -WindowStyle Hidden -FilePath '" & VENV & "' -ArgumentList '-u','voice_server.py' -WorkingDirectory '" & VOICE & "'""", 0, False
  WScript.Sleep 10000
End Sub

Sub KillPort(port)
  PS "Get-NetTCPConnection -LocalPort " & port & " -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
End Sub

Sub InstallTask
  ' Startup copy = the thing both the task and the fallback actually run.
  Dim vbsSelf, startupCopy, tf, out, f
  vbsSelf = WScript.ScriptFullName
  startupCopy = STARTUP & "\Lars_Stack.vbs"
  If LCase(vbsSelf) <> LCase(startupCopy) Then
    fso.CopyFile vbsSelf, startupCopy, True
  End If
  ' scheduled task with ONLOGON trigger, running the Startup copy
  tf = TMPD & "\lars_sch.out"
  sh.Run "%SystemRoot%\System32\cmd.exe /c schtasks /Create /TN " & TASKNAME & _
         " /TR """ & startupCopy & """ /SC ONLOGON /F /RL LIMITED > """ & tf & """ 2>&1", 0, True
  out = ""
  If fso.FileExists(tf) Then
    Set f = fso.OpenTextFile(tf, 1)
    out = f.ReadAll
    f.Close
    fso.DeleteFile tf, True
  End If
  If InStr(out, "SUCCESS") > 0 Then
    Log "success: scheduled task " & TASKNAME & " created (ONLOGON -> Startup copy)"
  Else
    ' fallback: HKCU Run key (logon autostart, no elevation needed)
    Log "failure: schtasks create (needs elevation) — falling back to HKCU Run key: " & Replace(Replace(out, vbCr, ""), vbLf, " ")
    sh.Run "%SystemRoot%\System32\cmd.exe /c reg add HKCU\Software\Microsoft\Windows\CurrentVersion\Run /v " & TASKNAME & " /d """ & startupCopy & """ /f > """ & tf & """ 2>&1", 0, True
    out = ""
    If fso.FileExists(tf) Then
      Set f = fso.OpenTextFile(tf, 1)
      out = f.ReadAll
      f.Close
      fso.DeleteFile tf, True
    End If
    If InStr(out, "success") > 0 Or InStr(out, "The operation completed") > 0 Then
      Log "success: HKCU Run key installed (logon autostart)"
    Else
      Log "failure: HKCU Run key: " & Replace(Replace(out, vbCr, ""), vbLf, " ")
    End If
  End If
End Sub

Sub WriteLock
  Dim f
  Set f = fso.CreateTextFile(LOCKF, True)
  f.WriteLine Now
  f.Close
End Sub

Function PS(psCmd)
  ' run powershell INVISIBLE, return trimmed stdout (via temp file)
  Dim tf, f
  tf = TMPD & "\lars_out_" & IID & ".txt"
  sh.Run "%SystemRoot%\System32\cmd.exe /c powershell -NoProfile -Command """ & _
         Replace(psCmd, """", "\""") & """ > """ & tf & """ 2>nul", 0, True
  PS = ""
  If fso.FileExists(tf) Then
    Set f = fso.OpenTextFile(tf, 1)
    If Not f.AtEndOfStream Then PS = Replace(Replace(Trim(f.ReadAll), vbCr, ""), vbLf, "")
    f.Close
    fso.DeleteFile tf, True
  End If
End Function

Sub Log(msg)
  On Error Resume Next
  Dim f
  Set f = fso.OpenTextFile(LOGF, 8, True)
  f.WriteLine Now & "  " & msg
  f.Close
End Sub