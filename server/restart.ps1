# Stops the Schedule server (only the process listening on port 4173) and starts a fresh hidden one.
param([int]$Port = 4173)
$root = Split-Path -Parent $PSScriptRoot

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  foreach ($id in ($listener.OwningProcess | Select-Object -Unique)) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$id"
    if ($p.CommandLine -match 'server[\\/]index\.mjs') { Stop-Process -Id $id -Force; Write-Host "Stopped old server (pid $id)" }
    else { Write-Host "Port $Port is used by another program ($($p.Name)); not touching it."; exit 1 }
  }
  Start-Sleep -Milliseconds 700
}

Start-Process -FilePath node -ArgumentList 'server/index.mjs' -WorkingDirectory $root -WindowStyle Hidden
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 300
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { Write-Host "Server running on http://localhost:$Port"; exit 0 }
}
Write-Host 'The server did not start. Run "node server/index.mjs" in the Schedule folder to see the error.'
exit 1
