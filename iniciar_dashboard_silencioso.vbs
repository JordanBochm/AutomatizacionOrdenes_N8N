' ===============================================================================
' SUPPLYCHAIN MEXICO - LANZADOR SILENCIOSO EN SEGUNDO PLANO
' Inicia FastAPI y Next.js sin ninguna ventana de terminal visible (Modo 100% Oculto)
' ===============================================================================

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' Obtener la ruta del directorio del proyecto
currentDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

' 1. Iniciar FastAPI Backend en modo oculto con recarga automatica de src/
WshShell.Run "cmd /c ""python -m uvicorn src.api.server:app --host 0.0.0.0 --port 8000 --reload --reload-dir src""", 0, False

' 2. Iniciar Next.js Frontend en modo oculto
WshShell.Run "cmd /c ""set PATH=C:\Program Files\nodejs;%PATH% && cd /d """ & currentDir & "\frontend"" && npm.cmd run dev""", 0, False

' 3. Esperar 3 segundos para que los servidores inicialicen
WScript.Sleep 3000

' 4. Abrir automaticamente el navegador en el Dashboard
WshShell.Run "http://localhost:3000"
