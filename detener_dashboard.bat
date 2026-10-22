@echo off
title SEKO Logistics - Detener Dashboard
color 0C

echo ===============================================================================
echo            SEKO LOGISTICS MEXICO - DETENER SERVICIOS EN SEGUNDO PLANO
echo ===============================================================================
echo.
echo Deteniendo procesos en puertos 8000 (Backend) y 3000 (Frontend)...

powershell -Command "Get-NetTCPConnection -LocalPort 8000, 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo.
echo [OK] Servidores detenidos exitosamente. Ya no consumen recursos.
echo.
pause
