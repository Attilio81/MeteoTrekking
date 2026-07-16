// Estrae le soste camper da OpenStreetMap (Overpass) e le inietta in index.html
// tra le sentinelle "// >>> CAMPERS" e "// <<< CAMPERS".
// Idempotente: rieseguibile (anche da cron mensile). Guardia: aborta se il nuovo
// estratto ha molti meno punti del precedente (Overpass a vuoto = niente commit).
//
// Uso:  node scripts/extract-campers.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const INDEX = join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
// bbox Alpi occidentali: sud, ovest, nord, est
const BBOX = '43.3,5.5,46.6,9.7';
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

// aree che accettano camper: aires (caravan_site), campeggi con camper/roulotte
// (camp_site + motorhome/caravans), parcheggi per camper. NB: molti "area sosta camper"
// comunali sono taggati camp_site, non caravan_site (es. Le Giare a Carcoforo).
const QUERY = `[out:json][timeout:180];
(
  nwr["tourism"="caravan_site"](${BBOX});
  nwr["amenity"="parking"]["motorhome"~"^(yes|designated)$"](${BBOX});
  nwr["amenity"="parking"]["caravans"="yes"](${BBOX});
  nwr["tourism"="camp_site"]["motorhome"~"^(yes|designated)$"](${BBOX});
  nwr["tourism"="camp_site"]["caravans"="yes"](${BBOX});
);
out center tags;`;

const round = n => Math.round(n * 1e4) / 1e4;

function toEntry(el) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  const t = el.tags || {};
  const type = t.amenity === 'parking' ? 'p' : 'c';   // parcheggio vs area/campeggio camper
  const name = (t.name || t['name:it'] || (type === 'c' ? 'Area sosta camper' : 'Parcheggio camper')).trim();
  const ele = Math.round(parseFloat(t.ele)) || 0;
  return [name, round(lat), round(lon), ele, type];
}

async function main() {
  console.error(`Overpass: interrogo soste camper nel bbox ${BBOX}…`);
  let elements = null, lastErr = '';
  for (const ep of OVERPASS) {
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'MeteoTrekking/1.0 (github)' },
        body: 'data=' + encodeURIComponent(QUERY),
        signal: AbortSignal.timeout(75000)
      });
      if (!r.ok) { lastErr = `${ep} → ${r.status}`; console.error(`  ${lastErr}, provo il prossimo mirror…`); continue; }
      ({ elements = [] } = await r.json());
      break;
    } catch (e) { lastErr = `${ep} → ${e.message}`; console.error(`  ${lastErr}, provo il prossimo mirror…`); }
  }
  if (elements == null) throw new Error(`tutti i mirror Overpass falliti (ultimo: ${lastErr})`);

  // dedup per coordinate arrotondate (node + way dello stesso posto)
  const seen = new Set();
  const entries = [];
  for (const el of elements) {
    const e = toEntry(el);
    if (!e) continue;
    const key = e[1] + ',' + e[2];
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(e);
  }
  entries.sort((a, b) => a[0].localeCompare(b[0], 'it'));
  console.error(`Trovate ${entries.length} soste camper (${elements.length} elementi grezzi).`);

  const html = readFileSync(INDEX, 'utf8');
  const START = '// >>> CAMPERS';
  const END = '// <<< CAMPERS';
  const s = html.indexOf(START), e = html.indexOf(END);
  if (s < 0 || e < 0) throw new Error('sentinelle CAMPERS non trovate in index.html');

  // guardia: conta le voci attuali; aborta se il nuovo estratto è < 50%
  const old = (html.slice(s, e).match(/^\[/gm) || []).length;
  if (old > 0 && entries.length < old * 0.5) {
    throw new Error(`ABORTO: estratte ${entries.length} soste ma prima erano ${old} (calo > 50%, Overpass sospetto). Nessuna scrittura.`);
  }

  const block = `${START} auto-generato — non modificare a mano, rigenera con scripts/extract-campers.mjs
// Soste camper (OSM tourism=caravan_site + amenity=parking motorhome, bbox Alpi occ.) — [nome,lat,lon,quota,tipo]
const CAMPERS = [
${entries.map(e => JSON.stringify(e)).join(',\n')}
].map(c => ({ name: c[0], lat: c[1], lon: c[2], ele: c[3], type: c[4] }));
${END}`;

  const out = html.slice(0, s) + block + html.slice(e + END.length);
  writeFileSync(INDEX, out);
  console.error(`index.html aggiornato: ${entries.length} soste camper (prima: ${old}).`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
