"""Agente AGNO "Assistente MeteoTrekking" esposto via AG-UI su FastAPI (AgentOS).

Si aggancia al server MCP MeteoTrekking (../../mcp/server.mjs) in transport **stdio**:
AgentOS ne gestisce il ciclo di vita (connect/disconnect automatici) — vedi
https://docs.agno.com/agent-os/mcp/tools. NB: niente reload=True con MCPTools.

Modello via model_factory (DeepSeek di default). Sola lettura: nessun dato esce se non
verso Open-Meteo/Meteoalarm/OSM tramite i tool.
"""
from __future__ import annotations

import os
import json
from pathlib import Path

from dotenv import load_dotenv
from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.os import AgentOS
from agno.os.interfaces.agui import AGUI
import httpx
from agno.tools import tool
from agno.tools.mcp import MCPTools
from mcp import StdioServerParameters

from model_factory import build_model
from punti import PUNTI_TOOLS

load_dotenv()

# server MCP MeteoTrekking: repo_root/mcp/server.mjs (questo file è in desktop/backend/)
MCP_SERVER = str((Path(__file__).resolve().parents[2] / "mcp" / "server.mjs"))

# stdio con path esplicito (il path del repo può contenere spazi -> niente shell-split)
mcp_tools = MCPTools(
    server_params=StdioServerParameters(command="node", args=[MCP_SERVER]),
    timeout_seconds=30,
)

# ricerca web via Tavily (REST diretta: nessuna dipendenza extra). Key: https://tavily.com
# (env TAVILY_API_KEY). Senza key ritorna un messaggio chiaro invece di fallire.
@tool(name="web_search",
      description="Cerca sul web (Tavily). Usa SOLO per ciò che gli altri tool non danno: "
                  "punto di partenza/imbocco sentiero, come arrivare, tempi e dislivello reali, "
                  "condizioni recenti, orari/apertura rifugio. Non per meteo/rifugi/sentieri/allerte.")
def web_search(query: str) -> str:
    key = os.environ.get("TAVILY_API_KEY")
    if not key:
        return "Ricerca web non configurata (manca TAVILY_API_KEY). Dillo all'utente."
    try:
        r = httpx.post(
            "https://api.tavily.com/search",
            json={"api_key": key, "query": query, "max_results": 5, "search_depth": "basic"},
            timeout=20,
        )
    except Exception as e:
        return f"Errore di rete nella ricerca: {e}"
    if r.status_code != 200:
        return f"Ricerca fallita (HTTP {r.status_code}). Non ritentare all'infinito."
    data = r.json()
    items = (data.get("results") or [])[:5]
    if not items:
        return "Nessun risultato dalla ricerca web."
    head = f"[Sintesi] {data['answer']}\n\n" if data.get("answer") else ""
    return head + "\n\n".join(
        f"{it.get('title', '')}\n{it.get('url', '')}\n{it.get('content', '')}" for it in items
    )


@tool(name="web_extract",
      description="Estrae il TESTO COMPLETO di 1-3 pagine web (passa gli URL trovati con "
                  "web_search). Usalo per leggere le schede degli itinerari e ricavare dati REALI "
                  "(dislivello, tempo, difficoltà, punto di partenza) da citare senza inventare.")
def web_extract(urls: list) -> str:
    key = os.environ.get("TAVILY_API_KEY")
    if not key:
        return "Estrazione web non configurata (manca TAVILY_API_KEY)."
    try:
        r = httpx.post("https://api.tavily.com/extract",
                       json={"api_key": key, "urls": (urls or [])[:3]}, timeout=35)
    except Exception as e:
        return f"Errore di rete nell'estrazione: {e}"
    if r.status_code != 200:
        return f"Estrazione fallita (HTTP {r.status_code})."
    res = r.json().get("results") or []
    if not res:
        return "Nessun contenuto estratto."
    return "\n\n".join(f"### {x.get('url','')}\n{(x.get('raw_content') or '')[:4000]}" for x in res)


@tool(name="componi_trekking",
      description="Mostra un elenco di itinerari trekking nel canvas (schede stile Komoot). "
                  "Passa SOLO gite REALI ricavate da sentieri/web_search/web_extract, MAI inventate. "
                  "Ogni gita è un oggetto con: nome, meta, dislivello_m, tempo, difficolta, partenza, "
                  "perche (1 riga), fonte (URL). Lascia vuoto un campo se non lo hai trovato: non inventarlo.")
def componi_trekking(gite: list) -> str:
    return json.dumps({"trekking": gite or []}, ensure_ascii=False)

INSTRUCTIONS = """\
Sei l'assistente MeteoTrekking per le Alpi occidentali (Piemonte, Valle d'Aosta, Liguria
e Alpi francesi/svizzere limitrofe). Aiuti a pianificare escursioni con dati veri.

Hai questi tool (usali, non inventare):
- `previsioni`: meteo trekking per località/coordinate — finestra asciutta, giorno migliore,
  rischio temporale, vento, temperature, pioggia per fasce. Per un rifugio dà il meteo IN QUOTA.
- `cerca_localita`: trova comuni, rifugi, bivacchi per nome.
- `rifugi_vicini`: rifugi/bivacchi entro un raggio, con quota e distanza.
- `sentieri`: rotte principali (Alte Vie, GTA, GR) per nome o vicinanza.
- `soste_camper_vicine`: aree sosta/parcheggi camper (OSM) — utile per chi va in furgone.
- `allerte_meteo`: allerte ufficiali Meteoalarm (IT/FR/CH). Filtra tu per la regione della
  località (es. Alagna → Piemonte).
- `web_search`: ricerca web. Usalo SOLO per ciò che i tool sopra non danno:
  punto di partenza / imbocco del sentiero, come arrivare (auto, parcheggio, bus),
  tempo di percorrenza e dislivello, condizioni recenti, orari/apertura del rifugio.
  Cita sempre la fonte e diffida di info non ufficiali (preferisci CAI, siti dei rifugi,
  portali escursionistici noti). NON usarlo per meteo, rifugi, sentieri o allerte: per
  quelli i tool dedicati sono la verità. Fai al MASSIMO 2 ricerche web per domanda: se
  non trovi risultati, NON ripetere la ricerca all'infinito — di' che non hai trovato
  informazioni affidabili e fermati.

Memoria (importante):
- Hai una MEMORIA persistente. I dati dei tool (OSM/Open-Meteo) sono la BASE autorevole ma
  possono essere incompleti o datati. Quando scopri — dal web o dall'utente — un fatto utile
  e DUREVOLE che manca o corregge la base (es. un'area camper non mappata come "Le Giare" a
  Carcoforo, un rifugio chiuso certi giorni, un accesso cambiato), SALVALO in memoria.
- All'inizio di una risposta tieni conto di ciò che ricordi: se la memoria integra un tool
  (es. una sosta camper che i tool non elencano), usala e dillo ("da quanto mi risulta…").
- Non memorizzare meteo o dati volatili: solo fatti stabili (luoghi, servizi, aperture, correzioni).
- PUNTI CUSTOM (SQLite overlay): oltre alla memoria in prosa, hai `aggiungi_punto`/`punti_vicini`/
  `elimina_punto` per i punti GEO che mancano/correggono la base OSM. Quando trovi (web o utente)
  un luogo con coordinate non presente nei tool fissi — es. l'area camper "Le Giare" a Carcoforo —
  chiama `aggiungi_punto`. Quando elenchi rifugi/soste vicino a una località, chiama ANCHE
  `punti_vicini` (stesse coordinate) e integra i risultati, segnalandoli come "aggiunti".

Regole:
- DISTANZE: i tool NON danno distanze a piedi e NON esiste più la linea d'aria (fuorviante in
  montagna). Le metriche vere sono DISLIVELLO, TEMPO di percorrenza, DIFFICOLTÀ, lunghezza della
  rotta. Per queste usa `web_search` (schede CAI/portali). Non inventare km né tempi.
- "I TREKKING/ESCURSIONI MIGLIORI VICINO A X" (o "cosa cammino da X", "gite da X"): produci un
  ELENCO CORPOSO stile Komoot, con dati REALI e ZERO invenzione. Procedi così:
  1. `sentieri` (localita=X) per le rotte segnate (nome, numero, difficoltà, lunghezza);
  2. `web_search` "migliori escursioni / trekking da X + valle" per trovare le pagine giuste;
  3. `web_extract` sulle 2-3 pagine più promettenti (portali escursionistici/CAI) per LEGGERE i
     dati veri: dislivello, tempo, difficoltà, punto di partenza, meta;
  4. chiama `componi_trekking(gite=[...])` con 4-6 itinerari compilati SOLO con ciò che hai
     letto. Ogni gita: nome, meta, dislivello_m, tempo, difficolta, partenza, perche, fonte(URL).
     Se un dato non c'è nella fonte, lascialo vuoto — NON inventarlo.
  Nel messaggio di chat aggiungi 1-2 righe di sintesi e le fonti. Le schede compaiono nel canvas.
- Per "che tempo fa / conviene salire / quando esco" usa SEMPRE `previsioni`.
- Prima di consigliare una gita, controlla il rischio temporale e le raffiche: in quota vento
  > ~40 km/h o temporale = sconsiglia con chiarezza, non addolcire.
- Se l'utente dà una zona, individua la località con `cerca_localita`, poi incrocia previsioni,
  rifugi e sentieri; concludi con una raccomandazione secca (giorno, fascia oraria, meta).
- Rispondi in italiano, conciso. Sei in sola lettura: non modifichi nulla.
- Ricorda che le previsioni sono un aiuto, non una certezza: in montagna il tempo cambia in
  fretta. Per le uscite serie rimanda ai bollettini ufficiali.
"""

agent = Agent(
    name="Assistente MeteoTrekking",
    id="meteotrekking-agent",
    model=build_model(),
    db=SqliteDb(db_file="session.db"),
    tools=[mcp_tools, web_search, web_extract, componi_trekking, *PUNTI_TOOLS],
    tool_call_limit=12,   # anti-loop; il flusso trekking usa sentieri+search+extract+componi
    instructions=INSTRUCTIONS,
    add_history_to_context=True,
    num_history_runs=4,
    enable_agentic_memory=True,   # memoria persistente: integra/corregge i dati fissi (OSM)
    markdown=False,
    exponential_backoff=True,
    delay_between_retries=2,
)

agent_os = AgentOS(agents=[agent], interfaces=[AGUI(agent=agent)])
app = agent_os.get_app()


@app.get("/api/info")
def info():
    return {"provider": os.environ.get("AI_PROVIDER", "deepseek"),
            "model": getattr(agent.model, "id", "?")}


if __name__ == "__main__":
    # niente reload=True: romperebbe la connessione MCP nel ciclo di vita FastAPI
    agent_os.serve(app="agent:app", host="127.0.0.1", port=7000, reload=False)
