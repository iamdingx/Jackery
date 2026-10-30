@echo off
setlocal
cd /d "%~dp0"
set "HB_NODE="
if exist "%~dp0runtime\node.exe" set "HB_NODE=%~dp0runtime\node.exe"
if not defined HB_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "HB_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined HB_NODE for %%N in (node.exe) do set "HB_NODE=%%~$PATH:N"
if not defined HB_NODE (
  echo Node.js 24 is required. Install Node.js 24 and run this file again.
  pause
  exit /b 1
)
"%HB_NODE%" -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]===24&&v[1]>=10?0:1)"
if errorlevel 1 (
  echo This project requires Node.js 24.10 or newer within the 24.x line.
  pause
  exit /b 1
)
echo Jackery V1. Leave this window open. Press Ctrl+C to stop.
"%HB_NODE%" server.js %*
if errorlevel 1 pause
endlocal
