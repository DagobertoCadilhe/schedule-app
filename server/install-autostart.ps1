$root = Split-Path -Parent $PSScriptRoot
$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'Schedule server.lnk'
$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($link)
$s.TargetPath = 'wscript.exe'
$s.Arguments = '"' + (Join-Path $root 'server\start-hidden.vbs') + '"'
$s.WorkingDirectory = $root
$s.Save()
Write-Host "Created $link"
