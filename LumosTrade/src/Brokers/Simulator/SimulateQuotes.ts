import { Quote } from '../../interfaces/Quote';
import { DataAccess } from '../../database/DataAccess';
import { SimulationOrchestrator } from '../../processor/Simulator/SimulationOrchestrator';

// Forward declaration to avoid circular dependency
interface ISimulatorClient {
  GetBrokerID(): number;
  GetEffectiveDate(): Date;
}

// Symbol configuration for quote simulation
interface SymbolConfig {
  symbol: string;
  initialPrice: number;
  avgGainPct: number;
  avgLossPct: number;
  winChancePct: number;
}

// Simulated symbol registry - compact format for easy editing
const SIMULATED_SYMBOLS: SymbolConfig[] = [
  // Popular large caps / etfs
  { symbol: 'AAPL', initialPrice: 250.12, avgGainPct: 0.4, avgLossPct: 0.2, winChancePct: 50 },
  { symbol: 'MSFT', initialPrice: 425.33, avgGainPct: 0.4, avgLossPct: 0.2, winChancePct: 50 },
  { symbol: 'TSLA', initialPrice: 391.20, avgGainPct: 1.2, avgLossPct: 0.9, winChancePct: 45 },
  { symbol: 'SPY', initialPrice: 580.15, avgGainPct: 0.7, avgLossPct: 0.5, winChancePct: 50 },
  { symbol: 'QQQ', initialPrice: 516.30, avgGainPct: 1.2, avgLossPct: 0.8, winChancePct: 45 },

  // Blue chips / safety
  { symbol: 'F', initialPrice: 10.05, avgGainPct: 0.2, avgLossPct: 0.4, winChancePct: 50 },
  { symbol: 'BRK.B', initialPrice: 455.15, avgGainPct: 0.2, avgLossPct: 0.1, winChancePct: 50 },
  { symbol: 'SCHD', initialPrice: 27.35, avgGainPct: 0.2, avgLossPct: 0.3, winChancePct: 45 },

  // Speculative / high beta
  { symbol: 'ARKK', initialPrice: 60.05, avgGainPct: 1.1, avgLossPct: 1.2, winChancePct: 45 },
  { symbol: 'SOXL', initialPrice: 29.05, avgGainPct: 2.2, avgLossPct: 1.3, winChancePct: 55 },
  { symbol: 'IBIT', initialPrice: 53.50, avgGainPct: 2.1, avgLossPct: 2.3, winChancePct: 40 },
  { symbol: 'TQQQ', initialPrice: 40.38, avgGainPct: 2.3, avgLossPct: 1.5, winChancePct: 50 },
];

// Initial quote date for simulation baseline
const INITIAL_QUOTE_DATE = new Date('2025-01-01T09:30:00.000-05:00');

/**
 * Handles quote simulation for simulated broker accounts.
 */
export class SimulateQuotes {


  /**
   * Simulate quotes for a list of symbols.
   */
  static async GetQuotes(
    simulatorClient: ISimulatorClient,
    symbols: string[],
    detailedQuote?: boolean
  ): Promise<Quote[]> {
    const quotes: Quote[] = [];
    const currentDate = simulatorClient.GetEffectiveDate();

    for (const symbol of symbols) {
      const quote = await this.generateSimulatedQuote(symbol, currentDate);
      if (quote === null) {
        console.error(`SimulateQuotes: Symbol ${symbol} not found in configuration`);
        continue;
      }
      quotes.push(quote);
    }

    return quotes;
  }

  /**
   * Generate a simulated quote for a single symbol.
   * @param symbol The stock symbol
   * @param currentDate Current/end date for simulation
   * @param test When true, skips database calls and uses config defaults
   * @returns Quote object or null if symbol not configured
   */
  private static async generateSimulatedQuote(
    symbol: string,
    currentDate: Date,
    test: boolean = false
  ): Promise<Quote | null> {
    // Lookup symbol configuration
    const config = SIMULATED_SYMBOLS.find(s => s.symbol === symbol);
    if (!config) {
        console.error(`SimulateQuotes: No configuration found for symbol ${symbol}`);
        return null;
    }

    // Determine starting price and date
    let currentPrice: number;
    let effectiveStartDate: Date;

    if (test) {
      // Use config defaults for testing
      currentPrice = config.initialPrice;
      effectiveStartDate = INITIAL_QUOTE_DATE;
    } else {
      // Try to get latest price from database
      const latestPrice = await DataAccess.GetLatestPriceForSymbol(symbol, currentDate);
      if (latestPrice !== null) {
        currentPrice = latestPrice.price;
        effectiveStartDate = new Date(Math.max(latestPrice.date.getTime(), INITIAL_QUOTE_DATE.getTime()));
      } else {
        // Use config defaults
        currentPrice = config.initialPrice;
        effectiveStartDate = INITIAL_QUOTE_DATE;
      }
    }

    // Generate trading days between start and current date
    const tradingDays = SimulationOrchestrator.GenerateTradingDays(effectiveStartDate, currentDate);

    // Always run simulation at least once
    const daysToSimulate = tradingDays.length > 0 ? tradingDays.length : 1;

    // Simulate price evolution day by day
    for (let i = 0; i < daysToSimulate; i++) {
      currentPrice = SimulationOrchestrator.GenerateRandomPrice(
        currentPrice,
        config.avgLossPct,
        config.avgGainPct,
        config.winChancePct
      );
      
      // Validate price after each simulation step
      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        console.error(`SimulateQuotes: Invalid price generated for ${symbol} on day ${i}: ${currentPrice}`);
        console.error(`Config: avgLossPct=${config.avgLossPct}, avgGainPct=${config.avgGainPct}, winChancePct=${config.winChancePct}`);
        return null;
      }
    }

    // Final validation before creating Quote
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      console.error(`SimulateQuotes: Final price invalid for ${symbol}: ${currentPrice}`);
      return null;
    }

    // Create and return Quote object
    const quote = new Quote(
      0, // QuoteID (not persisted yet)
      0, // AccountID (set by caller if needed)
      symbol,
      currentPrice,
      currentDate
    );

    return quote;
  }

  /**
   * Test function to display simulated quotes for all configured symbols.
   * @param endDate The end date for simulation (defaults to current date)
   * @param symbol Optional symbol to test (if null, tests all symbols)
   */
  static async TestQuotes(endDate: Date = new Date(), symbol: string | null = null): Promise<void> {
    console.log('\n=== Simulated Quote Test ===');
    console.log(`Start Date: ${INITIAL_QUOTE_DATE.toISOString()}`);
    console.log(`End Date:   ${endDate.toISOString()}`);
    if (symbol !== null) {
      console.log(`Symbol:     ${symbol}`);
    }
    console.log('');

    const results: Array<{ Symbol: string; 'Start Price': string; 'End Price': string; 'Change %': string }> = [];

    // Filter symbols if specific symbol requested
    const symbolsToTest = symbol !== null 
      ? SIMULATED_SYMBOLS.filter(config => config.symbol === symbol)
      : SIMULATED_SYMBOLS;

    if (symbol !== null && symbolsToTest.length === 0) {
      console.error(`Symbol ${symbol} not found in SIMULATED_SYMBOLS configuration`);
      return;
    }

    const sortedSymbolsToTest = [...symbolsToTest].sort((a, b) => a.symbol.localeCompare(b.symbol));
    for (const config of sortedSymbolsToTest) {
      const quote = await this.generateSimulatedQuote(config.symbol, endDate, true);
      if (quote === null) {
        results.push({
          Symbol: config.symbol,
          'Start Price': config.initialPrice.toFixed(2),
          'End Price': 'ERROR',
          'Change %': 'N/A'
        });
        continue;
      }

      const startPrice = config.initialPrice;
      const endPrice = quote.Price;
      const changePct = ((endPrice - startPrice) / startPrice * 100);

      results.push({
        Symbol: config.symbol,
        'Start Price': startPrice.toFixed(2),
        'End Price': endPrice.toFixed(2),
        'Change %': changePct.toFixed(2) + '%'
      });
    }

    // Print results without the default index column
    if (results.length === 0) {
      console.log('No results');
      console.log('');
      return;
    }

    const cols = Object.keys(results[0]);
    const widths: number[] = cols.map(c => Math.max(c.length, ...results.map(r => (r[c as keyof typeof r] as string).length)));

    // Helper to pad values (right-align numeric-looking columns)
    const isNumeric = (s: string) => /^-?\d+(?:\.\d+)?%?$/.test(s);

    const formatRow = (row: any) => cols.map((c, i) => {
      const val = row[c as keyof typeof row] as string;
      return isNumeric(val) ? val.padStart(widths[i]) : val.padEnd(widths[i]);
    }).join(' | ');

    const header = cols.map((c, i) => c.padEnd(widths[i])).join(' | ');
    const separator = widths.map(w => '-'.repeat(w)).join('-+-');

    console.log(header);
    console.log(separator);
    for (const r of results) {
      console.log(formatRow(r));
    }
    console.log('');
  }
}
