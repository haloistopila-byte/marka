@echo off
setlocal
title Marka Photobooth
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Pasang versi LTS dari https://nodejs.org lalu jalankan file ini lagi.
  pause
  exit /b 1
)

node scripts\start-windows.mjs

echo.
echo App berhenti.
pause
