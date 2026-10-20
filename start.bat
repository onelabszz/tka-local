@echo off
chcp 65001 >nul
cd /d "%~dp0"
title TKA Local Host

echo ============================================
echo   TKA Local Host
echo   (c) 2026 Ekwan Nugroho - Wonogiri
echo ============================================
echo.

if not exist "node.exe" (
  echo [ERROR] node.exe tidak ditemukan.
  echo Pastikan file node.exe ada di folder yang sama dengan start.bat
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\better-sqlite3" (
  echo [ERROR] Dependencies belum terpasang.
  echo Hubungi pembuat aplikasi.
  echo.
  pause
  exit /b 1
)

netstat -an | findstr ":3000 .*LISTENING" >nul
if %errorlevel%==0 (
  echo [INFO] Server sudah berjalan. Membuka browser...
  start "" "http://localhost:3000/guru"
  timeout /t 2 >nul
  exit /b 0
)

start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:3000/guru"

echo [INFO] Menjalankan server...
echo [INFO] Browser akan terbuka dalam 2 detik.
echo.
echo ============================================
echo   JANGAN TUTUP WINDOW INI
echo   Server harus tetap berjalan selama ujian.
echo   Untuk menghentikan: tekan Ctrl+C atau tutup window.
echo ============================================
echo.

node.exe server.js

echo.
echo [INFO] Server berhenti.
pause
