@echo off
setlocal
set "TEAM_ROOT=%~dp0.."
for %%I in ("%TEAM_ROOT%") do set "TEAM_ROOT=%%~fI"
set "SKILLGATE_ROOT=%TEAM_ROOT%"

where wt >nul 2>&1
if %ERRORLEVEL%==0 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-tui-window.ps1" -TeamRoot "%TEAM_ROOT%"
  exit /b %ERRORLEVEL%
)

echo Windows Terminal not found, falling back to current console...
cd /d "%TEAM_ROOT%\tui"
echo.
echo  Skillgate TUI
echo  Ctrl+Q quit   ? help   1/2/3 tabs
echo.
bun run start
pause