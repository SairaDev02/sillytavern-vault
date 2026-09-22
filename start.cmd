@echo off
REM Double-click launcher for the Character Gallery web app.
REM Builds the production bundle if needed, serves it, and opens the browser.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found on PATH. Install it from https://nodejs.org/ and try again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo   First run: installing dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   npm install failed. See the output above.
    echo.
    pause
    exit /b 1
  )
)

node "scripts\start.mjs" %*
set EXITCODE=%errorlevel%

if not "%EXITCODE%"=="0" (
  echo.
  echo   The app exited with code %EXITCODE%.
  echo.
  pause
)

endlocal
exit /b %EXITCODE%
