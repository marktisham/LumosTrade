# LumosTradeTool (Node MCP)

Node.js + TypeScript MCP server deployed to Cloud Run as lumos-tool-trade.

## Add a tool

1. Create a new file under src/tools/ (or copy src/tools/_TEMPLATE.ts).
2. Export a register function that calls server.tool(...).
3. Register it in src/tools/registerTools.ts.

## Local run

- Tool server: ./lumos run lumostradetool
- MCP endpoint: http://127.0.0.1:8082/mcp

## Notes

- Keep src/index.ts focused on server boot and wiring.
- Keep tool implementations in src/tools/.
- Add shared helpers under src/lib/.

## Related documentation

- Operations: [../../../docs/OPERATIONS.md](../../../docs/OPERATIONS.md)
