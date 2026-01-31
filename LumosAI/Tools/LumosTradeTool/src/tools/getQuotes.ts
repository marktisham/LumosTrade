import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ETClient, SCHClient, Quote, SimulatorClientET, LumosStateHelper } from 'lumostrade';

export function registerGetQuotesTool(server: McpServer) {
  server.registerTool('get_quotes', {
    description: 'Retrieve real-time stock market quotes for one or more ticker symbols. Use this tool when the user asks for "latest price", "current price", "latest quote", "current quote", "stock price", or similar queries. Supports fetching quotes from E*TRADE and/or Charles Schwab for comparison. Returns market data including price, bid/ask, daily high/low, previous close, and other quote details. The Price field is always included and is the primary data point of interest.',
    inputSchema: {
      symbols: z.array(z.string())
        .min(1)
        .describe('List of stock ticker symbols to get quotes for (e.g., ["AAPL", "TSLA", "MSFT"])'),
      
      brokers: z.array(z.enum(['etrade', 'schwab']))
        .optional()
        .describe('List of brokers to get quotes from. Options: "etrade", "schwab". If not specified, defaults to ["etrade"] (do not also call any other brokers in that case). You can specify both to compare quotes from different brokers.'),
      
      fields: z.array(z.string())
        .optional()
        .describe('Optional list of specific quote fields to return. If not specified, all available quote data is returned. Available fields: Symbol, Price, CompanyName, Bid, Ask, DailyHigh, DailyLow, Open, PreviousClose, Beta, ChangeFromClose, ChangeFromClosePct, Close, NextEarningsDate, ExDividendDate, LastUpdated. Note: Price is always included regardless of this parameter.'),
    },
  }, async ({ symbols, brokers, fields }) => {
    try {
      // Default to ETrade if no brokers specified
      const brokersToQuery = brokers && brokers.length > 0 ? brokers : ['etrade'];
      
      // Results structure: { broker: string, quotes: Quote[] }[]
      const results: Array<{ broker: string; quotes: Quote[] }> = [];
      const failedBrokers: string[] = [];
      
      // Query each broker (skip failures; only return an error if all brokers fail)
      for (const broker of brokersToQuery) {
        try {
          let quotes: Quote[] = [];

          if (LumosStateHelper.IsDemoMode()) {
              const simulatorClient = new SimulatorClientET();
              quotes = await simulatorClient.GetQuotes(symbols, true);
          } else {
            if (broker === 'schwab') {
              const schClient = new SCHClient();
              quotes = await schClient.GetQuotes(symbols, true);
            } else {
              // Default to etrade
              const etClient = new ETClient();
              quotes = await etClient.GetQuotes(symbols, true);
            }
          }

          results.push({
            broker: broker === 'schwab' ? 'Charles Schwab' : 'E*TRADE',
            quotes,
          });
        } catch (err) {
          // Record failed broker and continue with others
          failedBrokers.push(broker);
          // Minimal logging for diagnostics
          console.warn(`get_quotes: failed to fetch from ${broker}:`, err);
        }
      }

      // If all brokers failed, return an error
      if (results.length === 0) {
        const failedDisplay = failedBrokers.map(b => b === 'etrade' ? 'E*TRADE' : 'Charles Schwab').join(', ');
        return {
          content: [
            {
              type: 'text',
              text: `Error retrieving quotes: Failed to retrieve quotes from any brokers (${failedDisplay}).`,
            },
          ],
          isError: true,
        };
      }
      
      // Format the response
      let responseText = '';
      if (failedBrokers.length > 0) {
        const failedDisplay = failedBrokers.map(b => b === 'etrade' ? 'E*TRADE' : 'Charles Schwab').join(', ');
        responseText += `⚠️ Warning: Failed to retrieve quotes from: ${failedDisplay}\n\n`;
      }
      
      for (const result of results) {
        if (results.length > 1) {
          responseText += `\n## ${result.broker}\n`;
        }
        
        for (const quote of result.quotes) {
          responseText += `\n### ${quote.Symbol}`;
          if (quote.CompanyName) {
            responseText += ` (${quote.CompanyName})`;
          }
          responseText += '\n';
          
          // Always include Price (as specified in requirements)
          responseText += `- **Price**: $${quote.Price?.toFixed(2) ?? 'N/A'}\n`;
          
          // If specific fields requested, only include those (but Price is always included above)
          if (fields && fields.length > 0) {
            const requestedFields = new Set(fields.map(f => f.toLowerCase()));
            
            // Map field names to values and labels
            const fieldMap: Record<string, { value: any; label: string; formatter?: (val: any) => string }> = {
              'companyname': { value: quote.CompanyName, label: 'Company Name' },
              'bid': { value: quote.Bid, label: 'Bid', formatter: (v) => v != null ? `$${v.toFixed(2)}` : 'N/A' },
              'ask': { value: quote.Ask, label: 'Ask', formatter: (v) => v != null ? `$${v.toFixed(2)}` : 'N/A' },
              'dailyhigh': { value: quote.DailyHigh, label: 'Daily High', formatter: (v) => v != null ? `$${v.toFixed(2)}` : 'N/A' },
              'dailylow': { value: quote.DailyLow, label: 'Daily Low', formatter: (v) => v != null ? `$${v.toFixed(2)}` : 'N/A' },
              'open': { value: quote.Open, label: 'Open', formatter: (v) => v != null ? `$${v.toFixed(2)}` : 'N/A' },
              'previousclose': { value: quote.PreviousClose, label: 'Previous Close', formatter: (v) => v != null ? `$${v.toFixed(2)}` : 'N/A' },
              'beta': { value: quote.Beta, label: 'Beta', formatter: (v) => v != null ? v.toFixed(2) : 'N/A' },
              'changefromclose': { value: quote.ChangeFromClose, label: 'Change From Close', formatter: (v) => v != null ? `$${v.toFixed(2)}` : 'N/A' },
              'changefromclosepct': { value: quote.ChangeFromClosePct, label: 'Change %', formatter: (v) => v != null ? `${v.toFixed(2)}%` : 'N/A' },
              'close': { value: quote.Close, label: 'Close', formatter: (v) => v != null ? `$${v.toFixed(2)}` : 'N/A' },
              'nextearningsdate': { value: quote.NextEarningsDate, label: 'Next Earnings Date', formatter: (v) => v ? new Date(v).toLocaleDateString() : 'N/A' },
              'exdividenddate': { value: quote.ExDividendDate, label: 'Ex-Dividend Date', formatter: (v) => v ? new Date(v).toLocaleDateString() : 'N/A' },
              'lastupdated': { value: quote.LastUpdated, label: 'Last Updated', formatter: (v) => v ? new Date(v).toISOString() : 'N/A' },
            };
            
            for (const [fieldKey, fieldInfo] of Object.entries(fieldMap)) {
              // Skip Symbol and Price as they're already handled above
              if (fieldKey === 'symbol' || fieldKey === 'price') continue;
              
              if (requestedFields.has(fieldKey)) {
                const formattedValue = fieldInfo.formatter 
                  ? fieldInfo.formatter(fieldInfo.value)
                  : (fieldInfo.value ?? 'N/A');
                responseText += `- **${fieldInfo.label}**: ${formattedValue}\n`;
              }
            }
          } else {
            // Return all available fields
            if (quote.Bid != null) responseText += `- **Bid**: $${quote.Bid.toFixed(2)}\n`;
            if (quote.Ask != null) responseText += `- **Ask**: $${quote.Ask.toFixed(2)}\n`;
            if (quote.DailyHigh != null) responseText += `- **Daily High**: $${quote.DailyHigh.toFixed(2)}\n`;
            if (quote.DailyLow != null) responseText += `- **Daily Low**: $${quote.DailyLow.toFixed(2)}\n`;
            if (quote.Open != null) responseText += `- **Open**: $${quote.Open.toFixed(2)}\n`;
            if (quote.PreviousClose != null) responseText += `- **Previous Close**: $${quote.PreviousClose.toFixed(2)}\n`;
            if (quote.ChangeFromClose != null) responseText += `- **Change From Close**: $${quote.ChangeFromClose.toFixed(2)}\n`;
            if (quote.ChangeFromClosePct != null) responseText += `- **Change %**: ${quote.ChangeFromClosePct.toFixed(2)}%\n`;
            if (quote.Close != null) responseText += `- **Close**: $${quote.Close.toFixed(2)}\n`;
            if (quote.Beta != null) responseText += `- **Beta**: ${quote.Beta.toFixed(2)}\n`;
            if (quote.NextEarningsDate) responseText += `- **Next Earnings Date**: ${new Date(quote.NextEarningsDate).toLocaleDateString()}\n`;
            if (quote.ExDividendDate) responseText += `- **Ex-Dividend Date**: ${new Date(quote.ExDividendDate).toLocaleDateString()}\n`;
            responseText += `- **Last Updated**: ${new Date(quote.LastUpdated).toISOString()}\n`;
          }
        }
      }
      
      // Return the formatted response
      return {
        content: [
          {
            type: 'text',
            text: responseText.trim(),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error retrieving quotes: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });
}
