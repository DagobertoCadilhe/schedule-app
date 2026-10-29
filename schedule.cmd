@echo off
rem Opens Schedule. On the first run it installs and builds everything, then starts the
rem local server (hidden) if it is not already running, and opens the app in your browser.
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First run: installing packages, this takes a minute...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto fail
)
if not exist "dist\index.html" (
  echo Building the app...
  call npm run build
  if errorlevel 1 goto fail
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue)) { Start-Process -FilePath node -ArgumentList 'server/index.mjs' -WorkingDirectory '%~dp0' -WindowStyle Hidden; Start-Sleep -Seconds 2 }"
start "" http://localhost:4173
exit /b 0

:fail
echo.
echo Something went wrong. Scroll up for the error message.
pause
exit /b 1
