# MeteoTrekking Desktop

Assistente AI per la montagna delle Alpi occidentali. Una mappa meteo-trekking affiancata
a un assistente conversazionale che risponde con **dati reali** (meteo, rifugi, sentieri, soste
camper, allerte) e compone al volo schede di itinerari nel canvas, stile Komoot.

Costruito su [AGNO](https://docs.agno.com) (AgentOS + AG-UI), [CopilotKit](https://copilotkit.ai)
e il server MCP di MeteoTrekking. Modello LLM **DeepSeek** (configurabile).

## Cosa sa fare

- **Meteo trekking**: previsioni per comune, rifugio o coordinate, con finestra all'asciutto,
  giorno migliore, rischio temporale, vento, temperature. In quota per i rifugi, non a fondovalle.
- **Itinerari stile Komoot**: alla domanda "trekking da Carcoforo sui 500 m di dislivello" l'agente
  cerca sul web, estrae le schede dei portali escursionistici e compone **schede reali** (dislivello,
  tempo, difficoltà, punto di partenza, fonte) filtrate sul vincolo richiesto. Nessun dato inventato.
- **Rifugi, bivacchi, sentieri, soste camper** dai dati OpenStreetMap incorporati.
- **Allerte meteo** ufficiali (Meteoalarm, Italia/Francia/Svizzera).
- **Canvas generativo**: quando l'agente produce un elenco, la mappa lascia il posto a una vista
  dedicata (tabella rifugi, cards previsioni, schede itinerari, banner allerte).
- **Memoria e punti custom**: l'assistente ricorda i fatti durevoli e salva in un overlay SQLite i
  luoghi che scopre e che mancano alla base (es. un'area camper non ancora mappata).

## Architettura

```
                 ┌─────────────────────────┐
   Browser  ───▶ │ Frontend  Next.js + CopilotKit (:3000)      │
                 │  · mappa index.html in iframe               │
                 │  · chat + canvas generativo (AG-UI)         │
                 └───────────────┬─────────────────────────────┘
                                 │  /api/copilotkit  (AG-UI)
                 ┌───────────────▼─────────────────────────────┐
   DeepSeek ◀──▶ │ Backend  AGNO AgentOS + AG-UI su FastAPI (:7000) │
                 │  · tool web (Tavily search/extract)          │
                 │  · componi_trekking (schede canvas)          │
                 │  · memoria persistente (session.db)          │
                 └───────────────┬─────────────────────────────┘
                                 │  MCP (stdio)
                 ┌───────────────▼─────────────────────────────┐
                 │ MCP server  (../mcp/server.mjs, Node)        │
                 │  · previsioni · cerca_localita · rifugi ·    │
                 │    sentieri · soste camper · allerte         │
                 │  · aggiungi/punti_vicini/elimina (overlay)   │
                 │  base: data.db   overlay: punti.db (SQLite)  │
                 └─────────────────────────────────────────────┘
```

**Dati.** La base (comuni GeoNames, rifugi/rotte/soste OpenStreetMap) vive in `mcp/data.db`,
generato da `index.html` con `scripts/build-db.mjs` e versionato. È immutabile a runtime e
rigenerabile dalle fonti. L'overlay editabile (`mcp/punti.db`) è separato e non versionato: qui
l'agente aggiunge correzioni e luoghi mancanti, che integrano la base senza alterarla.

## Prerequisiti

| Requisito | Versione | Note |
|---|---|---|
| Python | 3.11+ | backend AGNO |
| Node.js | **22.5+** | frontend, server MCP e `node:sqlite` |
| Chiave DeepSeek | — | [platform.deepseek.com](https://platform.deepseek.com) |
| Chiave Tavily | opzionale | [tavily.com](https://tavily.com), abilita ricerca ed estrazione web |

## Avvio

Doppio clic su **`avvia.bat`**: crea il virtualenv, installa le dipendenze, avvia backend e
frontend. Al primo avvio apre `backend\.env` per inserire le chiavi, poi rilancia.

Apri **http://localhost:3000**.

### Manuale

```bash
# backend
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # inserisci DEEPSEEK_API_KEY (e TAVILY_API_KEY)
python agent.py                 # :7000

# frontend (altro terminale)
cd frontend
npm install
npm run dev                     # :3000
```

Se cambi i dati di base, rigenera il DB dalla radice del repo:

```bash
node scripts/build-db.mjs
```

## Configurazione (`backend/.env`)

| Variabile | Default | Descrizione |
|---|---|---|
| `AI_PROVIDER` | `deepseek` | `deepseek`, `mistral` o `local` (OpenAI-compatibile) |
| `DEEPSEEK_API_KEY` | — | chiave del modello (obbligatoria con provider deepseek) |
| `TAVILY_API_KEY` | — | ricerca/estrazione web; senza, i tool web rispondono "non configurato" |
| `LLM_TEMPERATURE` | `0.3` | creatività del modello |

Cambiare provider non richiede modifiche al codice: vedi `model_factory.py` e `.env.example`.

## Esempi

- *"Che tempo fa ad Alagna nel weekend?"*
- *"Vorrei fare un trekking da Carcoforo sui 500 metri di dislivello, cosa mi consigli?"*
- *"Conviene salire al Rifugio Gnifetti domani?"*
- *"Aree sosta camper vicino a Carcoforo"*
- *"Ci sono allerte in Piemonte oggi?"*

## Struttura

```
desktop/
  backend/
    agent.py            agente AGNO + AgentOS/AG-UI + tool web e trekking
    model_factory.py    selezione provider LLM da .env
    requirements.txt
    .env.example
  frontend/
    app/                pagina, layout, stili, endpoint CopilotKit
    components/         BrandBar, MapCanvas, CanvasViews, SuggestionChips, CopilotConfig
    lib/canvasStore.tsx stato del canvas
    scripts/copy-map.mjs copia index.html in public/map.html
  avvia.bat
```

## Note

- **Sola lettura sul mondo esterno.** L'app non modifica dati remoti: interroga solo Open-Meteo,
  Meteoalarm, OpenStreetMap e Tavily. Le chiavi restano nel tuo `.env`, non escono dal repo.
- **Le distanze non sono in linea d'aria.** In montagna conta il dislivello: le liste ordinano per
  vicinanza ma i numeri di cammino e D+ vengono dalle schede reali degli itinerari, non calcolati.
- **Fase successiva.** La mappa e la chat sono affiancate ma indipendenti; farle dialogare
  (l'agente che vola sulla località e posiziona i pin) richiede un canale `postMessage` verso
  `index.html`.
- **Distribuzione.** Non è incluso un pacchetto `.exe` autonomo: servirebbe PyInstaller lato
  backend e un bundle Node. `avvia.bat` copre l'uso su una macchina con Python e Node installati.
