// MeteoTrekking MCP — entry HTTP stateless (per app mobile via connettore remoto).
// Stessa logica dell'entry stdio (mcp-core.mjs), trasporto Streamable HTTP.
// Deploy: Vercel serverless. Protetto da token bearer (env MCP_TOKEN).
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../mcp/mcp-core.mjs';

export default async function handler(req, res) {
  const token = process.env.MCP_TOKEN;
  if (!token) {
    res.status(500).json({ errore: 'MCP_TOKEN non configurato sul server' });
    return;
  }
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${token}`) {
    res.status(401).json({ errore: 'non autorizzato: manca o è errato il token bearer' });
    return;
  }
  // stateless: un server + transport effimero per richiesta (no sessione, no stato persistente)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createServer();
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ errore: e.message });
  }
}
