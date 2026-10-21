@echo off
title SEKO Logistics - Kyndryl Orders Automation Dashboard
color 0B
set "PATH=C:\Program Files\nodejs;%PATH%"

echo ===============================================================================
echo            SEKO LOGISTICS MEXICO - AUTOMATIZACION DE GUIAS KYNDRYL
echo ===============================================================================
echo.
echo [1/3] Iniciando Servidor Backend FastAPI en http://localhost:8000 ...
start "Backend FastAPI (Puerto 8000)" cmd /k "python -m uvicorn src.api.server:app --host 0.0.0.0 --port 8000 --reload"

echo [2/3] Iniciando Servidor Frontend Next.js en http://localhost:3000 ...
cd frontend
start "Frontend Next.js (Puerto 3000)" cmd /k "npm run dev"
cd ..

echo [3/3] Abriendo Dashboard Operativo en el Navegador...
timeout /t 3 /nobreak > nul
start http://localhost:3000

echo.
echo ===============================================================================
echo  Dashboard Operativo iniciado correctamente!
echo  - Frontend: http://localhost:3000
echo  - API Docs: http://localhost:8000/docs
echo ===============================================================================
echo.
pause
