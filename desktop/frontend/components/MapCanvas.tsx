"use client";

// La mappa MeteoTrekking (index.html del repo, copiato in public/map.html a build/dev)
// incorporata in un iframe a tutto schermo. Fase 1: mappa interattiva indipendente,
// la chat risponde a fianco. Fase 2 (futuro): l'agente pilota la mappa via postMessage.
export function MapCanvas() {
  return (
    <main className="stage">
      <iframe className="map-frame" src="/map.html" title="Mappa MeteoTrekking" />
    </main>
  );
}
