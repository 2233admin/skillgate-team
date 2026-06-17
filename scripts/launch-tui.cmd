@echo off
setlocal
if not defined SKILLGATE_ROOT set "SKILLGATE_ROOT=%~dp0.."
set "SKILLGATE_ROOT=%SKILLGATE_ROOT:\=/%"
set "SKILLGATE_ROOT=%SKILLGATE_ROOT:/=\%"
cd /d "%SKILLGATE_ROOT%\tui"
echo.
echo  Skillgate TUI
echo  Ctrl+Q quit   ? help   1/2/3 tabs
echo.
bun run start
pause