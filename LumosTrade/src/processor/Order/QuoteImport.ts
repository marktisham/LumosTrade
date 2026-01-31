import { DataAccess } from '../../database/DataAccess';
import { ETClient } from '../../Brokers/ETrade/ETClient';
import { Quote } from '../../interfaces/Quote';
import { BrokerClient } from '../../interfaces/BrokerClient';
import { Account } from '../../interfaces/Account';
import { BrokerManager } from '../BrokerManager';

export class QuoteImport {

  // Refresh the latest quote list in the Quotes table with the most recent values.
  // Only imports quotes for open trades.
  public static async Import(broker: BrokerClient, account: Account): Promise<void> {
    console.log(`Importing quotes for account ${account.Name} (${account.AccountID})...`);

    // Load distinct symbols from open trades, place orders, and expected moves for this account
    const symbols = await this.getQuoteSymbols(account);
    if (!symbols || symbols.length === 0) {
      console.log('No symbols found for quotes; no quotes to fetch.');
      return;
    }

    // Fetch quotes from broker
    console.log(`Found ${symbols.length} distinct symbols. Fetching quotes from broker...`);
    try {
      const quotes: Quote[] = await broker.GetQuotes(symbols);

      console.log(`Broker returned ${quotes.length} quotes.`);
      if (quotes && quotes.length > 0) {
        await DataAccess.RefreshQuotes(quotes, account);
      }
    } catch (err) {
      console.error('Failed to fetch or persist quotes from ETClient:', err);
    }

      // Reset open trades with the latest quote values for this account.
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      console.log(`Quote import complete for account ${account.Name} (${account.AccountID})...`);
    }

  /**
   * Return a de-duplicated, normalized list of symbols to fetch quotes for.
   * Combines open trades, place orders, and expected move symbols.
   */
  private static async getQuoteSymbols(account: Account): Promise<string[]> {
    if (!account || account.AccountID == null) {
      throw new Error('Account.AccountID is required');
    }

    const [openTradeSymbols, placeOrderSymbols, expectedMoveSymbols] = await Promise.all([
      DataAccess.GetOpenTradeSymbols(account),
      DataAccess.GetPlaceOrderSymbols(account),
      DataAccess.GetExpectedMoveSymbols()
    ]);

    const all = [
      ...(openTradeSymbols || []),
      ...(placeOrderSymbols || []),
      ...(expectedMoveSymbols || [])
    ];

    const normalized = all
      .map(s => (s ?? '').toString().trim().toUpperCase())
      .filter(s => s.length > 0);

    return Array.from(new Set(normalized));
  }

  }
