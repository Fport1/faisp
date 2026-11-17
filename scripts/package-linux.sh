#!/usr/bin/env bash
# Monta dist/faisp-linux-x64.tar.gz: binario, icono, instalador y LÉEME.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/faisp
cp target/release/faisp dist/faisp/faisp
chmod +x dist/faisp/faisp
cp ui/icon-512.png dist/faisp/faisp.png
cp assets/dist/instalar-linux.sh dist/faisp/instalar.sh
cp assets/dist/LEEME-linux.txt dist/faisp/LEEME.txt
chmod +x dist/faisp/instalar.sh
tar -C dist -czf dist/faisp-linux-x64.tar.gz faisp
ls -la dist
