@echo off
setlocal
cd /d "%~dp0"

set PANEL_URL=http://127.0.0.1:8210/
echo Starting Palworld web panel...
echo %PANEL_URL%
echo.

start "" "%PANEL_URL%"
node "%~dp0server.js"

echo.
echo Panel stopped.
pause
