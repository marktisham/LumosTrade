

import { Trade } from '../interfaces/Trade';
import { Order } from '../interfaces/Order';
import { Quote } from '../interfaces/Quote';
import { OrderActionBuy, OrderActionSell, OrderActionSellShort, OrderActionBuyToCover } from '../interfaces/OrderAction';

const AAPL_SYMBOL = 'AAPL';
const MOCK_ACCOUNT_ID = 42;
const mockAccount = () => ({ AccountID: MOCK_ACCOUNT_ID } as any);
const mockQuote = (price: number) => new Quote(0, MOCK_ACCOUNT_ID, AAPL_SYMBOL, price, new Date());

describe('Trade.CreateFromOpenOrders', () => {

  it('should handle an open trade with 1 order, no quote (long)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(1);
    expect(trade.LongTrade).toBe(true);
    expect(trade.TotalFees).toBe(10);
    expect(trade.LargestRisk).toBe(100);
    expect(trade.OpenQuantity).toBe(10);
    expect(trade.BreakEvenPrice).toBe(10);
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.TotalGain).toBeNull();
    expect(trade.TotalGainPct).toBeNull();
    expect(trade.WinningTrade).toBeNull();
    expect(trade.AvgEntryPrice).toBe(10);
    expect(trade.AvgExitPrice).toBeNull();
    expect(trade.RealizedGain).toBe(0);
    expect(trade.UnrealizedGain).toBeNull();
  });

  it('should handle an open trade with 1 order, no quote (short)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(1);
    expect(trade.LongTrade).toBe(false);
    expect(trade.TotalFees).toBe(10);
    expect(trade.LargestRisk).toBe(100);
    expect(trade.OpenQuantity).toBe(-10);
    expect(trade.BreakEvenPrice).toBe(10);
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.TotalGain).toBeNull();
    expect(trade.TotalGainPct).toBeNull();
    expect(trade.WinningTrade).toBeNull();
    expect(trade.AvgEntryPrice).toBe(10);
    expect(trade.AvgExitPrice).toBeNull();
    expect(trade.RealizedGain).toBe(0);
    expect(trade.UnrealizedGain).toBeNull();
  });

  it('should handle an open trade with 2 orders, no quote (long)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:01:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 5,
        /* ExecutedPrice */ 20,
        /* OrderAmount */ 100,
        /* Fees */ 10
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(true);
    expect(trade.TotalFees).toBe(20);
    expect(trade.LargestRisk).toBe(200);
    expect(trade.OpenQuantity).toBe(15);
    expect(trade.BreakEvenPrice).toBe(13.3333);
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.TotalGain).toBeNull();
    expect(trade.TotalGainPct).toBeNull();
    expect(trade.WinningTrade).toBeNull();
    expect(trade.AvgEntryPrice).toBeCloseTo(13.3333, 4);
    expect(trade.AvgExitPrice).toBeNull();
    expect(trade.RealizedGain).toBe(0);
    expect(trade.UnrealizedGain).toBeNull();
  });

  it('should handle an open trade with 2 orders, no quote (short)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:01:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 5,
        /* ExecutedPrice */ 20,
        /* OrderAmount */ 100,
        /* Fees */ 10
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(false);
    expect(trade.TotalFees).toBe(20);
    expect(trade.LargestRisk).toBe(200);
    expect(trade.OpenQuantity).toBe(-15);
    expect(trade.BreakEvenPrice).toBe(13.3333);
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.TotalGain).toBeNull();
    expect(trade.TotalGainPct).toBeNull();
    expect(trade.WinningTrade).toBeNull();
    expect(trade.AvgEntryPrice).toBeCloseTo(13.3333, 4);
    expect(trade.AvgExitPrice).toBeNull();
    expect(trade.RealizedGain).toBe(0);
    expect(trade.UnrealizedGain).toBeNull();
  });

  it('should handle an open trade with 1 order, with quote/winner (long)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(15));
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(1);
    expect(trade.LongTrade).toBe(true);
    expect(trade.TotalFees).toBe(10);
    expect(trade.LargestRisk).toBe(100);
    expect(trade.OpenQuantity).toBe(10);
    expect(trade.BreakEvenPrice).toBe(10);
    expect(trade.CurrentPrice).toBe(15);
    expect(trade.TotalGain).toBe(50);
    expect(trade.TotalGainPct).toBe(0.5);
    expect(trade.WinningTrade).toBe(true);
    expect(trade.AvgEntryPrice).toBe(10);
    expect(trade.AvgExitPrice).toBeNull();
    expect(trade.RealizedGain).toBe(0);
    expect(trade.UnrealizedGain).toBe(50);
  });

  it('should handle an open trade with 1 order, with quote/winner (short)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 20,
        /* OrderAmount */ 200,
        /* Fees */ 10
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(10));
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(1);
    expect(trade.LongTrade).toBe(false);
    expect(trade.TotalFees).toBe(10);
    expect(trade.LargestRisk).toBe(200);
    expect(trade.OpenQuantity).toBe(-10);
    expect(trade.BreakEvenPrice).toBe(20);
    expect(trade.CurrentPrice).toBe(10);
    expect(trade.TotalGain).toBe(100);
    expect(trade.TotalGainPct).toBe(0.5);
    expect(trade.WinningTrade).toBe(true);
    expect(trade.AvgEntryPrice).toBe(20);
    expect(trade.AvgExitPrice).toBeNull();
    expect(trade.RealizedGain).toBe(0);
    expect(trade.UnrealizedGain).toBe(100);
  });

  it('should handle an open trade with 1 orders, with quote/loser (long)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(5));
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(1);
    expect(trade.LongTrade).toBe(true);
    expect(trade.TotalFees).toBe(10);
    expect(trade.LargestRisk).toBe(100);
    expect(trade.OpenQuantity).toBe(10);
    expect(trade.BreakEvenPrice).toBe(10);
    expect(trade.CurrentPrice).toBe(5);
    expect(trade.TotalGain).toBe(-50);
    expect(trade.TotalGainPct).toBe(-0.5);
    expect(trade.WinningTrade).toBe(false);
    expect(trade.AvgEntryPrice).toBe(10);
    expect(trade.AvgExitPrice).toBeNull();
    expect(trade.RealizedGain).toBe(0);
    expect(trade.UnrealizedGain).toBe(-50);
  });

  it('should handle an open trade with 1 orders, with quote/loser (short)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 20,
        /* OrderAmount */ 200,
        /* Fees */ 10
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(30));
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(1);
    expect(trade.LongTrade).toBe(false);
    expect(trade.TotalFees).toBe(10);
    expect(trade.LargestRisk).toBe(200);
    expect(trade.OpenQuantity).toBe(-10);
    expect(trade.BreakEvenPrice).toBe(20);
    expect(trade.CurrentPrice).toBe(30);
    expect(trade.TotalGain).toBe(-100);
    expect(trade.TotalGainPct).toBe(-0.5);
    expect(trade.WinningTrade).toBe(false);
    expect(trade.AvgEntryPrice).toBe(20);
    expect(trade.AvgExitPrice).toBeNull();
    expect(trade.RealizedGain).toBe(0);
    expect(trade.UnrealizedGain).toBe(-100);
  });

  it('should handle an open trade with 2 orders, 1 buy and 1 sell. No quote. (long)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:01:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 5,
        /* ExecutedPrice */ 15,
        /* OrderAmount */ 75,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(true);
    expect(trade.TotalFees).toBe(15);
    expect(trade.LargestRisk).toBe(100);
    expect(trade.OpenQuantity).toBe(5);
    expect(trade.BreakEvenPrice).toBe(5);
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.TotalGain).toBeNull();
    expect(trade.TotalGainPct).toBeNull();
    expect(trade.WinningTrade).toBeNull();
    expect(trade.AvgEntryPrice).toBe(10);
    expect(trade.AvgExitPrice).toBe(15);
    expect(trade.RealizedGain).toBe(25);
    expect(trade.UnrealizedGain).toBeNull();
  });

  it('should handle an open trade with 2 orders, 1 short and 1 cover. No quote. (short)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:01:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 5,
        /* ExecutedPrice */ 5,
        /* OrderAmount */ 25,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(false);
    expect(trade.TotalFees).toBe(15);
    expect(trade.LargestRisk).toBe(100);
    expect(trade.OpenQuantity).toBe(-5);
    expect(trade.BreakEvenPrice).toBe(15);
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.TotalGain).toBeNull();
    expect(trade.TotalGainPct).toBeNull();
    expect(trade.WinningTrade).toBeNull();
    expect(trade.AvgEntryPrice).toBe(10);
    expect(trade.AvgExitPrice).toBe(5);
    expect(trade.RealizedGain).toBe(25);
    expect(trade.UnrealizedGain).toBeNull();
  });

  it('should handle an open trade with 2 orders, 1 buy and 1 sell. "house money" entry. No quote. (long)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:01:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 5,
        /* ExecutedPrice */ 50,
        /* OrderAmount */ 250,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(true);
    expect(trade.TotalFees).toBe(15);
    expect(trade.LargestRisk).toBe(100);
    expect(trade.OpenQuantity).toBe(5);
    expect(trade.BreakEvenPrice).toBe(0);
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.TotalGain).toBeNull();
    expect(trade.TotalGainPct).toBeNull();
    expect(trade.WinningTrade).toBeNull();
  });

  it('should handle an open trade with 2 orders, 1 short and 1 cover. Large gain, but no house money for shorts. No quote. (short)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 50,
        /* OrderAmount */ 500,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:01:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 9,
        /* ExecutedPrice */ 1,
        /* OrderAmount */ 9,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(false);
    expect(trade.TotalFees).toBe(15);
    expect(trade.LargestRisk).toBe(500);
    expect(trade.OpenQuantity).toBe(-1);
    expect(trade.BreakEvenPrice).toBe(491);
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.TotalGain).toBeNull();
    expect(trade.TotalGainPct).toBeNull();
    expect(trade.WinningTrade).toBeNull();
  });

  it('should handle an open trade with 2 orders, 1 buy and 1 sell. With quote. (long)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:01:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 5,
        /* ExecutedPrice */ 15,
        /* OrderAmount */ 75,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(20));
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(true);
    expect(trade.TotalFees).toBe(15);
    expect(trade.LargestRisk).toBe(100);
    expect(trade.OpenQuantity).toBe(5);
    expect(trade.BreakEvenPrice).toBe(5);
    expect(trade.CurrentPrice).toBe(20);
    expect(trade.TotalGain).toBe(75);
    expect(trade.TotalGainPct).toBe(0.75);
    expect(trade.WinningTrade).toBe(true);
    expect(trade.AvgEntryPrice).toBe(10);
    expect(trade.AvgExitPrice).toBe(15);
    expect(trade.RealizedGain).toBe(25);
    expect(trade.UnrealizedGain).toBe(50);
  });

  // Additional long/short multi-order tests with quotes (all 4 scenarios)
  it('should handle an open trade with 2 buys and a high quote (long - winner)', () => {
    const orders = [
      new Order(/* BrokerOrderID */ 1, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-01-06T10:00:00Z'), /* Action */ new OrderActionBuy(), /* Quantity */ 10, /* ExecutedPrice */ 10, /* OrderAmount */ 100, /* Fees */ 2),
      new Order(/* BrokerOrderID */ 2, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-01-06T10:05:00Z'), /* Action */ new OrderActionBuy(), /* Quantity */ 5, /* ExecutedPrice */ 20, /* OrderAmount */ 100, /* Fees */ 3)
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(20));
    // Expected: initial gain = -200, OpenQuantity = 15 => gain = -200 + 15*20 = 100
    expect(trade.TotalGain).toBe(100);
    expect(trade.WinningTrade).toBe(true);
    expect(trade.TotalGainPct).toBeCloseTo(0.5, 6);
    expect(trade.AvgEntryPrice).toBeCloseTo(13.3333, 4);
    expect(trade.AvgExitPrice).toBeNull();
    expect(trade.RealizedGain).toBe(0);
    expect(trade.UnrealizedGain).toBeCloseTo(100, 4);
  });

  it('should handle an open trade with 2 buys and a low quote (long - loser)', () => {
    const orders = [
      new Order(/* BrokerOrderID */ 1, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-01-07T10:00:00Z'), /* Action */ new OrderActionBuy(), /* Quantity */ 10, /* ExecutedPrice */ 10, /* OrderAmount */ 100, /* Fees */ 2),
      new Order(/* BrokerOrderID */ 2, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-01-07T10:05:00Z'), /* Action */ new OrderActionBuy(), /* Quantity */ 5, /* ExecutedPrice */ 20, /* OrderAmount */ 100, /* Fees */ 3)
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(5));
    // Expected: initial gain = -200, OpenQuantity = 15 => gain = -200 + 15*5 = -125
    expect(trade.TotalGain).toBe(-125);
    expect(trade.WinningTrade).toBe(false);
    expect(trade.TotalGainPct).toBeCloseTo(-0.625, 6);
    expect(trade.AvgEntryPrice).toBeCloseTo(13.3333, 4);
    expect(trade.AvgExitPrice).toBeNull();
    expect(trade.RealizedGain).toBe(0);
    expect(trade.UnrealizedGain).toBeCloseTo(-125, 4);
  });

  it('should handle an open trade with 2 shorts and a low quote (short - winner)', () => {
    const orders = [
      new Order(/* BrokerOrderID */ 1, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-01-08T10:00:00Z'), /* Action */ new OrderActionSellShort(), /* Quantity */ 10, /* ExecutedPrice */ 20, /* OrderAmount */ 200, /* Fees */ 2),
      new Order(/* BrokerOrderID */ 2, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-01-08T10:05:00Z'), /* Action */ new OrderActionSellShort(), /* Quantity */ 5, /* ExecutedPrice */ 15, /* OrderAmount */ 75, /* Fees */ 3)
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(10));
    // Expected: initial gain = +275, OpenQuantity = -15 => gain = 275 + (-15*10) = 125
    expect(trade.TotalGain).toBe(125);
    expect(trade.WinningTrade).toBe(true);
    expect(trade.TotalGainPct).toBeCloseTo(125 / 275, 4);
    expect(trade.AvgEntryPrice).toBeCloseTo(18.3333, 4);
    expect(trade.AvgExitPrice).toBeNull();
    expect(trade.RealizedGain).toBe(0);
    expect(trade.UnrealizedGain).toBeCloseTo(125, 4);
  });

  it('should handle an open trade with 2 shorts and a high quote (short - loser)', () => {
    const orders = [
      new Order(/* BrokerOrderID */ 1, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-01-09T10:00:00Z'), /* Action */ new OrderActionSellShort(), /* Quantity */ 10, /* ExecutedPrice */ 20, /* OrderAmount */ 200, /* Fees */ 2),
      new Order(/* BrokerOrderID */ 2, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-01-09T10:05:00Z'), /* Action */ new OrderActionSellShort(), /* Quantity */ 5, /* ExecutedPrice */ 15, /* OrderAmount */ 75, /* Fees */ 3)
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(40));
    // Expected: initial gain = +275, OpenQuantity = -15 => gain = 275 + (-15*40) = -325
    expect(trade.TotalGain).toBe(-325);
    expect(trade.WinningTrade).toBe(false);
    expect(trade.TotalGainPct).toBeCloseTo(-325 / 275, 4);
    expect(trade.AvgEntryPrice).toBeCloseTo(18.3333, 4);
    expect(trade.AvgExitPrice).toBeNull();
    expect(trade.RealizedGain).toBe(0);
    expect(trade.UnrealizedGain).toBe(-325);
  });

  it('should handle an open trade with 2 orders, 1 short and 1 cover. With quote. (short)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:01:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 5,
        /* ExecutedPrice */ 5,
        /* OrderAmount */ 25,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(7));
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(false);
    expect(trade.TotalFees).toBe(15);
    expect(trade.LargestRisk).toBe(100);
    expect(trade.OpenQuantity).toBe(-5);
    expect(trade.BreakEvenPrice).toBe(15);
    expect(trade.CurrentPrice).toBe(7);
    expect(trade.TotalGain).toBe(40);
    expect(trade.TotalGainPct).toBe(0.4);
    expect(trade.WinningTrade).toBe(true);
    expect(trade.AvgEntryPrice).toBe(10);
    expect(trade.AvgExitPrice).toBe(5);
    expect(trade.RealizedGain).toBe(25);
    expect(trade.UnrealizedGain).toBe(15);
  });

  it('should handle an open trade with 2 orders, 1 buy and 1 sell. "house money" entry. With quote. (long)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:01:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 5,
        /* ExecutedPrice */ 50,
        /* OrderAmount */ 250,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(45));
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(true);
    expect(trade.TotalFees).toBe(15);
    expect(trade.LargestRisk).toBe(100);
    expect(trade.OpenQuantity).toBe(5);
    expect(trade.BreakEvenPrice).toBe(0);
    expect(trade.CurrentPrice).toBe(45);
    expect(trade.TotalGain).toBe(375);
    expect(trade.TotalGainPct).toBe(3.75);
    expect(trade.WinningTrade).toBe(true);
    expect(trade.AvgEntryPrice).toBe(10);
    expect(trade.AvgExitPrice).toBe(50);
    expect(trade.RealizedGain).toBe(200);
    expect(trade.UnrealizedGain).toBe(175);
  });

  it('should handle an open trade with 2 orders, 1 short and 1 cover. Large gain, but no house money for shorts. With quote. (short)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 50,
        /* OrderAmount */ 500,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:01:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 9,
        /* ExecutedPrice */ 1,
        /* OrderAmount */ 9,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(5));
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(false);
    expect(trade.TotalFees).toBe(15);
    expect(trade.LargestRisk).toBe(500);
    expect(trade.OpenQuantity).toBe(-1);
    expect(trade.BreakEvenPrice).toBe(491);
    expect(trade.CurrentPrice).toBe(5);
    expect(trade.TotalGain).toBe(486);
    expect(trade.TotalGainPct).toBe(0.972);
    expect(trade.WinningTrade).toBe(true);
    expect(trade.AvgEntryPrice).toBe(50);
    expect(trade.AvgExitPrice).toBe(1);
    expect(trade.RealizedGain).toBe(441);
    expect(trade.UnrealizedGain).toBe(45);
  });

  it('should handle an open trade with 3 orders, loser. With quote. (long)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 20,
        /* OrderAmount */ 200,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:01:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 5,
        /* ExecutedPrice */ 15,
        /* OrderAmount */ 75,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:02:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 5,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 50,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(2.50));
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(3);
    expect(trade.LongTrade).toBe(true);
    expect(trade.TotalFees).toBe(20);
    expect(trade.LargestRisk).toBe(200);
    expect(trade.OpenQuantity).toBe(10);
    expect(trade.BreakEvenPrice).toBe(17.5);
    expect(trade.CurrentPrice).toBe(2.5);
    expect(trade.TotalGain).toBe(-150);
    expect(trade.TotalGainPct).toBe(-0.75);
    expect(trade.WinningTrade).toBe(false);
    expect(trade.AvgEntryPrice).toBeCloseTo(16.6667, 4);
    expect(trade.AvgExitPrice).toBe(15);
    expect(trade.RealizedGain).toBeCloseTo(-8.3333, 4);
    expect(trade.UnrealizedGain).toBeCloseTo(-141.6667, 4);
  });

  it('should handle an open trade with 3 orders, loser. With quote. (short)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 20,
        /* OrderAmount */ 200,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:01:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 5,
        /* ExecutedPrice */ 25,
        /* OrderAmount */ 125,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:02:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 5,
        /* ExecutedPrice */ 15,
        /* OrderAmount */ 75,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(40));
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toBeNull();  
    expect(trade.Closed).toBe(false);
    expect(trade.DurationMS).toBeNull();
    expect(trade.TotalOrderCount).toBe(3);
    expect(trade.LongTrade).toBe(false);
    expect(trade.TotalFees).toBe(20);
    expect(trade.LargestRisk).toBe(200);
    expect(trade.OpenQuantity).toBe(-10);
    expect(trade.BreakEvenPrice).toBe(15);
    expect(trade.CurrentPrice).toBe(40);
    expect(trade.TotalGain).toBe(-250);
    expect(trade.TotalGainPct).toBe(-1.25);
    expect(trade.WinningTrade).toBe(false);
    expect(trade.AvgEntryPrice).toBeCloseTo(18.3333, 4);
    expect(trade.AvgExitPrice).toBe(25);
    expect(trade.RealizedGain).toBeCloseTo(-33.3333, 4);
    expect(trade.UnrealizedGain).toBeCloseTo(-216.6667, 4);
  });

  it('should not allow an open trade to start with a sell', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      )
    ];
    expect(() => Trade.CreateOpenTradeFromOrders(orders, mockAccount(),null)).toThrow();
  });

  it('should not allow an open trade to start with a buy to cover', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      )
    ];
    expect(() => Trade.CreateOpenTradeFromOrders(orders, mockAccount(),null)).toThrow();
  });

  it('should not allow an open long trade to go negative on quantity', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      ),
        new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:01:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 20,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 200,
        /* Fees */ 10
      )
    ];
    expect(() => Trade.CreateOpenTradeFromOrders(orders, mockAccount(),null)).toThrow();
  });

  it('should not allow an open short trade to go positiove on quantity', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 10,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 100,
        /* Fees */ 10
      ),
        new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:01:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 20,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 200,
        /* Fees */ 10
      )
    ];
    expect(() => Trade.CreateOpenTradeFromOrders(orders, mockAccount(),null)).toThrow();
  });

  it('should calculate new fields correctly for a simple open long trade with quote', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 50,
        /* OrderAmount */ 5000,
        /* Fees */ 10
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), { Symbol: AAPL_SYMBOL, Price: 60 } as any);
    
    // New field validations
    expect(trade.AvgEntryPrice).toBe(50);
    expect(trade.AvgExitPrice).toBeNull(); // No exits yet
    expect(trade.RealizedGain).toBe(0); // No realized gain without exits
    expect(trade.UnrealizedGain).toBe(1000); // 100 * (60 - 50) * 1
    expect(trade.TotalGain).toBe(1000); // 0 + 1000
    expect(trade.OpenQuantity).toBe(100);
  });

  it('should calculate new fields correctly for a simple open short trade with quote', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 100,
        /* OrderAmount */ 5000,
        /* Fees */ 10
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), { Symbol: AAPL_SYMBOL, Price: 80 } as any);
    
    // New field validations
    expect(trade.AvgEntryPrice).toBe(100);
    expect(trade.AvgExitPrice).toBeNull(); // No exits yet
    expect(trade.RealizedGain).toBe(0); // No realized gain without exits
    expect(trade.UnrealizedGain).toBe(1000); // 50 * (80 - 100) * -1 = 1000
    expect(trade.TotalGain).toBe(1000); // 0 + 1000
    expect(trade.OpenQuantity).toBe(-50);
  });

  it('should calculate new fields correctly for a partially closed long trade with quote', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 20,
        /* OrderAmount */ 2000,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 30,
        /* ExecutedPrice */ 25,
        /* OrderAmount */ 750,
        /* Fees */ 3
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), { Symbol: AAPL_SYMBOL, Price: 30 } as any);
    
    // New field validations
    expect(trade.AvgEntryPrice).toBe(20);
    expect(trade.AvgExitPrice).toBe(25);
    expect(trade.RealizedGain).toBe(150); // 30 * (25 - 20) * 1
    expect(trade.UnrealizedGain).toBe(700); // 70 * (30 - 20) * 1
    expect(trade.TotalGain).toBe(850); // 150 + 700
    expect(trade.OpenQuantity).toBe(70);
  });

  it('should calculate new fields correctly for a partially closed short trade with quote', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 50,
        /* OrderAmount */ 5000,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 40,
        /* ExecutedPrice */ 45,
        /* OrderAmount */ 1800,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), { Symbol: AAPL_SYMBOL, Price: 40 } as any);
    
    // New field validations
    expect(trade.AvgEntryPrice).toBe(50);
    expect(trade.AvgExitPrice).toBe(45);
    expect(trade.RealizedGain).toBe(200); // 40 * (45 - 50) * -1 = 200
    expect(trade.UnrealizedGain).toBe(600); // 60 * (40 - 50) * -1 = 600
    expect(trade.TotalGain).toBe(800); // 200 + 600
    expect(trade.OpenQuantity).toBe(-60);
  });

  it('should calculate new fields correctly for an open trade without quote', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 100,
        /* OrderAmount */ 5000,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 20,
        /* ExecutedPrice */ 110,
        /* OrderAmount */ 2200,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), null);
    
    // New field validations
    expect(trade.AvgEntryPrice).toBe(100);
    expect(trade.AvgExitPrice).toBe(110);
    expect(trade.RealizedGain).toBe(200); // 20 * (110 - 100) * 1
    expect(trade.UnrealizedGain).toBeNull(); // No quote provided
    expect(trade.TotalGain).toBeNull(); // No quote = no total gain for open trade
    expect(trade.OpenQuantity).toBe(30);
  });

  it('should calculate new fields correctly for multiple entries and exits (averaging)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 100,
        /* OrderAmount */ 5000,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:30:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 120,
        /* OrderAmount */ 6000,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 3,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 30,
        /* ExecutedPrice */ 115,
        /* OrderAmount */ 3450,
        /* Fees */ 3
      ),
      new Order(
        /* BrokerOrderID */ 4,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T12:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 20,
        /* ExecutedPrice */ 125,
        /* OrderAmount */ 2500,
        /* Fees */ 2
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), { Symbol: AAPL_SYMBOL, Price: 130 } as any);
    
    // New field validations
    // AvgEntryPrice = (50*100 + 50*120) / 100 = 11000 / 100 = 110
    expect(trade.AvgEntryPrice).toBe(110);
    // AvgExitPrice = (30*115 + 20*125) / 50 = (3450 + 2500) / 50 = 5950 / 50 = 119
    expect(trade.AvgExitPrice).toBe(119);
    // RealizedGain = 50 * (119 - 110) * 1 = 450
    expect(trade.RealizedGain).toBe(450);
    // UnrealizedGain = 50 * (130 - 110) * 1 = 1000
    expect(trade.UnrealizedGain).toBe(1000);
    // TotalGain = 450 + 1000 = 1450
    expect(trade.TotalGain).toBe(1450);
    expect(trade.OpenQuantity).toBe(50);
  });

  it('should demonstrate AvgEntryPrice != BreakEvenPrice due to partial exit changing cost basis (long)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 100,
        /* OrderAmount */ 10000,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:30:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 110,
        /* OrderAmount */ 5500,
        /* Fees */ 10
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(115));
    // AvgEntryPrice is the weighted average of entry prices
    expect(trade.AvgEntryPrice).toBe(100);
    // After selling 50 shares, tradeCost = (10000 - 5500) = 4500 for remaining 50 shares
    // BreakEvenPrice = 4500 / 50 = 90 (lower due to profitable partial exit)
    expect(trade.BreakEvenPrice).toBe(90);
    expect(trade.CurrentPrice).toBe(115);
    expect(trade.OpenQuantity).toBe(50);
  });

  it('should demonstrate AvgEntryPrice != BreakEvenPrice due to partial cover changing cost basis (short)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 200,
        /* OrderAmount */ 20000,
        /* Fees */ 100
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 190,
        /* OrderAmount */ 9500,
        /* Fees */ 50
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(185));
    expect(trade.AvgEntryPrice).toBe(200);
    // After covering 50 shares, tradeCost = (20000 - 9500) = 10500 for remaining 50 shares
    // BreakEvenPrice = 10500 / 50 = 210
    expect(trade.BreakEvenPrice).toBe(210);
    expect(trade.CurrentPrice).toBe(185);
    expect(trade.OpenQuantity).toBe(-50);
  });

  it('should correctly calculate all fields for complex multi-leg long trade', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 80,
        /* OrderAmount */ 4000,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:30:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 90,
        /* OrderAmount */ 9000,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 3,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 75,
        /* ExecutedPrice */ 100,
        /* OrderAmount */ 7500,
        /* Fees */ 8
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(105));
    // AvgEntryPrice = (50*80 + 100*90) / 150 = 86.6667
    expect(trade.AvgEntryPrice).toBeCloseTo(86.6667, 4);
    // AvgExitPrice = 100 (only one exit)
    expect(trade.AvgExitPrice).toBe(100);
    // RealizedGain = 75 * (100 - 86.6667) = 1000
    expect(trade.RealizedGain).toBeCloseTo(1000, 0);
    // UnrealizedGain = 75 * (105 - 86.6667) = 1375
    expect(trade.UnrealizedGain).toBeCloseTo(1375, 0);
    // TotalGain = 1000 + 1375 = 2375
    expect(trade.TotalGain).toBeCloseTo(2375, 0);
    expect(trade.OpenQuantity).toBe(75);
    expect(trade.Closed).toBe(false);
  });

  it('should correctly calculate all fields for complex multi-leg short trade', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 150,
        /* OrderAmount */ 15000,
        /* Fees */ 15
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:30:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 160,
        /* OrderAmount */ 8000,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 3,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 80,
        /* ExecutedPrice */ 145,
        /* OrderAmount */ 11600,
        /* Fees */ 12
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(140));
    // AvgEntryPrice = (100*150 + 50*160) / 150 = 153.3333
    expect(trade.AvgEntryPrice).toBeCloseTo(153.3333, 4);
    // AvgExitPrice = 145 (only one cover)
    expect(trade.AvgExitPrice).toBe(145);
    // RealizedGain = 80 * (145 - 153.3333) * -1 = 666.67
    expect(trade.RealizedGain).toBeCloseTo(666.67, 1);
    // UnrealizedGain = 70 * (140 - 153.3333) * -1 = 933.33
    expect(trade.UnrealizedGain).toBeCloseTo(933.33, 1);
    // TotalGain = 666.67 + 933.33 = 1600
    expect(trade.TotalGain).toBeCloseTo(1600, 0);
    expect(trade.OpenQuantity).toBe(-70);
    expect(trade.Closed).toBe(false);
  });

  it('should handle simple open long with no quote and verify null values', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 50,
        /* OrderAmount */ 5000,
        /* Fees */ 10
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AvgEntryPrice).toBe(50);
    expect(trade.AvgExitPrice).toBeNull(); // No exits
    expect(trade.RealizedGain).toBe(0); // No realized gain
    expect(trade.UnrealizedGain).toBeNull(); // No quote
    expect(trade.TotalGain).toBeNull(); // No quote
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.OpenQuantity).toBe(100);
  });

  it('should calculate new fields correctly for a partially closed long trade', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 20,
        /* OrderAmount */ 2000,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 60,
        /* ExecutedPrice */ 25,
        /* OrderAmount */ 1500,
        /* Fees */ 3
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AvgEntryPrice).toBe(20);
    expect(trade.AvgExitPrice).toBe(25);
    expect(trade.RealizedGain).toBe(300); // 60 * (25 - 20) * 1
    expect(trade.UnrealizedGain).toBeNull(); // No quote provided
    expect(trade.TotalGain).toBeNull(); // Open trade without quote
    expect(trade.OpenQuantity).toBe(40);
  });

  it('should calculate new fields correctly for an open long trade with quote', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 20,
        /* OrderAmount */ 2000,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 60,
        /* ExecutedPrice */ 25,
        /* OrderAmount */ 1500,
        /* Fees */ 3
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), { Symbol: AAPL_SYMBOL, Price: 30 } as any);
    expect(trade.AvgEntryPrice).toBe(20);
    expect(trade.AvgExitPrice).toBe(25);
    expect(trade.RealizedGain).toBe(300); // 60 * (25 - 20) * 1
    expect(trade.UnrealizedGain).toBe(400); // 40 * (30 - 20) * 1
    expect(trade.TotalGain).toBe(700); // 300 + 400
    expect(trade.OpenQuantity).toBe(40);
    expect(trade.CurrentPrice).toBe(30);
  });

  it('should calculate new fields correctly for an open short trade with quote', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 50,
        /* OrderAmount */ 5000,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 40,
        /* ExecutedPrice */ 45,
        /* OrderAmount */ 1800,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), { Symbol: AAPL_SYMBOL, Price: 40 } as any);
    expect(trade.AvgEntryPrice).toBe(50);
    expect(trade.AvgExitPrice).toBe(45);
    expect(trade.RealizedGain).toBe(200); // 40 * (45 - 50) * -1 = 200
    expect(trade.UnrealizedGain).toBe(600); // 60 * (40 - 50) * -1 = 600
    expect(trade.TotalGain).toBe(800); // 200 + 600
    expect(trade.OpenQuantity).toBe(-60);
    expect(trade.CurrentPrice).toBe(40);
  });

  // Moved tests from closed suite
  it('should correctly calculate when RealizedGain != TotalGain for multiple entries/exits (long)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 50,
        /* OrderAmount */ 5000,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:30:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 60,
        /* OrderAmount */ 6000,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 3,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 70,
        /* OrderAmount */ 7000,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 4,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T12:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 80,
        /* OrderAmount */ 4000,
        /* Fees */ 10
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(90));
    // AvgEntryPrice = (100*50 + 100*60) / 200 = 55
    expect(trade.AvgEntryPrice).toBe(55);
    // AvgExitPrice = (100*70 + 50*80) / 150 = 73.33...
    expect(trade.AvgExitPrice).toBeCloseTo(73.3333, 4);
    // RealizedGain = 150 * (73.3333 - 55) = 2750
    expect(trade.RealizedGain).toBeCloseTo(2750, 0);
    // Trade is still open with 50 shares
    expect(trade.OpenQuantity).toBe(50);
    expect(trade.Closed).toBe(false);
    // UnrealizedGain = 50 * (90 - 55) = 1750
    expect(trade.UnrealizedGain).toBe(1750);
    // TotalGain = RealizedGain + UnrealizedGain = 2750 + 1750 = 4500
    expect(trade.TotalGain).toBe(4500);
    // Note: TotalGain != RealizedGain because trade is partially open
  });

  it('should correctly calculate when RealizedGain != TotalGain for multiple entries/exits (short)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 200,
        /* ExecutedPrice */ 100,
        /* OrderAmount */ 20000,
        /* Fees */ 20
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 90,
        /* OrderAmount */ 4500,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 3,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T12:00:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 95,
        /* OrderAmount */ 9500,
        /* Fees */ 15
      )
    ];
    const trade = Trade.CreateOpenTradeFromOrders(orders, mockAccount(), mockQuote(85));
    // AvgEntryPrice = 100 (only one short entry)
    expect(trade.AvgEntryPrice).toBe(100);
    // AvgExitPrice = (50*90 + 100*95) / 150 = 93.3333...
    expect(trade.AvgExitPrice).toBeCloseTo(93.3333, 4);
    // RealizedGain = 150 * (93.3333 - 100) * -1 = 1000
    expect(trade.RealizedGain).toBeCloseTo(1000, 0);
    // Trade is still open with 50 shares short
    expect(trade.OpenQuantity).toBe(-50);
    expect(trade.Closed).toBe(false);
    // UnrealizedGain = 50 * (85 - 100) * -1 = 750
    expect(trade.UnrealizedGain).toBe(750);
    // TotalGain = RealizedGain + UnrealizedGain = 1000 + 750 = 1750
    expect(trade.TotalGain).toBe(1750);
    // Note: TotalGain != RealizedGain because trade is partially open
  });

});
