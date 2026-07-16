"use client";

import { useState } from "react";

// Pannello impostazioni: provider/modello LLM + chiavi DeepSeek e Tavily.
// Le chiavi non tornano mai al client (solo lo stato "impostata"). Tavily si applica
// subito; provider/modello dal messaggio successivo (il modello viene ricostruito).
export function Settings() {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function openPanel() {
    setOpen(true); setForm({}); setMsg("");
    setCfg(await (await fetch("/api/config", { cache: "no-store" })).json());
  }
  async function save() {
    setSaving(true);
    const r = await fetch("/api/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json();
    setSaving(false); setCfg(d); setForm({}); setMsg(d.ok ? "Salvato ✓" : "Errore");
  }
  const val = (k: string, fallback: string) => (form[k] ?? fallback);

  return (
    <>
      <button className="bb-gear" onClick={openPanel} title="Impostazioni" aria-label="Impostazioni">⚙</button>
      {open && (
        <div className="modal-bg" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Impostazioni</h2>
            {!cfg ? <p>Carico…</p> : (
              <>
                <label>Provider
                  <select value={val("ai_provider", cfg.provider)} onChange={(e) => setForm({ ...form, ai_provider: e.target.value })}>
                    <option value="deepseek">DeepSeek</option>
                    <option value="mistral">Mistral (UE)</option>
                    <option value="local">Locale (Ollama/LM Studio)</option>
                  </select>
                </label>

                <label>Chiave DeepSeek {cfg.has_deepseek && <span className="tag-ok">impostata</span>}
                  <input type="password" autoComplete="off"
                    placeholder={cfg.has_deepseek ? "•••• (vuoto per tenere)" : "incolla la chiave"}
                    onChange={(e) => setForm({ ...form, deepseek_api_key: e.target.value })} />
                </label>

                <label>Modello DeepSeek
                  <select value={val("deepseek_model", cfg.deepseek_model)} onChange={(e) => setForm({ ...form, deepseek_model: e.target.value })}>
                    {(cfg.modelli_deepseek || []).map((m: string) => (
                      <option key={m} value={m}>{m === "deepseek-reasoner" ? "deepseek-reasoner (più potente)" : m}</option>
                    ))}
                  </select>
                </label>

                <label>Chiave Tavily (ricerca web){" "}
                  {cfg.has_tavily
                    ? <span className="tag-ok">impostata</span>
                    : <span className="tag-warn">assente: itinerari limitati ai sentieri</span>}
                  <input type="password" autoComplete="off"
                    placeholder={cfg.has_tavily ? "•••• (vuoto per tenere)" : "opzionale — tavily.com"}
                    onChange={(e) => setForm({ ...form, tavily_api_key: e.target.value })} />
                </label>

                <p className="modal-hint">Modello attivo: <b>{cfg.model}</b>. Tavily si applica subito;
                  provider e modello dal messaggio successivo.</p>
                <div className="modal-actions">
                  <span className="modal-msg">{msg}</span>
                  <button onClick={() => setOpen(false)}>Chiudi</button>
                  <button className="primary" disabled={saving} onClick={save}>{saving ? "Salvo…" : "Salva"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
