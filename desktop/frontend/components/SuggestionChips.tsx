"use client";

import { useCopilotChat } from "@copilotkit/react-core";
import { TextMessage, Role } from "@copilotkit/runtime-client-gql";

const SUGGESTIONS = [
  "Dove vado in Valsesia questo weekend?",
  "Rifugi entro 10 km da Courmayeur",
  "Da dove si parte per il Rifugio Gabiet?",
  "Ci sono allerte in Piemonte oggi?",
  "Aree sosta camper vicino a Carcoforo",
];

// Strip di domande di esempio sopra la mappa: un clic le invia all'assistente.
export function SuggestionChips() {
  const { appendMessage, isLoading } = useCopilotChat();
  return (
    <div className="suggbar">
      <span className="suggbar-label">Prova a chiedere:</span>
      {SUGGESTIONS.map((s, i) => (
        <button
          key={i}
          className="sugg"
          disabled={isLoading}
          onClick={() => appendMessage(new TextMessage({ content: s, role: Role.User }))}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
