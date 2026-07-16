@echo off
setlocal
cd /d "%~dp0"

echo === MeteoTrekking Desktop ===

REM --- backend: venv + dipendenze ---
if not exist backend\.venv (
  echo Creo virtualenv...
  python -m venv backend\.venv || goto :err
)
call backend\.venv\Scripts\python -m pip install -q -r backend\requirements.txt || goto :err

if not exist backend\.env (
  copy backend\.env.example backend\.env >nul
  echo.
  echo  ** Inserisci la tua DEEPSEEK_API_KEY in  backend\.env  poi rilancia. **
  echo.
  notepad backend\.env
  goto :end
)

REM --- frontend: dipendenze ---
if not exist frontend\node_modules (
  echo Installo dipendenze frontend...
  pushd frontend && call npm install || goto :err
  popd
)

REM --- avvio: backend :7000 (AgentOS/AG-UI) + frontend :3000 (Next/CopilotKit) ---
start "MeteoTrekking backend"  cmd /k "cd /d "%~dp0backend" && "%~dp0backend\.venv\Scripts\python" agent.py"
start "MeteoTrekking frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Backend  -> http://127.0.0.1:7000
echo Frontend -> http://localhost:3000   (aprilo nel browser)
goto :end

:err
echo ERRORE durante il setup. Controlla i messaggi sopra.
:end
endlocal
pause
