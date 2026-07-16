# 🏔️ MeteoTrekking Desktop

App Windows: la mappa MeteoTrekking + un **assistente AI** che risponde con dati veri
(meteo, rifugi, sentieri, soste camper, allerte) tramite il server **MCP** del progetto.

Stack (riusa i pattern degli agenti EGM):
- **Backend**: [AGNO](https://docs.agno.com) `Agent` + AgentOS + interfaccia **AG-UI** su FastAPI.
  Modello **DeepSeek** (via `model_factory.py`, cambiabile da `.env`). Si collega al server MCP
  `../mcp/server.mjs` in **stdio** — AgentOS ne gestisce il ciclo di vita.
- **Frontend**: **Next.js + CopilotKit** (adapter `@ag-ui/agno`). Mappa (`index.html` del repo)
  in un iframe a tutto schermo + chat laterale.

```
desktop/
  backend/   agent.py · model_factory.py · requirements.txt · .env.example
  frontend/  Next.js + CopilotKit (app/, components/, scripts/copy-map.mjs)
  avvia.bat  one-click: venv + deps + avvio backend :7000 e frontend :3000
```

## Prerequisiti

- **Python 3.11+** e **Node.js 18+** nel PATH (Node serve sia al frontend sia al server MCP).
- Una **chiave DeepSeek** ([platform.deepseek.com](https://platform.deepseek.com)).

## Avvio

1. Doppio clic su **`avvia.bat`**. Al primo giro crea il venv, installa tutto e apre
   `backend\.env`: incolla `DEEPSEEK_API_KEY=...`, salva, rilancia `avvia.bat`.
2. Si aprono due finestre (backend + frontend). Apri **http://localhost:3000**.

Manuale:
```bash
# backend
cd backend && python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # inserisci DEEPSEEK_API_KEY
python agent.py          # :7000

# frontend
cd frontend && npm install && npm run dev   # :3000
```

## Cosa puoi chiedere

- *"Che tempo fa ad Alagna nel weekend?"* · *"Dove vado in Valsesia sabato e domenica?"*
- *"Conviene salire al Rifugio Gnifetti domani?"* · *"Rifugi entro 10 km da Courmayeur"*
- *"Aree sosta camper vicino a Carcoforo"* · *"Ci sono allerte in Piemonte?"*

## Note

- **Sola lettura**: l'app non modifica nulla; i dati escono solo verso Open-Meteo / Meteoalarm / OSM
  tramite i tool MCP. La chiave LLM resta nel tuo `.env`.
- **Cambiare modello**: `AI_PROVIDER=mistral|local` in `backend\.env` (vedi `.env.example`).
- **Fase 2 (non ancora)**: far *pilotare la mappa* all'agente (vola sulla località, pin dei
  rifugi) — richiede hook `postMessage` in `index.html` e scrittura nello stato AG-UI. Ora la
  mappa è interattiva ma indipendente dalla chat.
- **.exe standalone** (Python/Node già dentro): non incluso — servirebbe PyInstaller + packaging Node.
