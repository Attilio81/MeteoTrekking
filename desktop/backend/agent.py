"""Agente AGNO "Assistente MeteoTrekking" esposto via AG-UI su FastAPI (AgentOS).

Si aggancia al server MCP MeteoTrekking (../../mcp/server.mjs) in transport **stdio**:
AgentOS ne gestisce il ciclo di vita (connect/disconnect automatici) — vedi
https://docs.agno.com/agent-os/mcp/tools. NB: niente reload=True con MCPTools.

Modello via model_factory (DeepSeek di default). Sola lettura: nessun dato esce se non
verso Open-Meteo/Meteoalarm/OSM tramite i tool.
"""
from __future__ import annotations

import os
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

Regole:
- ATTENZIONE alla distanza dei rifugi: `rifugi_vicini` dà la distanza in LINEA D'ARIA dal
  punto cercato, non il cammino reale né il dislivello. Quando l'utente chiede "quanto
  cammino / da dove si parte / quanto dislivello", dillo chiaramente e usa
  `web_search` per il punto di partenza e i tempi reali.
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
    tools=[mcp_tools, web_search],
    tool_call_limit=10,   # anti-loop: DeepSeek altrimenti ripete la web search all'infinito
    instructions=INSTRUCTIONS,
    add_history_to_context=True,
    num_history_runs=4,
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
