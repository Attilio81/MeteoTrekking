# Costruisce un BUNDLE PORTATILE di MeteoTrekking Desktop: l'utente finale non
# installa nulla (nè Python nè Node). Produce  dist-app\MeteoTrekking\  con:
#   backend\   -> backend congelato (PyInstaller, niente Python)
#   frontend\  -> Next.js standalone (gira con node bundlato, niente npm install)
#   mcp\       -> server MCP + data.db + node_modules
#   node\      -> Node portatile (per MCP e frontend)
#   avvia-app.bat -> launcher (avvia backend :7000, frontend :3000, apre il browser)
#
# NB: non è un singolo .exe: lo stack ha 3 runtime (backend Python, MCP Node,
# frontend Next/Node). Un .exe unico non è fattibile; questo bundle è l'equivalente
# "installa-niente" realistico (~200 MB).
#
# Uso (dalla cartella desktop):  powershell -ExecutionPolicy Bypass -File impacchetta.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$repo = Split-Path $root -Parent
$out  = Join-Path $root "dist-app\MeteoTrekking"
$nodeVer = "v22.20.0"   # >= 22.5 richiesto da node:sqlite

Write-Host "== 1/6 frontend: next build (standalone) =="
Push-Location (Join-Path $root "frontend")
if (-not (Test-Path node_modules)) { npm install }
npm run build
Pop-Location

Write-Host "== 2/6 backend: PyInstaller =="
Push-Location (Join-Path $root "backend")
if (-not (Test-Path ".venv")) { python -m venv .venv }
& .\.venv\Scripts\python -m pip install -q -r requirements.txt pyinstaller
& .\.venv\Scripts\pyinstaller --noconfirm --onedir --name mt-backend `
    --collect-all agno `
    --hidden-import uvicorn.loops.auto --hidden-import uvicorn.protocols.http.auto `
    --hidden-import uvicorn.protocols.websockets.auto --hidden-import uvicorn.lifespan.on agent.py
Pop-Location

Write-Host "== 3/6 data.db =="
& node (Join-Path $repo "scripts\build-db.mjs")

Write-Host "== 4/6 Node portatile ($nodeVer) =="
$nodeZip = Join-Path $env:TEMP "node-$nodeVer-win-x64.zip"
if (-not (Test-Path $nodeZip)) {
  Invoke-WebRequest "https://nodejs.org/dist/$nodeVer/node-$nodeVer-win-x64.zip" -OutFile $nodeZip
}

Write-Host "== 5/6 assemblo il bundle =="
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force $out | Out-Null

# backend congelato
Copy-Item (Join-Path $root "backend\dist\mt-backend") (Join-Path $out "backend") -Recurse

# mcp: server + dati + dipendenze
New-Item -ItemType Directory -Force (Join-Path $out "mcp") | Out-Null
Copy-Item (Join-Path $repo "mcp\server.mjs")   (Join-Path $out "mcp")
Copy-Item (Join-Path $repo "mcp\mcp-core.mjs") (Join-Path $out "mcp")
Copy-Item (Join-Path $repo "mcp\data.db")      (Join-Path $out "mcp")
Copy-Item (Join-Path $repo "mcp\node_modules") (Join-Path $out "mcp\node_modules") -Recurse

# frontend standalone (server.js + static + public)
$fe = Join-Path $root "frontend"
Copy-Item (Join-Path $fe ".next\standalone\*") (Join-Path $out "frontend") -Recurse -Force
New-Item -ItemType Directory -Force (Join-Path $out "frontend\.next\static") | Out-Null
Copy-Item (Join-Path $fe ".next\static\*") (Join-Path $out "frontend\.next\static") -Recurse -Force
Copy-Item (Join-Path $fe "public") (Join-Path $out "frontend\public") -Recurse -Force

# node portatile
Expand-Archive $nodeZip -DestinationPath (Join-Path $out "_node") -Force
Move-Item (Join-Path $out "_node\node-$nodeVer-win-x64") (Join-Path $out "node")
Remove-Item (Join-Path $out "_node") -Recurse -Force

# .env di esempio + launcher
Copy-Item (Join-Path $root "backend\.env.example") (Join-Path $out ".env")
Copy-Item (Join-Path $root "avvia-app.bat") (Join-Path $out "avvia-app.bat")

Write-Host "== 6/6 fatto =="
Write-Host "Bundle: $out"
Write-Host "Zippa la cartella e distribuiscila. L'utente inserisce le chiavi in .env e lancia avvia-app.bat"
