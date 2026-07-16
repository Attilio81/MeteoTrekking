@echo off
REM Launcher del BUNDLE PORTATILE (prodotto da impacchetta.ps1). Non serve Python nè Node
REM installati: Node è nella cartella node\, il backend è congelato (backend\mt-backend.exe).
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo Manca il file .env con le chiavi. Copio l'esempio, aprilo e inserisci DEEPSEEK_API_KEY.
  copy ".env.example" ".env" >nul 2>&1
  notepad ".env"
)

REM Node bundlato nel PATH (serve al server MCP e al frontend); path del server MCP
set "PATH=%~dp0node;%PATH%"
set "MCP_SERVER_PATH=%~dp0mcp\server.mjs"
set "AGENT_URL=http://127.0.0.1:7000"
set "PORT=3000"

REM backend congelato (cwd = questa cartella, così legge .env e mcp\data.db)
start "MeteoTrekking backend"  cmd /k "cd /d "%~dp0" && backend\mt-backend.exe"

REM frontend Next standalone con il node bundlato
start "MeteoTrekking frontend" cmd /k "cd /d "%~dp0frontend" && "%~dp0node\node.exe" server.js"

echo Avvio in corso... apro il browser tra qualche secondo.
timeout /t 5 >nul
start "" http://localhost:3000
endlocal
