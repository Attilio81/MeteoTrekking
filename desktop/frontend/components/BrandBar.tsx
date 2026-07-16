"use client";

import { useCanvas } from "@/lib/canvasStore";

// Barra superiore: identità del prodotto + "Nuova chat". Occupa la fascia sopra la
// mappa/canvas (lascia i 448px della chat a destra).
export function BrandBar({ onNewChat }: { onNewChat: () => void }) {
  const { clear } = useCanvas();
  const nuovaChat = () => {
    onNewChat();   // nuovo threadId = sessione backend pulita
    clear();       // svuota il canvas -> torna alla mappa
  };
  return (
    <header className="brandbar">
      <span className="bb-logo" aria-hidden="true">🏔️</span>
      <span className="bb-title">MeteoTrekking</span>
      <span className="bb-sub">Alpi occidentali · meteo · rifugi · sentieri · soste camper</span>
      <button className="bb-new" onClick={nuovaChat}>✏️ Nuova chat</button>
    </header>
  );
}
