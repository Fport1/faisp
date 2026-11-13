# Instala faisp para el usuario actual (sin permisos de administrador):
#   %LOCALAPPDATA%\Programs\faisp\faisp.exe  +  acceso en el menú Inicio (aparece al buscar "faisp")
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\install.ps1 [-Desktop] [-Uninstall]
param([switch]$Desktop, [switch]$Uninstall)
$ErrorActionPreference = 'Stop'

$root      = Split-Path -Parent $PSScriptRoot
$dest      = Join-Path $env:LOCALAPPDATA 'Programs\faisp'
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$lnkStart  = Join-Path $startMenu 'faisp.lnk'
$lnkDesk   = Join-Path ([Environment]::GetFolderPath('Desktop')) 'faisp.lnk'

if ($Uninstall) {
  Get-Process faisp -ErrorAction SilentlyContinue | Stop-Process -Force
  foreach ($p in @($lnkStart, $lnkDesk)) { if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force } }
  if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
  Write-Output "faisp desinstalado (tus datos siguen en $env:APPDATA\faisp)."
  return
}

$exe = Join-Path $root 'target\release\faisp.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "No existe $exe. Compila antes: cargo build --release" }

# Cierra una instancia abierta para poder sobrescribir el ejecutable
Get-Process faisp -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 300

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -LiteralPath $exe -Destination (Join-Path $dest 'faisp.exe') -Force
Copy-Item -LiteralPath (Join-Path $root 'assets\faisp.ico') -Destination (Join-Path $dest 'faisp.ico') -Force

$shell = New-Object -ComObject WScript.Shell
function New-Shortcut($path) {
  $s = $shell.CreateShortcut($path)
  $s.TargetPath = Join-Path $dest 'faisp.exe'
  $s.WorkingDirectory = $dest
  $s.IconLocation = (Join-Path $dest 'faisp.ico') + ',0'
  $s.Description = 'faisp - estudio multi-IA'
  $s.Save()
}
New-Shortcut $lnkStart
if ($Desktop) { New-Shortcut $lnkDesk }

Write-Output "Instalado en $dest"
Write-Output "Menú Inicio: $lnkStart  (busca 'faisp' en Windows)"
if ($Desktop) { Write-Output "Escritorio: $lnkDesk" }
