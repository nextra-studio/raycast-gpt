@echo off
setlocal
cd /d "%~dp0"
echo GPT Tools for Raycast Windows
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org first, then run this again.
  pause
  exit /b 1
)
node -e "if (!(Number(process.versions.node.split('.')[0]) >= 24)) process.exit(1)"
if errorlevel 1 (
  echo Please update to Node.js 24 LTS before continuing.
  pause
  exit /b 1
)
where codex >nul 2>nul
if errorlevel 1 (
  echo Codex CLI not found. Installing it with npm...
  call npm install -g @openai/codex
  if errorlevel 1 goto failed
  set "PATH=%PATH%;%APPDATA%\npm"
)
call codex login status 2>&1 | findstr /i "ChatGPT" >nul
if errorlevel 1 (
  echo.
  echo Not signed in to Codex yet. A browser window opens: choose "Sign in with ChatGPT".
  call codex login
)
echo.
echo Installing the Raycast development packages...
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
echo Checking TypeScript...
call npm run typecheck
if errorlevel 1 goto failed
echo Running local tests...
call npm test
if errorlevel 1 goto failed
echo Building the Raycast extension...
call npm run build
if errorlevel 1 goto failed
echo.
echo Loading the extension into Raycast. Keep this window open during your first test.
call npm run dev
exit /b %errorlevel%
:failed
echo.
echo Setup stopped at the failed step above. No old scripts or account settings were changed.
pause
exit /b 1
