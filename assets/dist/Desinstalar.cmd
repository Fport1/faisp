@echo off
chcp 65001 >nul
title Desinstalar faisp
echo.
echo  Se quitara faisp de este PC. Tus chats, claves y ajustes se conservan en %%APPDATA%%\faisp
echo  (borra esa carpeta a mano si tambien quieres eliminarlos).
echo.
choice /m " Desinstalar faisp"
if errorlevel 2 exit /b 0
cd /d "%TEMP%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process faisp -EA SilentlyContinue | Stop-Process -Force; Start-Sleep -Milliseconds 500; foreach ($l in @((Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\faisp.lnk'), (Join-Path ([Environment]::GetFolderPath('Desktop')) 'faisp.lnk'))) { if (Test-Path -LiteralPath $l) { Remove-Item -LiteralPath $l -Force } }; $d = Join-Path $env:LOCALAPPDATA 'Programs\faisp'; foreach ($f in 'faisp.exe','WebView2Loader.dll','faisp.ico') { $p = Join-Path $d $f; if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force } }"
echo.
echo  faisp desinstalado.
timeout /t 4 >nul
(goto) 2>nul & del "%~f0"
