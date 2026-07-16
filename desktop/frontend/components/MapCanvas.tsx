"use client";

import { useCanvas } from "@/lib/canvasStore";
import { CanvasBody } from "./CanvasViews";

// Canvas principale: la mappa (index.html in iframe) resta sempre montata (stato
// preservato); quando l'agente produce un elenco/previsione, un pannello la copre
// con il componente generato. "← Mappa" torna alla mappa.
export function MapCanvas() {
  const { view, clear } = useCanvas();
  return (
    <main className="stage">
      {view && (
        <div className="canvas-panel">
          <button className="canvas-back" onClick={clear}>← Mappa</button>
          <CanvasBody view={view} />
        </div>
      )}
      <iframe
        className="map-frame"
        src="/map.html"
        title="Mappa MeteoTrekking"
        style={{ display: view ? "none" : "block" }}
      />
    </main>
  );
}
