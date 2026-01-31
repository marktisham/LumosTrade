/*
 * Copyright 2026 Mark Isham
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools/registerTools.js';

// NOTE: This service is intended to be deployed to Cloud Run and called by ADK agents
// via Streamable HTTP MCP at the /mcp endpoint.

const environment = process.env.ENVIRONMENT ?? 'development';
const buildNumber = process.env.BUILD_NUMBER ?? 'local';

const port = Number(process.env.PORT ?? 8080);

const app = express();

// CORS middleware - required for MCP Streamable HTTP when called by agents
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.type('text/plain').send('LumosTradeTool: OK');
});

// MCP server bootstrapping
//
// Add new tools under `src/tools/` and register them in `src/tools/index.ts`.
const mcpServer = new McpServer({
  name: 'LumosTradeTool',
  version: '0.1.0',
});

registerTools(mcpServer);

// Wire MCP Streamable HTTP endpoint
// The ADK client expects /mcp (see StreamableHTTPConnectionParams in LumosChat).
//
// The MCP SDK provides a helper to attach to an HTTP framework; the exact handler
// is implemented in a tiny adapter module so this file stays small.
import { attachMcpStreamableHttpEndpoint } from './mcpHttpAdapter.js';
attachMcpStreamableHttpEndpoint({ app, mcpServer, path: '/mcp' });

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`LumosTradeTool listening on :${port}`);
  // eslint-disable-next-line no-console
  console.log(`ENVIRONMENT=${environment} BUILD_NUMBER=${buildNumber}`);
});
