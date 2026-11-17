#!/usr/bin/env bash
# Monta dist/faisp.app (binario universal Intel + Apple Silicon) y dist/faisp-macos.zip.
# Si hay certificado Developer ID y clave de notarización (variables de entorno), firma y notariza;
# si no, firma ad-hoc (obligatoria para que arranque en Apple Silicon).
set -euo pipefail
cd "$(dirname "$0")/.."
VER=$(grep -m1 '^version' Cargo.toml | cut -d'"' -f2)
APP=dist/faisp.app
rm -rf dist && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

lipo -create target/aarch64-apple-darwin/release/faisp target/x86_64-apple-darwin/release/faisp -output "$APP/Contents/MacOS/faisp"
chmod +x "$APP/Contents/MacOS/faisp"

# Icono .icns a partir del PNG de 512 px
ICONSET=$(mktemp -d)/faisp.iconset && mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s ui/icon-512.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2)); sips -z $d $d ui/icon-512.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/faisp.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>faisp</string>
  <key>CFBundleDisplayName</key><string>faisp</string>
  <key>CFBundleIdentifier</key><string>app.faisp.desktop</string>
  <key>CFBundleExecutable</key><string>faisp</string>
  <key>CFBundleIconFile</key><string>faisp</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VER}</string>
  <key>CFBundleVersion</key><string>${VER}</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.developer-tools</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST

if [ -n "${MAC_CSC_LINK:-}" ] && [ -n "${NOTARY_KEY_ID:-}" ]; then
  echo "Firmando con Developer ID y notarizando"
  KEYCHAIN="$RUNNER_TEMP/build.keychain-db"; KP=$(openssl rand -base64 24)
  security create-keychain -p "$KP" "$KEYCHAIN"
  security set-keychain-settings -lut 21600 "$KEYCHAIN"
  security unlock-keychain -p "$KP" "$KEYCHAIN"
  security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | sed 's/"//g')
  echo "$MAC_CSC_LINK" | base64 --decode > "$RUNNER_TEMP/cert.p12"
  security import "$RUNNER_TEMP/cert.p12" -k "$KEYCHAIN" -P "$MAC_CSC_KEY_PASSWORD" -T /usr/bin/codesign
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KP" "$KEYCHAIN"
  rm -f "$RUNNER_TEMP/cert.p12"
  ID=$(security find-identity -v -p codesigning "$KEYCHAIN" | grep "Developer ID Application" | head -1 | sed -E 's/.*"(.*)".*/\1/')
  codesign --force --options runtime --timestamp -s "$ID" "$APP"
  printf '%s' "$NOTARY_KEY_CONTENT" > "$RUNNER_TEMP/AuthKey.p8"
  ditto -c -k --keepParent "$APP" dist/notarizar.zip
  # Con timeout propio: si Apple no responde, no se queda colgado horas
  timeout 2100 xcrun notarytool submit dist/notarizar.zip --key "$RUNNER_TEMP/AuthKey.p8" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER" --wait
  xcrun stapler staple "$APP"
  rm -f dist/notarizar.zip "$RUNNER_TEMP/AuthKey.p8"
else
  echo "Sin secrets de Apple: firma ad-hoc (al abrirla la primera vez, macOS pedirá permiso)"
  codesign --force --deep -s - "$APP"
fi

# El .zip lleva faisp.app y el LÉEME (ditto conserva permisos y la firma)
mkdir -p dist/pack
ditto "$APP" dist/pack/faisp.app
cp assets/dist/LEEME-macOS.txt dist/pack/LEEME.txt
ditto -c -k --sequesterRsrc dist/pack dist/faisp-macos.zip
ls -la dist
