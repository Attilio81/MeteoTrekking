// MeteoTrekking — core condiviso: dati + tool + prompt.
// Usato sia dall'entry stdio (server.mjs) sia da quella HTTP (../api/mcp.mjs).
// I dati (comuni GeoNames, rifugi OSM, rotte OSM) vengono estratti da index.html: fonte unica.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ---------- dati dall'app ----------
// index.html può stare accanto (repo) o nella cwd della function (Vercel includeFiles): provo i candidati.
function readIndexHtml() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, '..', 'index.html'), join(process.cwd(), 'index.html'), join(here, 'index.html')];
  const hit = candidates.find(existsSync);
  if (!hit) throw new Error(`index.html non trovato (cercato: ${candidates.join(', ')})`);
  return readFileSync(hit, 'utf8');
}
const html = readIndexHtml();

function extractArray(name) {
  const start = html.indexOf(`const ${name} = [`);
  if (start < 0) throw new Error(`array ${name} non trovato in index.html`);
  const open = html.indexOf('[', start);
  let depth = 0, end = open;
  for (let i = open; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  return JSON.parse(html.slice(open, end + 1).replace(/,\s*\]$/, ']'));
}

const TOWNS = extractArray('TOWNS').map(t => ({ name: t[0], lat: t[1], lon: t[2], pop: t[3] }));
const HUTS = extractArray('HUTS').map(h => ({ name: h[0], lat: h[1], lon: h[2], ele: h[3], type: h[4] === 'w' ? 'bivacco' : 'rifugio' }));
const TRAILS = extractArray('TRAILS'); // {r,n,net,d,sac,c,p:[[lat,lon]..]}
const CAMPERS = extractArray('CAMPERS').map(c => ({ name: c[0], lat: c[1], lon: c[2], ele: c[3], type: c[4] === 'p' ? 'parcheggio camper' : 'area sosta camper' }));
export const stats = { comuni: TOWNS.length, rifugi: HUTS.length, rotte: TRAILS.length, soste_camper: CAMPERS.length };

// ---------- utilità ----------
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const compass = deg => COMPASS[Math.round(deg / 45) % 8];
const NET_LABEL = { iwn: 'internazionale', nwn: 'nazionale', rwn: 'regionale', lwn: 'locale' };
const SAC_LABEL = {
  hiking: 'T1 escursionismo', mountain_hiking: 'T2 montano', demanding_mountain_hiking: 'T3 impegnativo',
  alpine_hiking: 'T4 alpinistico', demanding_alpine_hiking: 'T5 alpinistico impegnativo', difficult_alpine_hiking: 'T6 alpinistico difficile'
};
const WMO = {
  0: 'sereno', 1: 'poco nuvoloso', 2: 'variabile', 3: 'coperto', 45: 'nebbia', 48: 'nebbia',
  51: 'pioviggine', 53: 'pioviggine', 55: 'pioviggine', 61: 'pioggia debole', 63: 'pioggia', 65: 'pioggia forte',
  66: 'pioggia gelata', 67: 'pioggia gelata', 71: 'neve debole', 73: 'neve', 75: 'neve forte', 77: 'nevischio',
  80: 'rovesci', 81: 'rovesci', 82: 'rovesci forti', 85: 'rovesci di neve', 86: 'rovesci di neve',
  95: 'temporale', 96: 'temporale con grandine', 99: 'temporale con grandine'
};

function haversineKm(a, b) {
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLon = toR(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function resolvePlace(nome) {
  const t = norm(nome.trim());
  const pools = [
    TOWNS.map(x => ({ ...x, kind: 'comune' })),
    HUTS.map(x => ({ ...x, kind: x.type }))
  ].flat();
  const exact = pools.filter(p => norm(p.name) === t);
  const starts = pools.filter(p => norm(p.name).startsWith(t));
  const contains = pools.filter(p => norm(p.name).includes(t));
  const pick = (exact[0] || starts[0] || contains[0]) ?? null;
  return { match: pick, alternatives: (exact.length ? exact : starts.length ? starts : contains).slice(1, 6) };
}

function dryWindow(hourly, date, sunriseISO, sunsetISO) {
  const sr = +sunriseISO.slice(11, 13), ss = +sunsetISO.slice(11, 13);
  let best = { len: 0, start: null, end: null }, cur = null;
  for (let hr = sr; hr <= ss; hr++) {
    const idx = hourly.time.indexOf(`${date}T${String(hr).padStart(2, '0')}:00`);
    const p = idx >= 0 ? (hourly.precipitation[idx] || 0) : 0;
    if (p < 0.2) { if (cur === null) cur = hr; }
    else if (cur !== null) { if (hr - cur > best.len) best = { len: hr - cur, start: cur, end: hr }; cur = null; }
  }
  if (cur !== null && (ss + 1 - cur) > best.len) best = { len: ss + 1 - cur, start: cur, end: ss + 1 };
  return { best, daylight: ss - sr };
}

function rainBands(hourly, date) {
  const b = [0, 0, 0, 0];
  for (let i = 0; i < hourly.time.length; i++) {
    if (hourly.time[i].slice(0, 10) !== date) continue;
    b[Math.min(3, Math.floor(+hourly.time[i].slice(11, 13) / 6))] += hourly.precipitation[i] || 0;
  }
  return b.map(v => +v.toFixed(1));
}

async function forecast(lat, lon, giorni) {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
    + '&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,'
    + 'wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset'
    + `&hourly=precipitation&timezone=Europe%2FRome&forecast_days=${giorni}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  const wx = await r.json();
  const d = wx.daily;
  const days = d.time.map((date, i) => {
    const { best, daylight } = dryWindow(wx.hourly, date, d.sunrise[i], d.sunset[i]);
    const storm = d.weathercode[i] >= 95;
    return {
      data: date,
      cielo: WMO[d.weathercode[i]] || `codice ${d.weathercode[i]}`,
      temp_min_c: Math.round(d.temperature_2m_min[i]),
      temp_max_c: Math.round(d.temperature_2m_max[i]),
      pioggia_mm: +d.precipitation_sum[i].toFixed(1),
      pioggia_fasce_mm: { notte_0_6: 0, mattina_6_12: 0, pomeriggio_12_18: 0, sera_18_24: 0 },
      raffica_max_kmh: Math.round(d.wind_gusts_10m_max[i]),
      vento_da: compass(d.wind_direction_10m_dominant[i]),
      alba: d.sunrise[i].slice(11, 16),
      tramonto: d.sunset[i].slice(11, 16),
      rischio_temporale: storm,
      finestra_asciutta: best.len === 0 ? null
        : { dalle: best.start, alle: best.end, ore: best.len, tutta_la_luce: best.len >= daylight,
            nota: storm ? 'finestra presente ma rischio temporale: prudenza' : undefined }
    };
  });
  days.forEach((day) => {
    const [n, m, p, s] = rainBands(wx.hourly, day.data);
    day.pioggia_fasce_mm = { notte_0_6: n, mattina_6_12: m, pomeriggio_12_18: p, sera_18_24: s };
  });
  let bi = 0, bs = -Infinity;
  days.forEach((day, i) => {
    const score = (day.finestra_asciutta?.ore ?? 0) + (day.rischio_temporale ? -100 : 0);
    if (score > bs) { bs = score; bi = i; }
  });
  return { giorni: days, giorno_migliore: days[bi].data, quota_modello_m: wx.elevation, fonte: 'Open-Meteo' };
}

// ---------- allerte meteo (Meteoalarm, feed CAP/JSON gratis, no key) ----------
const ALERT_FEED = { italia: 'feeds-italy', francia: 'feeds-france', svizzera: 'feeds-switzerland' };
const AW_LEVEL = { 1: 'verde', 2: 'giallo', 3: 'arancione', 4: 'rosso' };
const AW_TYPE = {
  1: 'vento', 2: 'neve/ghiaccio', 3: 'temporale', 4: 'nebbia', 5: 'caldo estremo', 6: 'freddo estremo',
  7: 'mareggiata', 8: 'incendi boschivi', 9: 'valanghe', 10: 'pioggia', 11: 'piena', 12: 'pioggia/piena', 13: 'gelo'
};
const paramVal = (params, name) => (params || []).find(x => x.valueName === name)?.value || '';

async function allerteCountry(paese) {
  const r = await fetch(`https://feeds.meteoalarm.org/api/v1/warnings/${ALERT_FEED[paese]}`,
    { headers: { 'User-Agent': 'MeteoTrekking/1.0 (github)' } });
  if (!r.ok) throw new Error(`Meteoalarm ${paese} ${r.status}`);
  const { warnings = [] } = await r.json();
  const langPref = paese === 'francia' ? 'fr' : paese === 'svizzera' ? 'de' : 'it';
  const out = [];
  for (const w of warnings) {
    const infos = w.alert?.info || [];
    if (!infos.length) continue;
    const info = infos[0];
    const lvl = +paramVal(info.parameter, 'awareness_level').split(';')[0].trim();
    if (!lvl || lvl <= 1) continue; // salta "verde"/nessuna allerta
    const type = +paramVal(info.parameter, 'awareness_type').split(';')[0].trim();
    const loc = infos.find(i => (i.language || '').toLowerCase().startsWith(langPref)) || info;
    for (const a of (info.area || [])) {
      out.push({
        paese, area: a.areaDesc, evento: info.event,
        livello: AW_LEVEL[lvl] || String(lvl), tipo: AW_TYPE[type] || undefined,
        dalle: info.onset || info.effective, alle: info.expires,
        dettaglio: (loc.description || '').split('\n')[0].trim().slice(0, 300) || undefined
      });
    }
  }
  return out;
}

const asText = o => ({ content: [{ type: 'text', text: JSON.stringify(o, null, 2) }] });
const asError = msg => ({ content: [{ type: 'text', text: JSON.stringify({ errore: msg }) }], isError: true });

// ---------- fabbrica del server (tool + prompt) ----------
export function createServer() {
  const server = new McpServer({ name: 'meteotrekking', version: '1.0.0' });

  server.tool(
    'previsioni',
    'Previsioni meteo orientate al trekking per una località delle Alpi occidentali (comune, rifugio o bivacco) '
    + 'o per coordinate. Per ogni giorno: cielo, temperature, pioggia totale e per fasce orarie, raffiche e direzione '
    + 'vento, alba/tramonto, finestra asciutta nelle ore di luce, rischio temporale; più il giorno migliore per uscire.',
    {
      localita: z.string().optional().describe('Nome di comune, rifugio o bivacco (es. "Courmayeur", "Rifugio Vieux Crest")'),
      lat: z.number().min(-90).max(90).optional().describe('Latitudine (alternativa a localita)'),
      lon: z.number().min(-180).max(180).optional().describe('Longitudine (alternativa a localita)'),
      giorni: z.number().int().min(1).max(7).default(3).describe('Giorni di previsione (1-7, default 3)')
    },
    async ({ localita, lat, lon, giorni }) => {
      try {
        if (localita) {
          const { match, alternatives } = resolvePlace(localita);
          if (!match) return asError(`Località "${localita}" non trovata tra comuni, rifugi e bivacchi delle Alpi occidentali`);
          lat = match.lat; lon = match.lon;
          const fc = await forecast(lat, lon, giorni);
          return asText({ localita: { nome: match.name, tipo: match.kind, lat, lon, ...(match.ele ? { quota_m: match.ele } : {}) },
            ...(alternatives.length ? { altre_corrispondenze: alternatives.map(a => a.name) } : {}), ...fc });
        }
        if (lat == null || lon == null) return asError('Serve localita oppure lat+lon');
        return asText({ punto: { lat, lon }, ...await forecast(lat, lon, giorni) });
      } catch (e) { return asError(e.message); }
    }
  );

  server.tool(
    'cerca_localita',
    'Cerca comuni, rifugi e bivacchi per nome (Piemonte, Valle d\'Aosta, Liguria, Alpi francesi e svizzere limitrofe). '
    + 'Restituisce nome, tipo, coordinate, popolazione o quota.',
    {
      nome: z.string().min(2).describe('Nome o parte del nome'),
      max: z.number().int().min(1).max(50).default(10)
    },
    async ({ nome, max }) => {
      const t = norm(nome);
      const towns = TOWNS.filter(c => norm(c.name).includes(t))
        .sort((a, b) => (norm(a.name).startsWith(t) ? 0 : 1) - (norm(b.name).startsWith(t) ? 0 : 1) || b.pop - a.pop)
        .map(c => ({ nome: c.name, tipo: 'comune', lat: c.lat, lon: c.lon, abitanti: c.pop }));
      const huts = HUTS.filter(h => norm(h.name).includes(t))
        .map(h => ({ nome: h.name, tipo: h.type, lat: h.lat, lon: h.lon, quota_m: h.ele || undefined }));
      const all = [...towns, ...huts].slice(0, max);
      return all.length ? asText({ risultati: all, totale: towns.length + huts.length })
        : asError(`Nessuna località per "${nome}"`);
    }
  );

  server.tool(
    'rifugi_vicini',
    'Rifugi e bivacchi entro un raggio da una località o da coordinate, ordinati per distanza, con quota.',
    {
      localita: z.string().optional().describe('Nome di comune/rifugio da cui cercare'),
      lat: z.number().optional(), lon: z.number().optional(),
      raggio_km: z.number().min(1).max(50).default(10),
      max: z.number().int().min(1).max(50).default(15)
    },
    async ({ localita, lat, lon, raggio_km, max }) => {
      if (localita) {
        const { match } = resolvePlace(localita);
        if (!match) return asError(`Località "${localita}" non trovata`);
        lat = match.lat; lon = match.lon;
      }
      if (lat == null || lon == null) return asError('Serve localita oppure lat+lon');
      const here = { lat, lon };
      // la distanza in linea d'aria serve SOLO come filtro/ordinamento interno: in montagna
      // è fuorviante, quindi non viene restituita. Per cammino/dislivello reale: web_search.
      const found = HUTS
        .map(h => ({ ...h, _d: haversineKm(here, h) }))
        .filter(h => h._d <= raggio_km)
        .sort((a, b) => a._d - b._d)
        .slice(0, max)
        .map(h => ({ nome: h.name, tipo: h.type, quota_m: h.ele || undefined, lat: h.lat, lon: h.lon }));
      return found.length ? asText({ da: { lat, lon }, raggio_ricerca_km: raggio_km, nota: 'ordinati per vicinanza; la distanza reale a piedi non è la linea d\'aria', rifugi: found })
        : asError(`Nessun rifugio o bivacco entro ${raggio_km} km`);
    }
  );

  server.tool(
    'sentieri',
    'Rotte escursionistiche principali (Alte Vie, GTA, GR, tour): cerca per nome/numero oppure per vicinanza '
    + 'a una località. Restituisce nome, numero, rete, lunghezza km e difficoltà SAC.',
    {
      nome: z.string().optional().describe('Nome o numero della rotta (es. "Alta Via", "GTA", "AV2")'),
      localita: z.string().optional().describe('In alternativa: località vicino a cui cercare rotte'),
      raggio_km: z.number().min(1).max(30).default(5).describe('Raggio per la ricerca per località'),
      max: z.number().int().min(1).max(50).default(15)
    },
    async ({ nome, localita, raggio_km, max }) => {
      const fmt = t => ({
        nome: t.n || undefined, numero: t.r || undefined,
        rete: NET_LABEL[t.net] || t.net || undefined,
        lunghezza_km: t.d ? (+t.d || t.d) : undefined,
        difficolta: SAC_LABEL[t.sac] || t.sac || undefined
      });
      if (nome) {
        const q = norm(nome);
        const hits = TRAILS.filter(t => norm(t.n || '').includes(q) || norm(t.r || '') === q).slice(0, max);
        return hits.length ? asText({ rotte: hits.map(fmt), totale: hits.length })
          : asError(`Nessuna rotta principale per "${nome}" (il dataset copre le reti regionali/nazionali)`);
      }
      if (localita) {
        const { match } = resolvePlace(localita);
        if (!match) return asError(`Località "${localita}" non trovata`);
        const here = { lat: match.lat, lon: match.lon };
        const hits = TRAILS
          .map(t => ({ t, dist: Math.min(...t.p.map(pt => haversineKm(here, { lat: pt[0], lon: pt[1] }))) }))
          .filter(x => x.dist <= raggio_km)
          .sort((a, b) => a.dist - b.dist)
          .slice(0, max)
          .map(x => fmt(x.t));
        return hits.length ? asText({ vicino_a: match.name, raggio_km, rotte: hits })
          : asError(`Nessuna rotta principale entro ${raggio_km} km da ${match.name}`);
      }
      return asError('Serve nome oppure localita');
    }
  );

  server.tool(
    'soste_camper_vicine',
    'Aree sosta camper e parcheggi per camper (dati OpenStreetMap) entro un raggio da una località o da '
    + 'coordinate, ordinati per distanza. Utile per chi viaggia in furgone/camper. NB: sono i luoghi mappati '
    + 'su OSM, senza recensioni né conferma "tollerato/vietato": verifica sempre sul posto e i divieti locali.',
    {
      localita: z.string().optional().describe('Nome di comune/rifugio da cui cercare'),
      lat: z.number().optional(), lon: z.number().optional(),
      raggio_km: z.number().min(1).max(50).default(15),
      max: z.number().int().min(1).max(50).default(15)
    },
    async ({ localita, lat, lon, raggio_km, max }) => {
      if (localita) {
        const { match } = resolvePlace(localita);
        if (!match) return asError(`Località "${localita}" non trovata`);
        lat = match.lat; lon = match.lon;
      }
      if (lat == null || lon == null) return asError('Serve localita oppure lat+lon');
      const here = { lat, lon };
      const found = CAMPERS
        .map(c => ({ ...c, _d: haversineKm(here, c) }))
        .filter(c => c._d <= raggio_km)
        .sort((a, b) => a._d - b._d)
        .slice(0, max)
        .map(c => ({ nome: c.name, tipo: c.type, quota_m: c.ele || undefined, lat: c.lat, lon: c.lon }));
      return found.length ? asText({ da: { lat, lon }, raggio_ricerca_km: raggio_km, soste_camper: found })
        : asError(`Nessuna sosta camper mappata entro ${raggio_km} km`);
    }
  );

  server.tool(
    'allerte_meteo',
    'Allerte meteo ufficiali (Meteoalarm) per Italia, Francia e Svizzera: temporali, vento, pioggia, neve, '
    + 'caldo/freddo estremo, valanghe. Per ogni allerta: area (regione/dipartimento), livello (giallo/arancione/rosso), '
    + 'tipo, finestra temporale e dettaglio. Se non specifichi il paese, interroga tutti e tre (bbox Alpi occ.): '
    + 'filtra tu per la regione della località (es. Piemonte, Valle d\'Aosta, Hautes-Alpes, Valais).',
    {
      paese: z.enum(['italia', 'francia', 'svizzera']).optional().describe('Limita a un paese; se omesso interroga tutti e tre')
    },
    async ({ paese }) => {
      const paesi = paese ? [paese] : ['italia', 'francia', 'svizzera'];
      const settled = await Promise.all(paesi.map(p => allerteCountry(p).then(a => ({ a })).catch(e => ({ err: `${p}: ${e.message}` }))));
      const allerte = settled.flatMap(s => s.a || []);
      const errori = settled.filter(s => s.err).map(s => s.err);
      const rank = { rosso: 4, arancione: 3, giallo: 2 };
      allerte.sort((a, b) => (rank[b.livello] || 0) - (rank[a.livello] || 0));
      if (!allerte.length) {
        return asText({ allerte: [], nota: `Nessuna allerta attiva (livello ≥ giallo) per: ${paesi.join(', ')}`, fonte: 'Meteoalarm', ...(errori.length ? { errori } : {}) });
      }
      return asText({ allerte, totale: allerte.length, fonte: 'Meteoalarm', ...(errori.length ? { errori } : {}) });
    }
  );

  // ---------- prompt pronti ----------
  server.prompt(
    'pianifica-uscita-weekend',
    'Pianifica un\'escursione per il prossimo weekend in una zona delle Alpi occidentali: meteo, giorno migliore, rifugi e rotte.',
    { zona: z.string().describe('Zona o località di partenza (es. "Valsesia", "Courmayeur", "Val Maira")') },
    ({ zona }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Aiutami a pianificare un'escursione nel weekend in zona ${zona}. Procedi così:
1. Con "cerca_localita" individua la località di riferimento per "${zona}".
2. Con "previsioni" (giorni=7) guarda sabato e domenica: finestra asciutta, rischio temporale, vento, temperature.
3. Con "rifugi_vicini" (raggio 10-15 km) elenca rifugi e bivacchi utili come meta o appoggio, con quota.
4. Con "sentieri" trova le rotte principali della zona (nome, numero, difficoltà).
5. Concludi con una raccomandazione secca: quale giorno uscire, in che fascia oraria (usa la finestra asciutta), verso quale rifugio/rotta, e cosa tenere d'occhio (raffiche, temporali pomeridiani, quota).
Se il meteo è brutto entrambi i giorni, dillo chiaramente e suggerisci un'alternativa a bassa quota o un rinvio.`
        }
      }]
    })
  );

  server.prompt(
    'meteo-rifugio',
    'Verifica se nei prossimi giorni ha senso salire a un rifugio: meteo in quota, giorno e fascia oraria migliori.',
    { rifugio: z.string().describe('Nome del rifugio o bivacco (es. "Capanna Margherita", "Rifugio Vieux Crest")') },
    ({ rifugio }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Voglio salire a ${rifugio} nei prossimi giorni. Con "previsioni" (localita="${rifugio}", giorni=5) valuta il meteo in quota: temperature (occhio a gelo/neve), raffiche di vento, finestre asciutte e rischio temporale. Ricava anche la quota del rifugio dalla risposta. Dimmi il giorno e la fascia oraria migliori per la salita, e se c'è un giorno da evitare assolutamente. Sii diretto: se non ha senso andare, dillo.`
        }
      }]
    })
  );

  server.prompt(
    'confronta-localita',
    'Confronta il meteo di due o più località e scegli dove andare.',
    { localita: z.string().describe('Località separate da virgola (es. "Alagna, Cervinia, Ceresole Reale")') },
    ({ localita }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Devo scegliere dove fare un'escursione tra: ${localita}. Per ognuna usa "previsioni" (giorni=3) e confrontale su: mm di pioggia, finestra asciutta, rischio temporale, raffiche. Fai una classifica motivata e indica la vincitrice con giorno e fascia oraria consigliati. Se sono tutte brutte, dillo senza girarci intorno.`
        }
      }]
    })
  );

  return server;
}
