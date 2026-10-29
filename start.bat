@echo off
cd /d "%~dp0"
title TKA Local Host

echo ============================================
echo   TKA Local Host - Menyiapkan Server...
echo ============================================
echo.
echo   JANGAN TUTUP JENDELA INI.
echo   Untuk mematikan, gunakan menu "Pengaturan" - "Matikan Server"
echo   di dalam Dashboard Guru.
echo.

:: Jalankan server di background
start /B node server.js

:: Beri waktu server untuk menyala (3 detik)
timeout /t 3 /nobreak > NUL

:: Buka Edge dalam mode Aplikasi (tanpa address bar)
start msedge --app=http://localhost:3000/guru

:: Fallback: Jika Edge tidak terinstal, buka browser default
if errorlevel 1 start http://localhost:3000/guru

echo.
echo Server berjalan. Jendela ini akan tertutup otomatis.
timeout /t 5 > NUL
exit
