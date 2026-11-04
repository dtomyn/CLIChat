@echo off
title Lumen
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is required. Install it from https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Setting things up for the first time... & call npm install --no-fund --no-audit)
echo Starting Lumen... your browser will open in a moment. Keep this window open while you use Lumen.
node server.js --open
pause
