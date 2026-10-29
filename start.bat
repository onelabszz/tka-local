@echo off
cd /d "%~dp0"
title TKA Local Host

echo ============================================
echo   TKA Local Host - Menyiapkan Server...
echo ============================================
echo.

:: Jalankan server di background
start /B node server.js

:: Tunggu server siap
timeout /t 3 /nobreak > NUL

:: Jalur Edge
set "EDGE_PROXY=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge_proxy.exe"
set "EDGE_MAIN=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE_PROXY%" set "EDGE_PROXY=%ProgramFiles%\Microsoft\Edge\Application\msedge_proxy.exe"
if not exist "%EDGE_MAIN%" set "EDGE_MAIN=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE_PROXY%" (
    :: Pakai msedge_proxy (best — tidak buka jendela utama Edge)
    start "" "%EDGE_PROXY%" --app=http://localhost:3000/guru --no-first-run --no-default-browser-check
) else if exist "%EDGE_MAIN%" (
    :: Fallback ke msedge biasa dengan flag anti-window-extra
    start "" "%EDGE_MAIN%" --app=http://localhost:3000/guru --no-first-run --no-default-browser-check
) else (
    :: Fallback ke browser default (jarang terjadi di Win10/11)
    start "" http://localhost:3000/guru
)

echo.
echo Server berjalan.
timeout /t 3 > NUL
exit
