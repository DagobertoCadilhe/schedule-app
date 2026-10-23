@echo off
rem Opens Schedule. Starts the local server first if it is not already running.
cd /d "%~dp0"
if not exist "dist\index.html" call npm run build
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue)) { Start-Process -FilePath node -ArgumentList 'server/index.mjs' -WorkingDirectory '%~dp0' -WindowStyle Hidden; Start-Sleep -Seconds 2 }"
start "" http://localhost:4173
