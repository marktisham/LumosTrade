import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Template for a new MCP tool.
//
// Steps:
//  1) Copy this file to `myNewTool.ts`
//  2) Update the tool name + description
//  3) Define the input schema with Zod
//  4) Implement the handler and return { content: [...] }
//  5) Register it in `src/tools/registerTools.ts`

// Step 3: What is Zod?
//
// Zod is a runtime schema + validation library.
// In MCP tools, we use it to describe the *shape* of tool inputs.
// The MCP SDK uses this schema to validate arguments sent by the client/agent.
//
// Common Zod patterns you'll use:
// - Required string:            z.string()
// - Optional string:            z.string().optional()
// - Optional with default:      z.string().default('abc')
// - Number with bounds:         z.number().min(0).max(10)
// - Enum (string union):        z.enum(['one', 'two', 'three'])
// - Boolean:                    z.boolean()
// - Arrays:                     z.array(z.string())
// - Nested objects (advanced):  z.object({ id: z.string(), ... })
//
// The `.describe('...')` text is shown to the model/UI and is very helpful.
//
// Step 4: What should the handler return?
//
// MCP tool handlers must return an object with a `content` array.
// The simplest useful response is a single text item:
//
//   return {
//     content: [{ type: 'text', text: 'hello' }]
//   };
//
// You can return multiple content items (multiple text blocks, etc.).
// Keep responses concise: agents work best with a short explanation + next step.
//
// Tip: If you need structured output for the model to reliably parse later,
// return JSON as text (e.g. `text: JSON.stringify(obj)`), or add a second tool
// dedicated to returning structured data.

export function registerMyNewTool(server: McpServer) {
  server.registerTool('my_new_tool', {
    description: 'Describe what this tool does.',
    inputSchema: {
      // Input schema (Zod)
      //
      // REQUIRED param example:
      //   accountId: z.string().describe('Broker account ID')
      //
      // OPTIONAL param example:
      //   symbol: z.string().optional().describe('Ticker symbol, e.g. AAPL')
      //
      // OPTIONAL with DEFAULT example:
      //   limit: z.number().int().min(1).max(100).default(25).describe('Max rows to return')
      exampleParam: z.string().optional().describe('Example input param'),
    },
  }, async ({ exampleParam }) => {
    // Handler
    //
    // This is where you implement the tool logic.
    // Throwing an exception will surface as a tool error to the agent.
    // Prefer returning a friendly text response describing what went wrong.

    return {
      content: [
        {
          type: 'text',
          // Most tools should return one or more text blocks.
          // Keep it short and actionable.
          text: `my_new_tool called. exampleParam=${exampleParam ?? ''}`,
        },
      ],
    };
  });
}
