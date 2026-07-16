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

Regole:
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
    tools=[mcp_tools],
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
