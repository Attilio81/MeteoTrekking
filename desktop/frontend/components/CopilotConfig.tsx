"use client";

import { useCopilotAction } from "@copilotkit/react-core";

// Render compatto per QUALSIASI chiamata di tool (catch-all "*"): sostituisce il
// riquadro default di CopilotKit con un chip pulito. Montato dentro <CopilotKit>.
export function CopilotConfig() {
  useCopilotAction({
    name: "*",
    render: ({ name, status }: { name: string; status: string }) => {
      const done = status === "complete";
      const label = name.replace(/_/g, " ");
      return (
        <div className={`toolchip ${done ? "done" : "run"}`}>
          <span className="tc-ic">{done ? "✓" : "…"}</span>
          <span className="tc-name">{label}</span>
        </div>
      );
    },
  });
  return null;
}
