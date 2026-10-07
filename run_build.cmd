@echo off
setlocal
REM Magpie build: install, type check + build all packages, then run tests.
REM   run_build.cmd           -> install + build + test, then pause
REM   run_build.cmd notest    -> skip tests
REM   run_build.cmd nopause   -> do not pause at the end (for terminals and CI)
REM Outputs:
REM   client\dist\            static files for nginx
REM   server\dist\server.mjs  API server bundle (run: node server.mjs, with .env next to it)

cd /d "%~dp0"

set "RUN_TESTS=1"
set "PAUSE_AT_END=1"
for %%A in (%*) do (
  if /I "%%~A"=="notest" set "RUN_TESTS=0"
  if /I "%%~A"=="nopause" set "PAUSE_AT_END=0"
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pnpm not found. Install it with: npm install -g pnpm
  goto :fail
)

echo =====================================================
echo [1/3] Installing packages...
echo =====================================================
call pnpm install --frozen-lockfile || goto :fail

echo =====================================================
echo [2/3] Type check + build...
echo =====================================================
call pnpm build || goto :fail

if "%RUN_TESTS%"=="0" (
  echo [3/3] Tests skipped.
  goto :done
)
echo =====================================================
echo [3/3] Tests...
echo =====================================================
call pnpm test || goto :fail

:done
echo.
echo =====================================================
echo BUILD OK
echo   client : %~dp0client\dist
echo   server : %~dp0server\dist\server.mjs
echo =====================================================
if "%PAUSE_AT_END%"=="1" pause
endlocal
exit /b 0

:fail
echo.
echo BUILD FAILED
if "%PAUSE_AT_END%"=="1" pause
endlocal
exit /b 1
