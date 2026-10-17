@echo off
setlocal
REM Magpie dev run.
REM   run_dev.cmd          -> API server (3473) + client (http://localhost:5480)
REM   run_dev.cmd server   -> API server only
REM   run_dev.cmd client   -> client only
REM Stop with Ctrl+C.

cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pnpm not found. Install it with: npm install -g pnpm
  goto :fail
)

if not exist "server\.env" (
  echo [ERROR] server\.env not found.
  echo         Copy server\.env.example to server\.env and fill in the DB settings.
  goto :fail
)

REM Always install: a pull can add a new workspace package (e.g. a new game),
REM and an old node_modules would not link it. Takes a second when up to date.
echo Installing packages...
call pnpm install || goto :fail

set "MODE=%~1"
if "%MODE%"=="" set "MODE=all"

if /I "%MODE%"=="all" (
  echo Starting API server ^(3473^) + client ^(http://localhost:5480^)...
  call pnpm dev
  goto :end
)
if /I "%MODE%"=="server" (
  echo Starting API server ^(3473^)...
  call pnpm --filter @magpie/server dev
  goto :end
)
if /I "%MODE%"=="client" (
  echo Starting client ^(http://localhost:5480^)...
  call pnpm --filter @magpie/client dev
  goto :end
)

echo Unknown mode "%MODE%". Use: all ^| server ^| client
goto :fail

:fail
echo.
echo RUN FAILED
pause
exit /b 1

:end
endlocal
exit /b 0
