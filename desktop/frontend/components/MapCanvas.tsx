"use client";

import { useEffect, useRef } from "react";
import { useCanvas, CanvasView } from "@/lib/canvasStore";
import { CanvasBody } from "./CanvasViews";
import { SuggestionChips } from "./SuggestionChips";

// Estrae centro + pin dalle viste geo, per pilotare la mappa (postMessage).
function geoCmd(view: NonNullable<CanvasView>): { center?: any; points: any[] } | null {
  const { tool, data } = view;
  const pts: any[] = [];
  let center: any = null;
  const push = (arr: any[]) => (arr || []).forEach((r) =>
    typeof r?.lat === "number" && typeof r?.lon === "number" && pts.push({ lat: r.lat, lon: r.lon, label: r.nome }));
  if (tool === "previsioni") {
    const l = data?.localita || data?.punto;
    if (l && typeof l.lat === "number") { center = { lat: l.lat, lon: l.lon, zoom: 12 }; pts.push({ lat: l.lat, lon: l.lon, label: l.nome || "qui" }); }
  } else if (tool === "rifugi_vicini") { push(data?.rifugi); if (data?.da) center = data.da; }
  else if (tool === "soste_camper_vicine") { push(data?.soste_camper); if (data?.da) center = data.da; }
  else if (tool === "punti_vicini") { push(data?.punti); if (data?.da) center = data.da; }
  return pts.length || center ? { center, points: pts } : null;
}

// Canvas: la mappa (index.html in iframe) resta montata; quando l'agente produce un elenco,
// un pannello la copre col componente generato. Tornando alla mappa ("← Mappa"), la mappa
// vola sui risultati e mette i pin (l'agente la pilota via postMessage).
export function MapCanvas() {
  const { view, clear } = useCanvas();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<any>(null);

  useEffect(() => {
    if (view) {
      const cmd = geoCmd(view);
      if (cmd) pendingRef.current = cmd;   // memorizza; invia quando la mappa torna visibile
    } else if (pendingRef.current && readyRef.current) {
      iframeRef.current?.contentWindow?.postMessage({ source: "meteotrekking-app", ...pendingRef.current }, "*");
      pendingRef.current = null;
    }
  }, [view]);

  return (
    <main className="stage">
      {view && (
        <div className="canvas-panel">
          <button className="canvas-back" onClick={clear}>← Mappa</button>
          <CanvasBody view={view} />
        </div>
      )}
      <iframe
        ref={iframeRef}
        className="map-frame"
        src="/map.html"
        title="Mappa MeteoTrekking"
        onLoad={() => { readyRef.current = true; }}
        style={{ display: view ? "none" : "block" }}
      />
      {!view && <SuggestionChips />}
    </main>
  );
}
