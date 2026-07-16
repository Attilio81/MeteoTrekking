// Costruisce mcp/data.db (SQLite) dai dati incorporati in index.html.
// index.html resta la sorgente human/offline del sito; il DB è derivato e usato dal
// server MCP e dall'agente. Rieseguibile dopo ogni estrazione. Node >= 22.5 (node:sqlite).
//
// Uso:  node scripts/build-db.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const DB_PATH = join(ROOT, 'mcp', 'data.db');

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

const TOWNS = extractArray('TOWNS');     // [nome,lat,lon,pop]
const HUTS = extractArray('HUTS');       // [nome,lat,lon,quota,tipo]  tipo a|w
const TRAILS = extractArray('TRAILS');   // {r,n,net,d,sac,c,p:[[lat,lon]..]}
const CAMPERS = extractArray('CAMPERS'); // [nome,lat,lon,quota,tipo]  tipo c|p

// solo la BASE (derivata da index.html). L'overlay editabile vive in un DB separato
// (mcp/punti.db), così data.db resta immutabile a runtime e committabile pulito.
const db = new DatabaseSync(DB_PATH);
db.exec(`
  DROP TABLE IF EXISTS comuni;
  DROP TABLE IF EXISTS rifugi;
  DROP TABLE IF EXISTS rotte;
  DROP TABLE IF EXISTS soste;
  CREATE TABLE comuni (nome TEXT, lat REAL, lon REAL, pop INTEGER);
  CREATE TABLE rifugi (nome TEXT, lat REAL, lon REAL, ele INTEGER, tipo TEXT);
  CREATE TABLE rotte  (ref TEXT, nome TEXT, net TEXT, dist TEXT, sac TEXT, colore TEXT, punti TEXT);
  CREATE TABLE soste  (nome TEXT, lat REAL, lon REAL, ele INTEGER, tipo TEXT);
`);

const tx = (fn) => { db.exec('BEGIN'); try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } };

tx(() => {
  const c = db.prepare('INSERT INTO comuni VALUES(?,?,?,?)');
  for (const t of TOWNS) c.run(t[0], t[1], t[2], t[3] ?? null);
  const h = db.prepare('INSERT INTO rifugi VALUES(?,?,?,?,?)');
  for (const x of HUTS) h.run(x[0], x[1], x[2], x[3] || null, x[4]);
  const r = db.prepare('INSERT INTO rotte VALUES(?,?,?,?,?,?,?)');
  for (const t of TRAILS) r.run(t.r ?? null, t.n ?? null, t.net ?? null, t.d ?? null, t.sac ?? null, t.c ?? null, JSON.stringify(t.p || []));
  const s = db.prepare('INSERT INTO soste VALUES(?,?,?,?,?)');
  for (const x of CAMPERS) s.run(x[0], x[1], x[2], x[3] || null, x[4]);
});

const n = (t) => db.prepare(`SELECT count(*) c FROM ${t}`).get().c;
console.error(`data.db: comuni=${n('comuni')} rifugi=${n('rifugi')} rotte=${n('rotte')} soste=${n('soste')}`);
db.close();
