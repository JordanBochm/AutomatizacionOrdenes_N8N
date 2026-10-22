@echo off
title SupplyChain Mexico - Kyndryl Dashboard
set "PATH=C:\Program Files\nodejs;%PATH%"

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>nul

wscript.exe "%~dp0iniciar_dashboard_silencioso.vbs"
exit
