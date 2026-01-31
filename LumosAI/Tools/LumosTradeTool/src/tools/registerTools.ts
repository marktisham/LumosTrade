import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Tool registry
//
// Add new MCP tools by:
//  1) Creating a new file in this folder (e.g. `src/tools/myNewTool.ts`)
//  2) Exporting a `registerMyNewTool(server: McpServer)` function
//  3) Importing and calling it inside `registerTools()` below
//
// This keeps `src/index.ts` focused on server bootstrapping.

import { registerGetQuotesTool } from './getQuotes.js';
import { registerRefreshBrokersTool } from './refreshBrokers.js';

export function registerTools(server: McpServer) {
  // Register all tools exposed by this MCP server.
  registerGetQuotesTool(server);
  registerRefreshBrokersTool(server);

  // Add new registrations here.
}
