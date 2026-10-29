Set WshShell = CreateObject("WScript.Shell")
' Menjalankan start.bat secara tersembunyi (0 = hidden window)
WshShell.Run chr(34) & "start.bat" & chr(34), 0
Set WshShell = Nothing
