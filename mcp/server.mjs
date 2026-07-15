// MeteoTrekking MCP server — meteo, rifugi e sentieri delle Alpi occidentali.
// I dati (comuni GeoNames, rifugi OSM, rotte OSM) vengono estratti da ../index.html
// all'avvio: fonte unica, zero duplicazione. Il meteo è Open-Meteo live.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ---------- dati dall'app ----------
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

function extractArray(name) {
  const start = html.indexOf(`const ${name} = [`);
  if (start < 0) throw new Error(`array ${name} non trovato in index.html`);
  const open = html.indexOf('[', start);
  // trova la ] che chiude l'array bilanciando le parentesi
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

// risolve un nome in coordinate: prima comuni, poi rifugi (match esatto > prefisso > contiene)
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

// finestra asciutta nelle ore di luce (stessa logica dell'app)
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
  days.forEach((day, i) => {
    const [n, m, p, s] = rainBands(wx.hourly, day.data);
    day.pioggia_fasce_mm = { notte_0_6: n, mattina_6_12: m, pomeriggio_12_18: p, sera_18_24: s };
  });
  // giorno migliore: più ore di luce all'asciutto, temporali penalizzati (come nell'app)
  let bi = 0, bs = -Infinity;
  days.forEach((day, i) => {
    const score = (day.finestra_asciutta?.ore ?? 0) + (day.rischio_temporale ? -100 : 0);
    if (score > bs) { bs = score; bi = i; }
  });
  return { giorni: days, giorno_migliore: days[bi].data, quota_modello_m: wx.elevation, fonte: 'Open-Meteo' };
}

const asText = o => ({ content: [{ type: 'text', text: JSON.stringify(o, null, 2) }] });
const asError = msg => ({ content: [{ type: 'text', text: JSON.stringify({ errore: msg }) }], isError: true });

// ---------- server ----------
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
      let place = null;
      if (localita) {
        const { match, alternatives } = resolvePlace(localita);
        if (!match) return asError(`Località "${localita}" non trovata tra comuni, rifugi e bivacchi delle Alpi occidentali`);
        place = match;
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
    const found = HUTS
      .map(h => ({ ...h, distanza_km: +haversineKm(here, h).toFixed(1) }))
      .filter(h => h.distanza_km <= raggio_km)
      .sort((a, b) => a.distanza_km - b.distanza_km)
      .slice(0, max)
      .map(h => ({ nome: h.name, tipo: h.type, quota_m: h.ele || undefined, distanza_km: h.distanza_km, lat: h.lat, lon: h.lon }));
    return found.length ? asText({ da: { lat, lon }, raggio_km, rifugi: found })
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
        .map(x => ({ ...fmt(x.t), distanza_min_km: +x.dist.toFixed(1) }));
      return hits.length ? asText({ vicino_a: match.name, raggio_km, rotte: hits })
        : asError(`Nessuna rotta principale entro ${raggio_km} km da ${match.name}`);
    }
    return asError('Serve nome oppure localita');
  }
);

await server.connect(new StdioServerTransport());
console.error(`meteotrekking-mcp avviato: ${TOWNS.length} comuni, ${HUTS.length} rifugi/bivacchi, ${TRAILS.length} rotte`);
