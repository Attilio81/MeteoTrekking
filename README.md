# MeteoTrekking

Meteo a 3 giorni sulle Alpi occidentali, direttamente sulla mappa satellitare. Pensato per pianificare escursioni: pioggia, vento, temperature, rifugi e sentieri.

**File singolo, zero dipendenze da installare, nessun account.** Apri `meteotrekking.html` in un browser (doppio clic) e funziona.

## Funzioni

- **Meteo 3 giorni** su ogni paese: temp min/max, pioggia (mm), raffiche e direzione vento, alba/tramonto.
- **Barre pioggia a fasce** (notte/mattina/pomeriggio/sera) + **finestra all'asciutto** e **giorno migliore** per uscire.
- **Rifugi e bivacchi** (con quota) — clicca per il meteo del rifugio.
- **Sentieri trekking** (rotte CAI/GR).
- **Filtro abitanti** — dai grandi centri fino a ogni paesino di valle.
- **Ricerca paese**, **punti personali** che restano, **link condivisibile** della vista.

## Dati

- Meteo: [Open-Meteo](https://open-meteo.com) (multi-modello, no API key)
- Comuni: [GeoNames](https://www.geonames.org) (cities500)
- Rifugi, bivacchi, sentieri: [OpenStreetMap](https://www.openstreetmap.org) / [Waymarked Trails](https://waymarkedtrails.org)
- Mappa: Esri World Imagery, OpenTopoMap

## Copertura

Piemonte, Valle d'Aosta, Liguria e Alpi francesi/svizzere limitrofe. L'elenco di comuni e rifugi è incorporato nel file (estratto una volta), così a runtime non serve nessuna API oltre al meteo.
