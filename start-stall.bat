@echo off
rem ---------------------------------------------------------------------------
rem  Beat Our AI - start the stall copy (works with Wi-Fi off).
rem  Double-click this file. Keep the black window open while the stall runs.
rem
rem  The address is ALWAYS http://localhost:4173/ . The leaderboard is saved in the
rem  browser for that exact address, so never use another port or 127.0.0.1.
rem  Needs (once, with internet): Node.js, then "npm install" and "npm run build".
rem ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"
title Beat Our AI - stall server (keep this window open)
set "PORT=4173"
set "URL=http://localhost:%PORT%/"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [PROBLEM] Node.js is not installed on this laptop.
  echo  Install the LTS version from https://nodejs.org while you have internet,
  echo  then double-click this file again.
  goto :fail
)

if not exist "node_modules\vite\" (
  echo.
  echo  [PROBLEM] The project's tools are not installed yet.
  echo  With internet, open a terminal in this folder and run:  npm install
  goto :fail
)

if not exist "dist\index.html" (
  echo.
  echo  [PROBLEM] The site has not been built yet: dist\index.html is missing.
  echo  Open a terminal in this folder and run:  npm run build
  goto :fail
)

echo.
echo  Starting Beat Our AI at %URL%
echo  Keep this window open. Close it (or press Ctrl+C) to stop the game.
echo  If you see "Port 4173 is already in use", the game is probably already
echo  running in another window: use that one, or close it and try again.
echo.

rem Open the browser a moment after the server starts (set STALL_NO_BROWSER=1 to skip, for testing).
if not defined STALL_NO_BROWSER start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" "%URL%""

rem --strictPort: stop with an error instead of quietly moving to another port
rem (another port = a different, empty leaderboard).
call npx vite preview --port %PORT% --strictPort --host localhost
echo.
echo  The game server has stopped.
goto :fail

:fail
echo.
pause
exit /b 1
