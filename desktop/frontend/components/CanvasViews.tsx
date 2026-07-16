"use client";

import { CanvasView as View } from "@/lib/canvasStore";

// Componenti mostrati nel canvas (al posto della mappa) in base al tool chiamato.
// I dati arrivano dal result del tool MCP (già oggetto parsato).

function Table({ titolo, rows, camper }: { titolo: string; rows: any[]; camper?: boolean }) {
  return (
    <div className="cv">
      <h2 className="cv-h">{camper ? "🚐" : "🛖"} {titolo} <span className="cv-count">{rows?.length ?? 0}</span></h2>
      <div className="cv-tbl-wrap">
        <table className="cv-tbl">
          <thead><tr><th>Nome</th><th>Tipo</th><th>Quota</th><th>Distanza</th></tr></thead>
          <tbody>
            {(rows || []).map((r, i) => (
              <tr key={i}>
                <td className="cv-name">{r.nome}</td>
                <td>{r.tipo}</td>
                <td className="cv-num">{r.quota_m ? `${r.quota_m} m` : "—"}</td>
                <td className="cv-num">{r.distanza_km} km</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Previsioni({ data }: { data: any }) {
  const nome = data?.localita?.nome || data?.punto ? (data.localita?.nome ?? "Punto") : "";
  const best = data?.giorno_migliore;
  return (
    <div className="cv">
      <h2 className="cv-h">🌤️ Previsioni {nome && `· ${nome}`}{data?.quota_modello_m ? ` · ${data.quota_modello_m} m` : ""}</h2>
      <div className="cv-days">
        {(data?.giorni || []).map((g: any, i: number) => (
          <div className={`cv-day ${g.data === best ? "best" : ""}`} key={i}>
            {g.data === best && <span className="cv-star">★ migliore</span>}
            <div className="cv-date">{g.data}</div>
            <div className="cv-sky">{g.cielo}</div>
            <div className="cv-row"><span>🌡️</span> {g.temp_min_c}–{g.temp_max_c}°</div>
            <div className="cv-row"><span>💧</span> {g.pioggia_mm} mm</div>
            <div className="cv-row"><span>💨</span> {g.raffica_max_kmh} km/h {g.vento_da}</div>
            {g.rischio_temporale && <div className="cv-warn">⚡ rischio temporale</div>}
            {g.finestra_asciutta
              ? <div className="cv-ok">✅ asciutto {g.finestra_asciutta.dalle}–{g.finestra_asciutta.alle}</div>
              : <div className="cv-warn">niente finestra asciutta</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Sentieri({ data }: { data: any }) {
  const rotte = data?.rotte || [];
  return (
    <div className="cv">
      <h2 className="cv-h">🥾 Sentieri {data?.vicino_a ? `· vicino a ${data.vicino_a}` : ""} <span className="cv-count">{rotte.length}</span></h2>
      <div className="cv-tbl-wrap">
        <table className="cv-tbl">
          <thead><tr><th>Nome</th><th>N°</th><th>Rete</th><th>Lungh.</th><th>Difficoltà</th></tr></thead>
          <tbody>
            {rotte.map((r: any, i: number) => (
              <tr key={i}>
                <td className="cv-name">{r.nome || "—"}</td>
                <td>{r.numero || "—"}</td>
                <td>{r.rete || "—"}</td>
                <td className="cv-num">{r.lunghezza_km ? `${r.lunghezza_km} km` : (r.distanza_min_km != null ? `~${r.distanza_min_km} km` : "—")}</td>
                <td>{r.difficolta || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const LIV_CLASS: Record<string, string> = { rosso: "rosso", arancione: "arancione", giallo: "giallo" };

function Allerte({ data }: { data: any }) {
  const allerte = data?.allerte || [];
  return (
    <div className="cv">
      <h2 className="cv-h">⚠️ Allerte meteo <span className="cv-count">{allerte.length}</span></h2>
      {allerte.length === 0 && <p>{data?.nota || "Nessuna allerta attiva."}</p>}
      <div className="cv-alerts">
        {allerte.map((a: any, i: number) => (
          <div className={`cv-alert ${LIV_CLASS[a.livello] || ""}`} key={i}>
            <div className="cv-alert-top"><b>{a.tipo || a.evento}</b> · {a.area} <span className="cv-liv">{a.livello}</span></div>
            {a.dettaglio && <div className="cv-alert-det">{a.dettaglio}</div>}
            <div className="cv-alert-time">fino {a.alle}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CanvasBody({ view }: { view: NonNullable<View> }) {
  const { tool, data } = view;
  if (tool === "rifugi_vicini") return <Table titolo="Rifugi vicini" rows={data.rifugi} />;
  if (tool === "soste_camper_vicine") return <Table titolo="Soste camper" rows={data.soste_camper} camper />;
  if (tool === "previsioni") return <Previsioni data={data} />;
  if (tool === "sentieri") return <Sentieri data={data} />;
  if (tool === "allerte_meteo") return <Allerte data={data} />;
  return <pre className="cv-raw">{JSON.stringify(data, null, 2)}</pre>;
}

// tool che meritano una vista nel canvas (gli altri restano solo chip in chat)
export const CANVAS_TOOLS = new Set([
  "rifugi_vicini", "soste_camper_vicine", "previsioni", "sentieri", "allerte_meteo",
]);
