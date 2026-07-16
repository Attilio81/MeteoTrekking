"use client";

import { useEffect, useRef } from "react";
import { useCopilotAction } from "@copilotkit/react-core";
import { useCanvas } from "@/lib/canvasStore";
import { CANVAS_TOOLS } from "./CanvasViews";

// Chip compatto in chat per ogni chiamata tool; quando un tool "da canvas" (rifugi,
// soste, previsioni, sentieri, allerte) completa, spinge il result nel canvas UNA volta.
function ToolChip({ name, status, result }: { name: string; status: string; result: any }) {
  const { show } = useCanvas();
  const done = status === "complete";
  const pushed = useRef(false);
  useEffect(() => {
    if (done && result && !pushed.current && CANVAS_TOOLS.has(name)) {
      pushed.current = true;   // spinge una sola volta: niente loop di render
      show(name, result);
    }
  }, [done, name, result, show]);
  return (
    <div className={`toolchip ${done ? "done" : "run"}`}>
      <span className="tc-ic">{done ? "✓" : "…"}</span>
      <span className="tc-name">{name.replace(/_/g, " ")}</span>
    </div>
  );
}

export function CopilotConfig() {
  useCopilotAction({
    name: "*",
    render: (props: any) => (
      <ToolChip name={props.name} status={props.status} result={props.result} />
    ),
  });
  return null;
}
