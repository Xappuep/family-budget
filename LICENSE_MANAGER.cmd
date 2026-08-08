@echo off
setlocal
cd /d "%~dp0"
echo Starting License Manager...
call npm run license-manager
if errorlevel 1 (
  echo.
  echo License Manager failed. See the message above.
  pause
  exit /b 1
)
pause
