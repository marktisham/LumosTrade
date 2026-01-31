import { DataAccess } from '../database/DataAccess';
import { Account } from '../interfaces/Account';
import { Trade } from '../interfaces/Trade';
import { Quote } from '../interfaces/Quote';
import { RoundUtil } from '../utils/RoundUtil';

const TEST_ACCOUNT_ID = -1;
let account: Account;

beforeAll(async () => {
  account = await DataAccess.EnsureTestAccount(TEST_ACCOUNT_ID);
  if (!account.Closed) {
    throw new Error(`Test account ${TEST_ACCOUNT_ID} has Closed=false, indicating a potential ID collision with a real account. Please verify the test account ID.`);
  }
});

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  // Close the database connection pool to prevent Jest from hanging
  await DataAccess.closePool();
});

async function cleanup() {
  await DataAccess.DeleteAllTrades(account);
  await DataAccess.DeleteAllQuotes(account);
}

function createQuote(symbol: string, price: number, lastUpdated?: Date): Quote {
  return new Quote(0, TEST_ACCOUNT_ID, symbol, price, lastUpdated ?? new Date());
}

function createTrade(symbol: string, long: boolean, qty: number, entry: number, largestRisk = 1000, realizedGain = 0): Trade {
  return new Trade({
    AccountID: TEST_ACCOUNT_ID,
    TradeID: null,
    Symbol: symbol,
    LongTrade: long,
    WinningTrade: null,
    OpenDate: new Date(),
    CloseDate: null,
    DurationMS: null,
    Closed: false,
    OpenQuantity: qty,
    BreakEvenPrice: entry,
    CurrentPrice: null,
    TotalGain: null,
    TotalGainPct: null,
    LargestRisk: largestRisk,
    TotalFees: 0,
    TotalOrderCount: 1,
    RealizedGain: realizedGain
  });
}

describe('DataAccess.UpdateOpenTradesWithLatestQuotes (integration)', () => {

  describe('Long trades', () => {
    test('quote update: UnrealizedGain and TotalGain set from price', async () => {
      const trade = createTrade('LONGWIN', true, 10, 100, 1000);
      await DataAccess.TradeInsert(account, trade);
      
      await DataAccess.RefreshQuotes([createQuote('LONGWIN', 110)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      
      expect(updated).toBeDefined();
      const expectedUnrealized = RoundUtil.RoundForDB(10 * (110 - 100));
      const expectedTotalGain = RoundUtil.RoundForDB(10 * (110 - 100));
      expect(updated.UnrealizedGain).toBe(expectedUnrealized);
      expect(updated.TotalGain).toBe(expectedTotalGain);
      expect(updated.TotalGainPct).toBeCloseTo(Number(expectedTotalGain) / updated.LargestRisk!, 6);
      expect(updated.WinningTrade).toBe(true);
      expect(updated.CurrentPrice).toBe(110);
      expect(updated.CurrentCost).toBe(RoundUtil.RoundForDB(10 * 100));
      expect(updated.CurrentValue).toBe(RoundUtil.RoundForDB(10 * 110));
    });

    test('negative TotalGain when realized loss exceeds unrealized', async () => {
      const trade = createTrade('LONGLOSS', true, 10, 100, 1000, -2000);
      await DataAccess.TradeInsert(account, trade);
      
      await DataAccess.RefreshQuotes([createQuote('LONGLOSS', 90)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      
      expect(updated).toBeDefined();
      const expectedUnrealized = RoundUtil.RoundForDB(10 * (90 - 100));
      const expectedTotalGain = RoundUtil.RoundForDB(10 * (90 - 100) - 2000);
      expect(updated.UnrealizedGain).toBe(expectedUnrealized);
      expect(updated.TotalGain).toBe(expectedTotalGain);
      expect(updated.TotalGainPct).toBeCloseTo(Number(expectedTotalGain) / updated.LargestRisk!, 6);
      expect(updated.WinningTrade).toBe(false);
      expect(updated.CurrentPrice).toBe(90);
      expect(updated.CurrentCost).toBe(RoundUtil.RoundForDB(10 * 100));
      expect(updated.CurrentValue).toBe(RoundUtil.RoundForDB(10 * 90));
    });

    test('breakeven scenario: zero Gain, GainPct, WinningTrade=true', async () => {
      const trade = createTrade('LONGEVEN', true, 10, 100, 1000);
      await DataAccess.TradeInsert(account, trade);
      
      await DataAccess.RefreshQuotes([createQuote('LONGEVEN', 100)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      
      expect(updated).toBeDefined();
      const expectedUnrealized = RoundUtil.RoundForDB(10 * (100 - 100));
      const expectedTotalGain = RoundUtil.RoundForDB(10 * (100 - 100));
      expect(updated.UnrealizedGain).toBe(expectedUnrealized);
      expect(updated.TotalGain).toBe(expectedTotalGain);
      expect(updated.TotalGainPct).toBeCloseTo(Number(expectedTotalGain) / updated.LargestRisk!, 6);
      expect(updated.WinningTrade).toBe(true);
      expect(updated.CurrentPrice).toBe(100);
    });

    test('large profit: verify calculations scale correctly', async () => {
      const trade = createTrade('LONGBIG', true, 100, 50, 10000);
      await DataAccess.TradeInsert(account, trade);
      
      await DataAccess.RefreshQuotes([createQuote('LONGBIG', 75)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      
      expect(updated).toBeDefined();
      const expectedUnrealized = RoundUtil.RoundForDB(100 * (75 - 50));
      const expectedTotalGain = RoundUtil.RoundForDB(100 * (75 - 50));
      expect(updated.UnrealizedGain).toBe(expectedUnrealized);
      expect(updated.TotalGain).toBe(expectedTotalGain);
      expect(updated.TotalGainPct).toBeCloseTo(Number(expectedTotalGain) / 10000, 6);
      expect(updated.WinningTrade).toBe(true);
      expect(updated.CurrentValue).toBe(RoundUtil.RoundForDB(100 * 75));
    });

    test('TotalGain includes UnrealizedGain + RealizedGain', async () => {
      const trade = createTrade('LONGSUM', true, 10, 100, 2000, 250);
      await DataAccess.TradeInsert(account, trade);

      await DataAccess.RefreshQuotes([createQuote('LONGSUM', 120)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;

      const expectedUnrealized = RoundUtil.RoundForDB(10 * (120 - 100));
      const expectedTotalGain = RoundUtil.RoundForDB(10 * (120 - 100) + 250);

      expect(updated.UnrealizedGain).toBe(expectedUnrealized);
      expect(updated.RealizedGain).toBe(RoundUtil.RoundForDB(250));
      expect(updated.TotalGain).toBe(expectedTotalGain);
      expect(updated.TotalGainPct).toBeCloseTo(Number(expectedTotalGain) / 2000, 6);
      expect(updated.WinningTrade).toBe(true);
    });
  });

  describe('Short trades', () => {
    test('quote update: short trades use stored absolute quantity', async () => {
      const trade = createTrade('SHORTWIN', false, -10, 100, 1000);
      await DataAccess.TradeInsert(account, trade);
      
      await DataAccess.RefreshQuotes([createQuote('SHORTWIN', 90)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      
      expect(updated).toBeDefined();
      const expectedUnrealized = RoundUtil.RoundForDB(10 * (100 - 90));
      const expectedTotalGain = RoundUtil.RoundForDB(10 * (100 - 90));
      expect(updated.UnrealizedGain).toBe(expectedUnrealized);
      expect(updated.TotalGain).toBe(expectedTotalGain);
      expect(updated.TotalGainPct).toBeCloseTo(Number(expectedTotalGain) / updated.LargestRisk!, 6);
      expect(updated.WinningTrade).toBe(true);
      expect(updated.CurrentPrice).toBe(90);
      expect(updated.CurrentCost).toBe(RoundUtil.RoundForDB(10 * 100)); // Positive
      expect(updated.CurrentValue).toBe(RoundUtil.RoundForDB(10 * 90)); // Positive
    });

    test('negative TotalGain when realized loss exceeds unrealized', async () => {
      const trade = createTrade('SHORTLOSS', false, -10, 100, 1000, -2500);
      await DataAccess.TradeInsert(account, trade);
      
      await DataAccess.RefreshQuotes([createQuote('SHORTLOSS', 110)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      
      expect(updated).toBeDefined();
      const expectedUnrealized = RoundUtil.RoundForDB(10 * (100 - 110));
      const expectedTotalGain = RoundUtil.RoundForDB(10 * (100 - 110) - 2500);
      expect(updated.UnrealizedGain).toBe(expectedUnrealized);
      expect(updated.TotalGain).toBe(expectedTotalGain);
      expect(updated.TotalGainPct).toBeCloseTo(Number(expectedTotalGain) / updated.LargestRisk!, 6);
      expect(updated.WinningTrade).toBe(false);
      expect(updated.CurrentPrice).toBe(110);
      expect(updated.CurrentCost).toBe(RoundUtil.RoundForDB(10 * 100)); // Positive
      expect(updated.CurrentValue).toBe(RoundUtil.RoundForDB(10 * 110)); // Positive
    });

    test('breakeven scenario: zero Gain, GainPct, WinningTrade=true', async () => {
      const trade = createTrade('SHORTEVEN', false, -10, 100, 1000);
      await DataAccess.TradeInsert(account, trade);
      
      await DataAccess.RefreshQuotes([createQuote('SHORTEVEN', 100)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      
      expect(updated).toBeDefined();
      const expectedUnrealized = RoundUtil.RoundForDB(10 * (100 - 100));
      const expectedTotalGain = RoundUtil.RoundForDB(10 * (100 - 100));
      expect(updated.UnrealizedGain).toBe(expectedUnrealized);
      expect(updated.TotalGain).toBe(expectedTotalGain);
      expect(updated.TotalGainPct).toBeCloseTo(Number(expectedTotalGain) / updated.LargestRisk!, 6);
      expect(updated.WinningTrade).toBe(true);
      expect(updated.CurrentPrice).toBe(100);
    });

    test('large profit: verify calculations scale correctly', async () => {
      const trade = createTrade('SHORTBIG', false, -100, 150, 20000);
      await DataAccess.TradeInsert(account, trade);
      
      await DataAccess.RefreshQuotes([createQuote('SHORTBIG', 100)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      
      expect(updated).toBeDefined();
      const expectedUnrealized = RoundUtil.RoundForDB(100 * (150 - 100));
      const expectedTotalGain = RoundUtil.RoundForDB(100 * (150 - 100));
      expect(updated.UnrealizedGain).toBe(expectedUnrealized);
      expect(updated.TotalGain).toBe(expectedTotalGain);
      expect(updated.TotalGainPct).toBeCloseTo(Number(expectedTotalGain) / 20000, 6);
      expect(updated.WinningTrade).toBe(true);
      expect(updated.CurrentValue).toBe(RoundUtil.RoundForDB(100 * 100)); // Positive
    });
  });

  describe('Multiple quote updates', () => {
    test('incremental updates: gain updated correctly with sequential quotes', async () => {
      const trade = createTrade('INCREMENT', true, 10, 100, 1000);
      await DataAccess.TradeInsert(account, trade);

      await DataAccess.RefreshQuotes([createQuote('INCREMENT', 105, new Date(Date.now() - 60 * 60 * 1000))], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);
      
      let updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      const expectedUnrealized1 = RoundUtil.RoundForDB(10 * (105 - 100));
      expect(updated.UnrealizedGain).toBe(expectedUnrealized1);
      expect(updated.TotalGain).toBe(expectedUnrealized1);
      expect(updated.CurrentPrice).toBe(105);
      expect(updated.CurrentValue).toBe(RoundUtil.RoundForDB(10 * 105));

      await DataAccess.RefreshQuotes([createQuote('INCREMENT', 110, new Date())], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);
      
      updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      const expectedUnrealized2 = RoundUtil.RoundForDB(10 * (110 - 100));
      expect(updated.UnrealizedGain).toBe(expectedUnrealized2);
      expect(updated.TotalGain).toBe(expectedUnrealized2);
      expect(updated.CurrentPrice).toBe(110);
      expect(updated.CurrentValue).toBe(RoundUtil.RoundForDB(10 * 110));
    });

    test('price fluctuation: handles profit to loss transition', async () => {
      const trade = createTrade('FLUCTUATE', true, 10, 100, 1000);
      await DataAccess.TradeInsert(account, trade);

      await DataAccess.RefreshQuotes([createQuote('FLUCTUATE', 110)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);
      
      let updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      expect(updated.TotalGain).toBeGreaterThan(0);
      expect(updated.WinningTrade).toBe(true);

      await DataAccess.RefreshQuotes([createQuote('FLUCTUATE', 90)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);
      
      updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      expect(updated.TotalGain).toBeLessThan(0);
      expect(updated.WinningTrade).toBe(false);
    });
  });

  describe('Multiple trades', () => {
    test('updates all open trades independently', async () => {
      const trade1 = createTrade('MULTI1', true, 10, 100, 1000);
      const trade2 = createTrade('MULTI2', false, -5, 200, 1500);
      const trade3 = createTrade('MULTI3', true, 20, 50, 2000);
      
      await DataAccess.TradeInsert(account, trade1);
      await DataAccess.TradeInsert(account, trade2);
      await DataAccess.TradeInsert(account, trade3);

      await DataAccess.RefreshQuotes([
        createQuote('MULTI1', 110),
        createQuote('MULTI2', 190),
        createQuote('MULTI3', 55)
      ], account);
      
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const trades = await DataAccess.GetOpenTrades(account);
      
      const updated1 = trades.find(t => t.Symbol === 'MULTI1')!;
      const updated1Expected = RoundUtil.RoundForDB(10 * (110 - 100));
      expect(updated1.UnrealizedGain).toBe(updated1Expected);
      expect(updated1.TotalGain).toBe(updated1Expected);
      expect(updated1.WinningTrade).toBe(true);
      
      const updated2 = trades.find(t => t.Symbol === 'MULTI2')!;
      const updated2Expected = RoundUtil.RoundForDB(5 * (200 - 190));
      expect(updated2.UnrealizedGain).toBe(updated2Expected);
      expect(updated2.TotalGain).toBe(updated2Expected);
      expect(updated2.WinningTrade).toBe(true);
      
      const updated3 = trades.find(t => t.Symbol === 'MULTI3')!;
      const updated3Expected = RoundUtil.RoundForDB(20 * (55 - 50));
      expect(updated3.UnrealizedGain).toBe(updated3Expected);
      expect(updated3.TotalGain).toBe(updated3Expected);
      expect(updated3.WinningTrade).toBe(true);
    });

    test('handles missing quotes: trades without quotes set to null', async () => {
      const trade1 = createTrade('HASQUOTE', true, 10, 100, 1000);
      const trade2 = createTrade('NOQUOTE', true, 5, 200, 1500);
      
      await DataAccess.TradeInsert(account, trade1);
      await DataAccess.TradeInsert(account, trade2);

      await DataAccess.RefreshQuotes([createQuote('HASQUOTE', 110)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const trades = await DataAccess.GetOpenTrades(account);
      
      const withQuote = trades.find(t => t.Symbol === 'HASQUOTE')!;
      const withQuoteExpected = RoundUtil.RoundForDB(10 * (110 - 100));
      expect(withQuote.UnrealizedGain).toBe(withQuoteExpected);
      expect(withQuote.TotalGain).toBe(withQuoteExpected);
      expect(withQuote.CurrentPrice).toBe(110);
      expect(withQuote.WinningTrade).toBe(true);
      
      const withoutQuote = trades.find(t => t.Symbol === 'NOQUOTE')!;
      expect(withoutQuote.TotalGain).toBeNull();
      expect(withoutQuote.UnrealizedGain).toBeNull();
      expect(withoutQuote.CurrentPrice).toBeNull();
      expect(withoutQuote.WinningTrade).toBeNull();
    });
  });

  describe('Edge cases', () => {
    test('fractional shares: calculates gain correctly', async () => {
      const trade = createTrade('FRACTION', true, 10.5, 100.25, 1000);
      await DataAccess.TradeInsert(account, trade);
      
      await DataAccess.RefreshQuotes([createQuote('FRACTION', 105.75)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      
      expect(updated).toBeDefined();
      const expectedUnrealized = RoundUtil.RoundForDB(10.5 * (105.75 - 100.25));
      expect(updated.UnrealizedGain).toBe(expectedUnrealized);
      expect(updated.TotalGain).toBe(expectedUnrealized);
      expect(updated.WinningTrade).toBe(true);
    });

    test('small gain values: precision maintained', async () => {
      const trade = createTrade('SMALLGAIN', true, 1, 100, 1000);
      await DataAccess.TradeInsert(account, trade);
      
      await DataAccess.RefreshQuotes([createQuote('SMALLGAIN', 100.01)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      
      expect(updated).toBeDefined();
      const expectedUnrealized = RoundUtil.RoundForDB(1 * (100.01 - 100));
      expect(updated.UnrealizedGain).toBe(expectedUnrealized);
      expect(updated.TotalGain).toBe(expectedUnrealized);
      expect(updated.WinningTrade).toBe(true);
    });

    test('no quotes in database: all fields set to null', async () => {
      const trade = createTrade('NOQUOTES', true, 10, 100, 1000);
      await DataAccess.TradeInsert(account, trade);
      
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      
      expect(updated).toBeDefined();
      expect(updated.TotalGain).toBeNull();
      expect(updated.UnrealizedGain).toBeNull();
      expect(updated.TotalGainPct).toBeNull();
      expect(updated.WinningTrade).toBeNull();
      expect(updated.CurrentPrice).toBeNull();
    });

    test('closed trades: not affected by quote updates', async () => {
      const closedTrade = new Trade({
        AccountID: TEST_ACCOUNT_ID,
        TradeID: null,
        Symbol: 'CLOSED',
        LongTrade: true,
        WinningTrade: true,
        OpenDate: new Date(),
        CloseDate: new Date(),
        DurationMS: BigInt(1000),
        Closed: true,
        OpenQuantity: 0,
        BreakEvenPrice: 100,
        CurrentPrice: 110,
        TotalGain: 100,
        TotalGainPct: 0.1,
        LargestRisk: 1000,
        TotalFees: 10,
        TotalOrderCount: 2
      });
      
      await DataAccess.TradeInsert(account, closedTrade);
      
      await DataAccess.RefreshQuotes([createQuote('CLOSED', 150)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const openTrades = await DataAccess.GetOpenTrades(account);
      expect(openTrades.find(t => t.Symbol === 'CLOSED')).toBeUndefined();
    });
  });

  describe('GainPct calculations', () => {
    test('GainPct calculated as TotalGain / LargestRisk', async () => {
      const trade = createTrade('GAINPCT', true, 10, 100, 5000);
      await DataAccess.TradeInsert(account, trade);
      
      await DataAccess.RefreshQuotes([createQuote('GAINPCT', 125)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      
      const expectedTotalGain = RoundUtil.RoundForDB(10 * (125 - 100));
      const expectedGainPct = Number(expectedTotalGain) / 5000;
      
      expect(updated.UnrealizedGain).toBe(expectedTotalGain);
      expect(updated.TotalGain).toBe(expectedTotalGain);
      expect(updated.TotalGainPct).toBeCloseTo(expectedGainPct, 6);
    });

    test('negative GainPct for losses', async () => {
      const trade = createTrade('NEGPCT', true, 10, 100, 2000, -3000);
      await DataAccess.TradeInsert(account, trade);
      
      await DataAccess.RefreshQuotes([createQuote('NEGPCT', 80)], account);
      await DataAccess.UpdateOpenTradesWithLatestQuotes(account);

      const updated = (await DataAccess.GetOpenTrades(account)).find(t => t.TradeID === trade.TradeID)!;
      
      const expectedTotalGain = RoundUtil.RoundForDB(10 * (80 - 100) - 3000);
      const expectedGainPct = Number(expectedTotalGain) / 2000;
      
      expect(updated.UnrealizedGain).toBe(RoundUtil.RoundForDB(10 * (80 - 100)));
      expect(updated.TotalGain).toBe(expectedTotalGain);
      expect(updated.TotalGainPct).toBeLessThan(0);
      expect(updated.TotalGainPct).toBeCloseTo(expectedGainPct, 6);
    });
  });
});
