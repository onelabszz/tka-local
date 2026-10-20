#!/usr/bin/env bash
# Setup TKA Local Host sekali jalan
set -e

cd "$(dirname "$0")"

echo "============================================"
echo "  Setup TKA Local Host"
echo "============================================"

# Cek Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js tidak ditemukan. Install dulu:"
  echo "   sudo dnf install nodejs"
  exit 1
fi

echo "✓ Node.js $(node -v)"

# Install dependencies
echo ""
echo "→ Install dependencies…"
if [ ! -d node_modules ]; then
  npm install
else
  echo "  node_modules sudah ada, skip."
fi

# Pastikan folder ada
mkdir -p paket public backups

# Buat file .desktop
APP_DIR="$(pwd)"
DESKTOP_FILE="$HOME/Desktop/tka-local.desktop"
APPLICATIONS_FILE="$HOME/.local/share/applications/tka-local.desktop"

ICON_PATH="$APP_DIR/public/favicon.png"

cat > "$APPLICATIONS_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=TKA Local Host
Comment=Server ujian lokal untuk guru
Exec=$APP_DIR/start.sh
Path=$APP_DIR
Icon=$ICON_PATH
Terminal=false
Categories=Education;
EOF

chmod +x "$APPLICATIONS_FILE"
cp "$APPLICATIONS_FILE" "$DESKTOP_FILE"
chmod +x "$DESKTOP_FILE"
# GNOME butuh ini agar .desktop di Desktop bisa diklik
gio set "$DESKTOP_FILE" metadata::trusted true 2>/dev/null || true

echo ""
echo "✓ Shortcut desktop dibuat:"
echo "  $DESKTOP_FILE"
echo "  $APPLICATIONS_FILE"
echo ""
echo "Selesai! Klik ikon 'TKA Local Host' di desktop atau menu aplikasi."
