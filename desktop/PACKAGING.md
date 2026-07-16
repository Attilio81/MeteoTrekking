# Distribuzione — bundle portatile

MeteoTrekking Desktop si distribuisce come **cartella portatile**: l'utente finale non
installa nè Python nè Node. Non è un singolo `.exe` perchè lo stack ha tre runtime
(backend Python, server MCP Node, frontend Next/Node) e la route server del frontend
richiede Node a runtime: un eseguibile unico che li contenga tutti non è realistico. Il
bundle è l'equivalente "installa-niente" (~200 MB una volta zippato).

## Cosa contiene

```
MeteoTrekking/
  backend/        backend congelato con PyInstaller (mt-backend.exe + _internal) — niente Python
  frontend/       build Next.js "standalone" (server.js) — niente npm install
  mcp/            server.mjs + mcp-core.mjs + data.db + node_modules
  node/           Node portatile (>= 22.5, serve a MCP e al frontend; per node:sqlite)
  .env            chiavi dell'utente (DEEPSEEK_API_KEY, opzionale TAVILY_API_KEY)
  avvia-app.bat   launcher: backend :7000, frontend :3000, apre il browser
```

## Come si costruisce

Dalla cartella `desktop/`, con Python e Node installati **sulla macchina di build**:

```powershell
powershell -ExecutionPolicy Bypass -File impacchetta.ps1
```

Lo script:
1. builda il frontend (`next build`, output standalone);
2. congela il backend con PyInstaller (`--collect-all agno`);
3. rigenera `mcp/data.db` da `index.html`;
4. scarica Node portatile;
5. assembla tutto in `dist-app/MeteoTrekking/`.

Poi zippa `dist-app/MeteoTrekking` e distribuiscila.

## Uso lato utente

1. Scompatta la cartella.
2. Lancia `avvia-app.bat`: al primo avvio apre `.env` per incollare le chiavi (o si impostano
   poi dal pannello **Impostazioni** ⚙ nell'app).
3. Si apre `http://localhost:3000`.

## Note

- **Node >= 22.5** è incluso nel bundle: il server MCP usa `node:sqlite`.
- Le chiavi restano in `.env` locale; si modificano anche a runtime dal pannello Impostazioni
  (Tavily si applica subito, provider/modello dal messaggio successivo).
- Senza chiave Tavily l'app funziona lo stesso: gli itinerari si limitano ai sentieri OSM.
- La variante **MCP HTTP** su Vercel (`../api/mcp.mjs`) è un altro canale di distribuzione,
  indipendente da questo bundle.
