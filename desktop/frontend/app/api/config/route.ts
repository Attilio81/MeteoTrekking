// Proxy verso il backend (stessa origine per il browser, niente CORS).
import { NextRequest } from "next/server";

const AGENT_URL = (process.env.AGENT_URL || "http://localhost:7000").replace(/\/$/, "");

export async function GET() {
  const r = await fetch(`${AGENT_URL}/api/config`, { cache: "no-store" });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}

export async function POST(req: NextRequest) {
  const r = await fetch(`${AGENT_URL}/api/config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await req.text(),
  });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}
