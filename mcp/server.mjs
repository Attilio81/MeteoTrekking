// MeteoTrekking MCP — entry stdio (locale, per Claude Code / Desktop / Cursor…).
// Tutta la logica è in mcp-core.mjs; questa variante usa il trasporto stdio.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, stats } from './mcp-core.mjs';

await createServer().connect(new StdioServerTransport());
console.error(`meteotrekking-mcp (stdio) avviato: ${stats.comuni} comuni, ${stats.rifugi} rifugi/bivacchi, ${stats.rotte} rotte, ${stats.soste_camper} soste camper`);
