// Endpoint CopilotKit runtime: instrada verso l'agente AGNO (AgentOS/AG-UI) sul backend.
// Il nome 'my_agent' deve combaciare con <CopilotKit agent="my_agent">.
import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { AgnoAgent } from "@ag-ui/agno";
import { NextRequest } from "next/server";

const serviceAdapter = new ExperimentalEmptyAdapter();
const AGENT_URL = (process.env.AGENT_URL || "http://localhost:7000").replace(/\/$/, "");

export const POST = async (req: NextRequest) => {
  const runtime = new CopilotRuntime({
    agents: {
      my_agent: new AgnoAgent({ url: `${AGENT_URL}/agui` }),
    },
  });
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });
  return handleRequest(req);
};
