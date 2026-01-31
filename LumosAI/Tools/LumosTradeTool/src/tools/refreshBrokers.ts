import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Conductor, ConsoleLogger } from 'lumostrade';

export function registerRefreshBrokersTool(server: McpServer) {
  server.registerTool(
    'refresh_brokers',
    {
      description: `Refresh broker data by syncing trades/orders, account balances, or quotes from connected brokers.
IMPORTANT: Only invoke this tool if the user explicitly used the word "refresh" in their prompt. This operation processes all broker accounts and may take several minutes to complete.
If operation is "trades", you MUST confirm with the user before executing, warning them that this operation may take several seconds to complete.
Operation logs are automatically captured and included in the response to show progress and results.`,
      inputSchema: {
        operation: z
          .enum(['trades', 'balances', 'quotes'])
          .optional()
          .default('balances')
          .describe(
            'Type of refresh to perform: "trades" syncs all trades and orders from brokers (comprehensive - REQUIRES USER CONFIRMATION before execution), "balances" syncs only account balance snapshots (faster - does not display balances to user, only refreshes database values. Use account-balances tool to retrieve and display account balances to the user), "quotes" updates all stored quote prices in the database (does not display quotes to user, only refreshes database values. Use GetQuotes tool to get a real time quote for specific stock symbols to return to the user). Defaults to "balances" if not specified.'
          ),
      },
    },
    async ({ operation }) => {
      const logger = new ConsoleLogger();

      try {
        logger.StartCapture();

        let result;

        if (operation === 'trades') {
          result = await Conductor.RefreshTheWorld();
        } else if (operation === 'quotes') {
          result = await Conductor.RefreshAllQuotes();
        } else {
          result = await Conductor.RefreshAccountBalances();
        }

        logger.StopCapture();
        const logs = logger.GetLogsAsText();

        let responseText = `## Broker Refresh Complete\n\n`;
        const operationLabel =
          operation === 'trades'
            ? 'Refresh Trades & Orders'
            : operation === 'quotes'
            ? 'Refresh Quotes (Database)'
            : 'Refresh Account Balances';
        responseText += `**Operation**: ${operationLabel}\n\n`;

        if (result.HasErrors()) {
          const errorDetails = result.FormatFailures();
          responseText += `**Status**: ⚠️ Completed with errors\n\n`;
          responseText += `### Errors\n${errorDetails}\n\n`;
        } else {
          responseText += `**Status**: ✅ Success\n\n`;
        }

        if (logs) {
          responseText += `### Operation Log\n\`\`\`\n${logs}\n\`\`\`\n`;
        }

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
          isError: result.HasErrors(),
        };
      } catch (error) {
        logger.StopCapture();
        const logs = logger.GetLogsAsText();

        const errorMessage = error instanceof Error ? error.message : String(error);
        let responseText = `## Broker Refresh Failed\n\n`;
        responseText += `**Error**: ${errorMessage}\n\n`;

        if (logs) {
          responseText += `### Operation Log\n\`\`\`\n${logs}\n\`\`\`\n`;
        }

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
