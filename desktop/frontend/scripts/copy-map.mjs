// Copia la mappa MeteoTrekking (repo_root/index.html) in public/map.html,
// così il frontend la incorpora in un iframe. Rieseguito a ogni dev/build.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));            // frontend/scripts
const src = join(here, '..', '..', '..', 'index.html');         // repo_root/index.html
const destDir = join(here, '..', 'public');
mkdirSync(destDir, { recursive: true });
copyFileSync(src, join(destDir, 'map.html'));
console.log('map.html aggiornata da', src);
