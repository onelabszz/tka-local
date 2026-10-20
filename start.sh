#!/usr/bin/env bash
# Launcher TKA Local Host — dipanggil oleh ikon desktop

cd "$(dirname "$0")"

# Cek Node.js
if ! command -v node >/dev/null 2>&1; then
  xmessage "Node.js tidak ditemukan. Jalankan install.sh dulu." 2>/dev/null \
    || zenity --error --text="Node.js tidak ditemukan. Jalankan install.sh dulu." 2>/dev/null \
    || echo "Node.js tidak ditemukan."
  exit 1
fi

# Cek dependencies
if [ ! -d node_modules ]; then
  xmessage "Dependencies belum terinstal. Jalankan install.sh dulu." 2>/dev/null \
    || zenity --error --text="Dependencies belum terinstal. Jalankan install.sh dulu." 2>/dev/null
  exit 1
fi

# Cek port 3000 (kalau sudah ada yang pakai, kemungkinan server sudah jalan)
if command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null | grep -q ':3000 '; then
  # Sudah ada server jalan — buka browser saja
  xdg-open "http://localhost:3000/guru" 2>/dev/null
  exit 0
fi

# Jalankan server di background, log ke file
LOG_FILE="$(pwd)/tka.log"
nohup node server.js > "$LOG_FILE" 2>&1 &

# Tunggu server siap (max 10 detik)
for i in $(seq 1 20); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/teacher/info 2>/dev/null | grep -q 200; then
    break
  fi
  sleep 0.5
done

echo "Server berjalan. Log: $LOG_FILE"
