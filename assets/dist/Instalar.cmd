@echo off
chcp 65001 >nul
title Instalar faisp
if not exist "%~dp0faisp.exe" (
  echo.
  echo  Primero descomprime el .zip: clic derecho sobre el archivo, "Extraer todo",
  echo  y luego abre Instalar.cmd desde la carpeta extraida.
  echo.
  pause
  exit /b 1
)
echo.
echo  Instalando faisp para tu usuario (no hace falta ser administrador)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $src='%~dp0'; $dest=Join-Path $env:LOCALAPPDATA 'Programs\faisp'; Get-Process faisp -EA SilentlyContinue | Stop-Process -Force; Start-Sleep -Milliseconds 500; New-Item -ItemType Directory -Force -Path $dest | Out-Null; foreach ($f in 'faisp.exe','WebView2Loader.dll','faisp.ico','Desinstalar.cmd') { Copy-Item -LiteralPath (Join-Path $src $f) -Destination (Join-Path $dest $f) -Force }; $sh = New-Object -ComObject WScript.Shell; foreach ($l in @((Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\faisp.lnk'), (Join-Path ([Environment]::GetFolderPath('Desktop')) 'faisp.lnk'))) { try { New-Item -ItemType Directory -Force -Path (Split-Path $l) | Out-Null; $s = $sh.CreateShortcut($l); $s.TargetPath = Join-Path $dest 'faisp.exe'; $s.WorkingDirectory = $dest; $s.IconLocation = (Join-Path $dest 'faisp.ico') + ',0'; $s.Description = 'faisp - estudio multi-IA'; $s.Save() } catch { Write-Host ('  Aviso: no se pudo crear el acceso ' + $l) } }; Start-Process (Join-Path $dest 'faisp.exe')"
if errorlevel 1 (
  echo.
  echo  No se pudo instalar. Cierra faisp si esta abierto y vuelve a intentarlo.
  pause
  exit /b 1
)
echo.
echo  Listo. faisp se esta abriendo.
echo  Tambien la encuentras buscando "faisp" en el menu Inicio y en el escritorio.
timeout /t 5 >nul
