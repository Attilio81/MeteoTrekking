# 🏔️ MeteoTrekking

**Il meteo per chi va in montagna, direttamente sulla mappa.**

Previsioni a 3 giorni sulle Alpi occidentali per pianificare escursioni: pioggia per fasce orarie, finestra all'asciutto nelle ore di luce, giorno migliore per uscire, raffiche di vento, rifugi, bivacchi e sentieri. Un solo file HTML: si apre col doppio clic, senza installazioni, senza account, senza API key.

![MeteoTrekking — Zermatt e il massiccio del Monte Rosa](docs/screenshot.png)

## ✨ Funzioni

### Meteo pensato per il trekking
- **Etichette sulla mappa** per ~4.200 comuni: temperature min/max, pioggia totale 3 giorni, raffica massima con direzione. Il bordo colorato dice a colpo d'occhio quanta pioggia arriva (verde = asciutto → rosso = molta).
- **Scheda 3 giorni** con la domanda giusta: *quando posso uscire?*
  - barre pioggia per fasce orarie (🌙 notte · 🌅 mattina · ☀️ pomeriggio · 🌆 sera)
  - **finestra all'asciutto** calcolata sulle ore di luce ("✅ finestra 9–15")
  - **⭐ giorno migliore** dei tre — mai assegnato a un giorno di temporale
  - **⚠️ rischio temporale**: se è previsto un temporale, la finestra asciutta non viene spacciata per una promessa
  - alba/tramonto, vento con freccia di direzione
- **Radar pioggia live** (RainViewer): dove sta piovendo adesso.

### Montagna vera
- **549 rifugi e bivacchi** (OSM) con quota: un clic e hai il meteo *in quota*, non quello del fondovalle.
- **778 rotte principali cliccabili** — Alte Vie, GTA, GR, tour: nome, numero, lunghezza, difficoltà SAC. Più tutti i sentieri segnati come sfondo (Waymarked Trails).
- **Soste camper 🚐** (OSM): aree sosta e parcheggi per camper/furgone, con meteo al clic. Layer spento di default, si attiva dal controllo layer. Utile per chi viaggia in libertà.
- **Punti tuoi**: clicchi un punto qualsiasi (un colle, un lago, un bivacco non mappato) e il suo meteo resta sulla mappa, anche alla prossima visita.

### Per l'escursione
- **Traccia GPX**: carica (o trascina) il file della tua escursione — percorso sulla mappa, **meteo campionato lungo la traccia** (partenza, tappe, arrivo con quota), distanza, **dislivello D+/D−** e **profilo altimetrico**.

### Comoda
- Ricerca località con volo sulla mappa, filtro per dimensione dei paesi (dalle città a ogni frazione di valle), geolocalizzazione 🎯, link condivisibile della vista, guida integrata, ottimizzata per mobile.
- **PWA**: dal telefono, "Aggiungi a schermata Home" — si installa come app e si avvia anche con segnale scarso.

## 🚀 Uso

**Basta aprire [`index.html`](index.html) in un browser.** Serve solo la connessione per mappa e meteo.

Oppure servilo come sito statico (Vercel, GitHub Pages, un qualsiasi web server): nessuna build, nessuna dipendenza.

## 🤖 Server MCP

Il repo include un server [MCP](https://modelcontextprotocol.io) che espone gli stessi dati a **qualunque assistente AI** (Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Cline…): chiedi *"che meteo fa ad Alagna nel weekend?"* e l'agente risponde con dati veri.

```bash
cd mcp && npm install     # richiede Node 18+
```

| Tool | Cosa fa |
|---|---|
| `previsioni` | Meteo trekking 1–7 giorni per comune, rifugio o coordinate: finestra asciutta, giorno migliore, rischio temporale, fasce pioggia |
| `cerca_localita` | Cerca comuni, rifugi e bivacchi per nome |
| `rifugi_vicini` | Rifugi entro un raggio, ordinati per distanza, con quota |
| `sentieri` | Rotte principali per nome o vicinanza a una località |
| `soste_camper_vicine` | Aree sosta e parcheggi per camper (OSM) entro un raggio, ordinati per distanza |

Prompt pronti (dal menu prompt del client): **pianifica-uscita-weekend** (zona → meteo del weekend, rifugi, rotte e raccomandazione secca), **meteo-rifugio** (conviene salire? quando?), **confronta-localita** (classifica tra più mete).

### Domande di prova

Da chiedere all'assistente per vedere il server all'opera:

- *"Che meteo fa ad Alagna Valsesia nel weekend?"*
- *"Pianifica un'uscita in Valsesia per sabato e domenica."*
- *"Quali rifugi ci sono entro 10 km da Courmayeur?"*
- *"Da Carcoforo, che gite si fanno con massimo 600 m di dislivello?"*
- *"Conviene salire al Rifugio Gnifetti domani?"*
- *"Confronta il meteo tra Alagna, Carcoforo e Macugnaga: dove vado?"*
- *"Trovami la tappa GTA più vicina a Rima."*

**Claude Code**: già registrato dal file [`.mcp.json`](.mcp.json) — apri Claude Code nella cartella del repo e approva il server.

**Altri client** (es. Claude Desktop): aggiungi alla configurazione MCP:

```json
{
  "mcpServers": {
    "meteotrekking": {
      "command": "node",
      "args": ["/percorso/assoluto/MeteoTrekking/mcp/server.mjs"]
    }
  }
}
```

Il server legge comuni, rifugi e rotte direttamente da `index.html` (fonte unica) e interroga Open-Meteo live. Trasporto stdio: gira in locale, nessun dato tuo esce dalla macchina.

### Da cellulare (connettore remoto)

L'app **Claude** su cellulare non avvia processi locali: accetta solo **connettori remoti** (MCP via HTTP). Per questo c'è una seconda variante — stessa identica logica (`mcp/mcp-core.mjs`), trasporto Streamable HTTP — deployabile gratis su Vercel:

- entry HTTP: [`api/mcp.mjs`](api/mcp.mjs) (serverless, **stateless**, protetta da token)
- config deploy: [`vercel.json`](vercel.json) + [`package.json`](package.json) di root

**Deploy (gratis, piano Hobby):**

```bash
npm i -g vercel        # se non ce l'hai
vercel                 # dalla root del repo: primo deploy
vercel env add MCP_TOKEN    # incolla un token segreto a piacere (es. da `openssl rand -hex 24`)
vercel --prod          # deploy definitivo
```

Ottieni un URL tipo `https://meteotrekking.vercel.app/api/mcp`. Poi su **claude.ai → Settings → Connectors → Add custom connector**: incolla l'URL e, come header, `Authorization: Bearer <il-tuo-MCP_TOKEN>`. Da lì è disponibile anche nell'app mobile.

> ⚠️ Esposto in rete non vale più il "tutto in locale": la function **richiede** il token (`MCP_TOKEN`) e rifiuta le richieste senza. Il piano Hobby di Vercel è solo per uso **non commerciale**.

Il sito statico (`index.html`) e la function coabitano nello stesso deploy: apri l'URL base per la mappa, `/api/mcp` per l'MCP.

## 🗺️ Copertura e dati

**Piemonte, Valle d'Aosta, Liguria** e le Alpi francesi e svizzere limitrofe (bbox 43.3–46.6 N, 5.5–9.7 E). Comuni, rifugi, rotte e soste camper sono incorporati nel file — estratti una volta, zero API a runtime oltre al meteo.

Le **soste camper** hanno uno script di rigenerazione da OpenStreetMap (le altre sorgenti sono state estratte a mano, una volta):

```bash
node scripts/extract-campers.mjs   # rilegge Overpass e riscrive il blocco CAMPERS in index.html
```

È idempotente (rieseguibile) e con guardia anti-lista-vuota: se Overpass restituisce molti meno punti del previsto, aborta senza scrivere. Adatto a una GitHub Action mensile, se in futuro si vuole automatizzarlo.

| Dato | Fonte | Licenza/note |
|---|---|---|
| Previsioni | [Open-Meteo](https://open-meteo.com) | gratis, multi-modello (ICON/ECMWF), no key |
| Radar pioggia | [RainViewer](https://www.rainviewer.com) | gratis, no key |
| Comuni | [GeoNames](https://www.geonames.org) cities500 | CC-BY |
| Rifugi, bivacchi, rotte | [OpenStreetMap](https://www.openstreetmap.org) | ODbL |
| Soste camper | [OpenStreetMap](https://www.openstreetmap.org) (`tourism=caravan_site`, parcheggi camper) | ODbL |
| Sentieri (tiles) | [Waymarked Trails](https://waymarkedtrails.org) | — |
| Mappa | Esri World Imagery · [OpenTopoMap](https://opentopomap.org) | — |

## ⚠️ Nota di prudenza

Le previsioni sono un aiuto alla pianificazione, non un sostituto del buon senso: in montagna il tempo cambia in fretta e i modelli sbagliano proprio dove serve più precisione. Consulta sempre i bollettini ufficiali (Arpa, Météo-France, MeteoSvizzera) prima di partire.
