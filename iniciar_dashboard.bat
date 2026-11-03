@echo off
title SupplyChain Mexico - Kyndryl Dashboard

set "NODE_FOUND="
for /f "delims=" %%I in ('where node 2^>nul') do set "NODE_FOUND=%%I"
if not defined NODE_FOUND (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else (
        echo [ERROR] Node.js no fue encontrado en el PATH ni en C:\Program Files\nodejs.
        echo Por favor instala Node.js antes de iniciar el Dashboard.
        pause
        exit /b 1
    )
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>nul

wscript.exe "%~dp0iniciar_dashboard_silencioso.vbs"
exit
