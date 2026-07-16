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
from fastapi import Request
import httpx
from agno.tools import tool
from agno.tools.mcp import MCPTools
from mcp import StdioServerParameters

from model_factory import build_model

load_dotenv()

# server MCP MeteoTrekking: repo_root/mcp/server.mjs (questo file è in desktop/backend/).
# Override con MCP_SERVER_PATH per il bundle portatile (dove il layout differisce).
MCP_SERVER = os.environ.get("MCP_SERVER_PATH") or str((Path(__file__).resolve().parents[2] / "mcp" / "server.mjs"))

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
- FALLBACK SENZA RICERCA WEB: se `web_search`/`web_extract` rispondono "non configurato"
  (nessuna chiave Tavily), NON bloccarti: per gli itinerari usa `sentieri` + la tua conoscenza,
  chiama comunque `componi_trekking` con le rotte note, e avvisa che senza chiave di ricerca web
  dislivello e tempi sono indicativi (l'utente può inserire la chiave nelle Impostazioni).

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
- RICHIESTE DI ITINERARI a piedi da una località X — qualsiasi forma: "trekking/escursioni migliori
  vicino a X", "vorrei fare un trekking/una gita/un'escursione da X", "cosa cammino da X", "gite da X",
  "consigliami una gita/un giro", ANCHE con vincoli (dislivello ~N m, difficoltà, durata, ad anello).
  Produci un ELENCO CORPOSO stile Komoot, dati REALI, ZERO invenzione. NON partire dal meteo (offrilo
  solo dopo, se serve). Procedi SEMPRE così, fino in fondo:
  1. `sentieri` (localita=X) per le rotte segnate;
  2. `web_search` "escursioni/trekking da X + valle" (aggiungi il vincolo, es. "500 m dislivello");
  3. `web_extract` su 2-3 pagine (portali escursionistici/CAI) per LEGGERE dislivello, tempo,
     difficoltà, partenza, meta reali;
  4. chiama SEMPRE `componi_trekking(gite=[...])` con 4-6 itinerari da ciò che hai letto.
     Ogni gita: nome, meta, dislivello_m, tempo, difficolta, partenza, perche, fonte(URL).
     Campo vuoto se non trovato, MAI inventato.
  Se c'è un VINCOLO (es. 500-600 m di dislivello): seleziona e ORDINA gli itinerari che lo rispettano,
  scarta quelli fuori range e dillo.
  VIETATO elencare gli itinerari come testo nella chat: l'elenco DEVE passare da `componi_trekking`
  (che li mostra come schede nel canvas). In chat scrivi SOLO 1-2 righe di sintesi + le fonti.
  `componi_trekking` è l'ULTIMO passo e non va mai saltato.
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
    tools=[mcp_tools, web_search, web_extract, componi_trekking],
    tool_call_limit=15,   # anti-loop; il flusso trekking usa sentieri+search+extract+componi
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


def _write_env(updates: dict) -> None:
    """Aggiorna .env nella cwd preservando le altre righe (chiavi in chiaro solo su disco locale)."""
    path = Path.cwd() / ".env"
    seen, out = set(), []
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            k = line.split("=", 1)[0].strip()
            if k in updates:
                out.append(f"{k}={updates[k]}"); seen.add(k)
            else:
                out.append(line)
    for k, v in updates.items():
        if k not in seen:
            out.append(f"{k}={v}")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")


@app.get("/api/config")
def get_config():
    # non restituisce mai i valori delle chiavi, solo se sono impostate
    return {
        "provider": os.environ.get("AI_PROVIDER", "deepseek"),
        "model": getattr(agent.model, "id", "?"),
        "deepseek_model": os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
        "has_deepseek": bool(os.environ.get("DEEPSEEK_API_KEY")),
        "has_tavily": bool(os.environ.get("TAVILY_API_KEY")),
        "modelli_deepseek": ["deepseek-chat", "deepseek-reasoner"],
    }


@app.post("/api/config")
async def set_config(req: Request):
    body = await req.json()
    updates = {}
    for src, env in [("ai_provider", "AI_PROVIDER"), ("deepseek_api_key", "DEEPSEEK_API_KEY"),
                     ("deepseek_model", "DEEPSEEK_MODEL"), ("tavily_api_key", "TAVILY_API_KEY")]:
        v = body.get(src)
        if v:  # ignora vuoti: non sovrascrive una chiave già presente con ""
            os.environ[env] = v
            updates[env] = v
    if updates:
        _write_env(updates)
    # applica subito il cambio provider/modello (Tavily è letto per-chiamata, già live)
    warn = None
    try:
        agent.model = build_model()
    except Exception as e:
        warn = str(e)
    return {"ok": True, "provider": os.environ.get("AI_PROVIDER", "deepseek"),
            "model": getattr(agent.model, "id", "?"),
            "has_deepseek": bool(os.environ.get("DEEPSEEK_API_KEY")),
            "has_tavily": bool(os.environ.get("TAVILY_API_KEY")), **({"warn": warn} if warn else {})}


if __name__ == "__main__":
    # uvicorn con l'oggetto app (non la stringa "agent:app"): funziona anche da .exe
    # PyInstaller, dove il modulo "agent" non è importabile per nome. Niente reload (romperebbe MCP).
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=7000)
