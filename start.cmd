@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install it from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

if not exist "server\node_modules" (
  echo Installing server dependencies, this happens once...
  call npm install --prefix server
  if errorlevel 1 goto :error
)

if not exist "client\dist\index.html" (
  echo Building the client for the first run, this can take a minute...
  call npm run build
  if errorlevel 1 goto :error
)

start "" "http://localhost:4000"
echo Starting Life Hub on http://localhost:4000 ...
call npm start
goto :eof

:error
echo.
echo Something went wrong, see the messages above.
pause
exit /b 1
