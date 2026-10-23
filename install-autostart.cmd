@echo off
rem Makes the Schedule server start (hidden) every time you sign in to Windows.
rem Undo: run uninstall-autostart.cmd
cd /d "%~dp0"
if not exist "dist\index.html" call npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\install-autostart.ps1"
echo.
echo Done. The Schedule server will now start when you sign in.
echo Open http://localhost:4173 (or the installed Schedule app) any time.
pause
