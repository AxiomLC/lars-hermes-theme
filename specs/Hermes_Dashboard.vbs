' Hermes_Dashboard.vbs — Lars machine-2: start :9119 dashboard at login
' (replicates machine-1 main-branch model: Startup VBS + user env token).
Option Explicit
Dim sh, env
Set sh = CreateObject("WScript.Shell")
Set env = sh.Environment("PROCESS")
env.Item("HERMES_HOME") = "C:\Users\Admin\AppData\Local\hermes"
env.Item("HERMES_DASHBOARD_SESSION_TOKEN") = "lars-voice-bridge-2026"
env.Item("PYTHONIOENCODING") = "utf-8"
sh.CurrentDirectory = "C:\Users\Admin\AppData\Local\hermes"
sh.Run """C:\Users\Admin\AppData\Local\hermes\bin\hermes.cmd"" dashboard --port 9119 --host 127.0.0.1 --no-open", 0, False
