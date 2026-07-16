"use client";

import { useEffect } from "react";
import { useCopilotAction } from "@copilotkit/react-core";
import { useCanvas } from "@/lib/canvasStore";
import { CANVAS_TOOLS } from "./CanvasViews";

// Spinta nel canvas UNA sola volta per chiamata di tool reale (per toolCallId), globale:
// così i re-render/re-mount della chat non re-spingono e "← Mappa" (clear) resta.
const pushedCalls = new Set<string>();

function ToolChip({ name, status, result, callId }: { name: string; status: string; result: any; callId?: string }) {
  const { show } = useCanvas();
  const done = status === "complete";
  useEffect(() => {
    if (done && result && CANVAS_TOOLS.has(name) && callId && !pushedCalls.has(callId)) {
      pushedCalls.add(callId);
      show(name, result);
    }
  }, [done, name, result, callId, show]);
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
      <ToolChip name={props.name} status={props.status} result={props.result} callId={props.toolCallId} />
    ),
  });
  return null;
}
