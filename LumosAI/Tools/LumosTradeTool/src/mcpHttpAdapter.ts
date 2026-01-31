import type { Express, Request, Response } from 'express';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// This adapter isolates MCP SDK transport glue so the rest of the service
// stays stable if the SDK APIs evolve.
//
// We prefer Streamable HTTP because ADK’s `StreamableHTTPConnectionParams`
// expects an HTTP endpoint.

export function attachMcpStreamableHttpEndpoint(opts: { app: Express; mcpServer: McpServer; path: string }) {
  const { app, mcpServer, path } = opts;

  // Prefer stateless mode for Cloud Run compatibility (requests may hit different instances).
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  void mcpServer.connect(transport);

  app.all(path, async (req: Request, res: Response) => {
    await transport.handleRequest(req, res, (req as any).body);
  });
}
