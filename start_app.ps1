# ===============================================================================
# SUPPLYCHAIN MEXICO - AUTOMATIZACION DE GUIAS KYNDRYL
# Script de inicio PowerShell para Backend FastAPI y Frontend Next.js
# ===============================================================================

Write-Host "===============================================================================" -ForegroundColor DarkBlue
Write-Host "       SUPPLYCHAIN MEXICO - DASHBOARD DE OPERACIONES TMS ESTAFETA              " -ForegroundColor White
Write-Host "===============================================================================" -ForegroundColor DarkBlue

$ROOT_DIR = $PSScriptRoot
Set-Location $ROOT_DIR

# Blindaje de PATH: Inyectar Node.js explicitamente en la sesion actual
$nodePath = "C:\Program Files\nodejs"
if (Test-Path $nodePath) {
    $env:Path = "$nodePath;$env:Path"
}

# 1. Iniciar FastAPI en segundo plano
Write-Host "[1/3] Iniciando Backend FastAPI en http://localhost:8000 ..." -ForegroundColor Cyan
$backendProcess = Start-Process -FilePath "python" -ArgumentList "-m uvicorn src.api.server:app --host 0.0.0.0 --port 8000 --reload" -PassThru -WindowStyle Hidden

# 2. Iniciar Next.js en segundo plano usando npm.cmd con PATH inyectado
Write-Host "[2/3] Iniciando Frontend Next.js en http://localhost:3000 ..." -ForegroundColor Cyan
$frontendCmd = "set PATH=C:\Program Files\nodejs;%PATH% && cd /d `"$ROOT_DIR\frontend`" && npm.cmd run dev"
$frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $frontendCmd" -PassThru -WindowStyle Hidden

# 3. Esperar 3 segundos y abrir navegador
Write-Host "[3/3] Abriendo el navegador en http://localhost:3000 ..." -ForegroundColor Green
Start-Sleep -Seconds 3
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host ">>> Dashboard Operativo iniciado exitosamente en segundo plano! <<<" -ForegroundColor Green
Write-Host "Para detener los servidores cuando termines, ejecuta: .\detener_dashboard.bat" -ForegroundColor Yellow
Write-Host ""
