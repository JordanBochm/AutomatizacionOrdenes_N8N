# ===============================================================================
# SEKO LOGISTICS MEXICO - AUTOMATIZACION DE GUIAS KYNDRYL
# Script de inicio PowerShell para Backend FastAPI y Frontend Next.js
# ===============================================================================

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "       SEKO LOGISTICS MEXICO - DASHBOARD DE AUTOMATIZACION KYNDRYL             " -ForegroundColor White
Write-Host "===============================================================================" -ForegroundColor Cyan

$ROOT_DIR = $PSScriptRoot
Set-Location $ROOT_DIR
$env:Path = "C:\Program Files\nodejs;" + $env:Path

# 1. Iniciar FastAPI en segundo plano
Write-Host "[1/3] Iniciando Backend FastAPI en http://localhost:8000 ..." -ForegroundColor Yellow
$backendProcess = Start-Process -FilePath "python" -ArgumentList "-m uvicorn src.api.server:app --host 0.0.0.0 --port 8000 --reload" -PassThru -WindowStyle Normal

# 2. Iniciar Next.js en segundo plano
Write-Host "[2/3] Iniciando Frontend Next.js en http://localhost:3000 ..." -ForegroundColor Yellow
$frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd frontend && npm run dev" -PassThru -WindowStyle Normal

# 3. Esperar 3 segundos y abrir navegador
Write-Host "[3/3] Abriendo el navegador en http://localhost:3000 ..." -ForegroundColor Green
Start-Sleep -Seconds 3
Start-Process "http://localhost:3000"

Write-Host "Dashboard Operativo iniciado con exito." -ForegroundColor Cyan
Write-Host "Presiona cualquier tecla para detener los servicios cuando termines..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Limpieza al cerrar
Stop-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue
Stop-Process -Id $frontendProcess.Id -ErrorAction SilentlyContinue
