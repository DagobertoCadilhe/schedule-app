@echo off
rem Makes the Schedule server start (hidden) every time you sign in to Windows.
rem Undo: run uninstall-autostart.cmd
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org first.
  pause
  exit /b 1
)
if not exist "node_modules" call npm install --no-audit --no-fund
if not exist "dist\index.html" call npm run build

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\install-autostart.ps1"
echo.
echo Done. The Schedule server will now start when you sign in.
echo Open http://localhost:4173 (or the installed Schedule app) any time.
pause
