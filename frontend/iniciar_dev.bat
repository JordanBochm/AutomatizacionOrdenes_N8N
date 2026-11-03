@echo off
title SupplyChain Mexico - Frontend Dev

set "NODE_FOUND="
for /f "delims=" %%I in ('where node 2^>nul') do set "NODE_FOUND=%%I"
if not defined NODE_FOUND (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else (
        echo [ERROR] Node.js no fue encontrado en el sistema.
        pause
        exit /b 1
    )
)

cd /d "%~dp0"
npm.cmd run dev
