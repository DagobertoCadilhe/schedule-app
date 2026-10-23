@echo off
rem One click after any change: rebuilds the app, restarts the server, opens Schedule.
rem   update.cmd           rebuild + restart + open the browser
rem   update.cmd nobrowser rebuild + restart only
cd /d "%~dp0"
echo Installing packages if needed...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto fail
echo Building the app...
call npm run build
if errorlevel 1 goto fail
echo Restarting the server...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\restart.ps1"
if errorlevel 1 goto fail
if /i not "%1"=="nobrowser" start "" http://localhost:4173
echo.
echo Updated. Refresh any open Schedule window (F5).
timeout /t 4 >nul
exit /b 0
:fail
echo.
echo Something went wrong. Scroll up for the error message.
pause
exit /b 1
