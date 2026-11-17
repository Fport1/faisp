#!/usr/bin/env bash
# Instala faisp para tu usuario (sin sudo): ~/.local/bin/faisp + entrada en el menú de aplicaciones.
# Uso: ./instalar.sh            (instalar o actualizar)
#      ./instalar.sh --quitar   (desinstalar; tus datos siguen en ~/.config/faisp)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
BIN="$HOME/.local/bin"
APPS="$HOME/.local/share/applications"
ICON="$HOME/.local/share/icons/hicolor/512x512/apps"

if [ "${1:-}" = "--quitar" ]; then
  pkill -x faisp 2>/dev/null || true
  rm -f "$BIN/faisp" "$APPS/faisp.desktop" "$ICON/faisp.png"
  echo "faisp desinstalado (tus datos siguen en ~/.config/faisp)."
  exit 0
fi

# WebKitGTK 4.1 es lo único que necesita del sistema
if ! ldconfig -p 2>/dev/null | grep -q "libwebkit2gtk-4.1"; then
  echo "Falta WebKitGTK 4.1. Instálalo con:"
  echo "  Ubuntu/Debian:  sudo apt install libwebkit2gtk-4.1-0"
  echo "  Fedora:         sudo dnf install webkit2gtk4.1"
  echo "  Arch:           sudo pacman -S webkit2gtk-4.1"
  exit 1
fi

pkill -x faisp 2>/dev/null || true
mkdir -p "$BIN" "$APPS" "$ICON"
install -m 755 "$DIR/faisp" "$BIN/faisp"
install -m 644 "$DIR/faisp.png" "$ICON/faisp.png"
cat > "$APPS/faisp.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=faisp
Comment=Estudio multi-IA para tus proyectos
Exec=$BIN/faisp
Icon=faisp
Terminal=false
Categories=Development;Utility;
StartupWMClass=faisp
EOF
update-desktop-database "$APPS" 2>/dev/null || true
gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
echo "faisp instalado. Búscalo como «faisp» en tu menú de aplicaciones."
nohup "$BIN/faisp" >/dev/null 2>&1 &
