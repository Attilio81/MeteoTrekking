"use client";

import { useEffect, useState } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { MapCanvas } from "@/components/MapCanvas";
import { CopilotConfig } from "@/components/CopilotConfig";
import { CanvasProvider } from "@/lib/canvasStore";

export default function Page() {
  // threadId nuovo a ogni caricamento = sessione backend pulita.
  // Fissato in useEffect (non nell'inizializzatore) per evitare mismatch SSR/client.
  const [threadId, setThreadId] = useState("default");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setThreadId("t-" + Date.now());
    setMounted(true);
  }, []);

  return (
    <CanvasProvider>
    <CopilotKit runtimeUrl="/api/copilotkit" agent="my_agent" threadId={threadId} showDevConsole={false}>
      <CopilotConfig />
      <MapCanvas />
      {mounted && (
        <CopilotSidebar
          defaultOpen={true}
          clickOutsideToClose={false}
          labels={{
            title: "Assistente MeteoTrekking",
            initial:
              "Ciao! Chiedimi il meteo di una zona, dove andare nel weekend, rifugi vicini, soste camper o allerte. Es: \"Dove vado in Valsesia questo weekend?\"",
          }}
        />
      )}
    </CopilotKit>
    </CanvasProvider>
  );
}
