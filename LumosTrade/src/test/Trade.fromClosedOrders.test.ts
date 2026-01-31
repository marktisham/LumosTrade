

import { Trade } from '../interfaces/Trade';
import { Order } from '../interfaces/Order';
import { OrderActionBuy, OrderActionSell, OrderActionSellShort, OrderActionBuyToCover } from '../interfaces/OrderAction';

const AAPL_SYMBOL = 'AAPL';
const MOCK_ACCOUNT_ID = 42;
const mockAccount = () => ({ AccountID: MOCK_ACCOUNT_ID } as any);
const mockQuote = (price: number) => ({ Symbol: AAPL_SYMBOL, Price: price } as any);


describe('Trade.CreateFromClosedOrders', () => {

  it('should roll up a losing long trade', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 150,
        /* OrderAmount */ 15000,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 140,
        /* OrderAmount */ 14000,
        /* Fees */ 12
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), mockQuote(145));
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toEqual(new Date('2023-01-01T11:00:00Z'));
    expect(trade.DurationMS).toBe(BigInt(3600000));
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(true);
    expect(trade.TotalGain).toBe(-1000);
    expect(trade.TotalFees).toBe(22);
    expect(trade.LargestRisk).toBe(15000);
    expect(trade.WinningTrade).toBe(false);
    expect(trade.OpenQuantity).toBe(0);
    expect(trade.BreakEvenPrice).toBe(150);
    expect(trade.CurrentPrice).toBe(145);
    expect(trade.Closed).toBe(true);
    expect(trade.AvgEntryPrice).toBe(150);
    expect(trade.AvgExitPrice).toBe(140);
    expect(trade.RealizedGain).toBe(-1000); // 100 * (140 - 150) * 1 = -1000
    expect(trade.UnrealizedGain).toBeNull(); // Closed trade
  });

  it('should roll up a losing short trade', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 200,
        /* OrderAmount */ 10000,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T12:00:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 220,
        /* OrderAmount */ 11000,
        /* Fees */ 7
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toEqual(new Date('2023-01-01T12:00:00Z'));
    expect(trade.DurationMS).toBe(BigInt(7200000));
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(false);
    expect(trade.TotalGain).toBe(-1000);
    expect(trade.TotalFees).toBe(12);
    expect(trade.LargestRisk).toBe(10000);
    expect(trade.WinningTrade).toBe(false);
    expect(trade.OpenQuantity).toBe(0);
    expect(trade.BreakEvenPrice).toBe(200);
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.Closed).toBe(true);
    expect(trade.AvgEntryPrice).toBe(200);
    expect(trade.AvgExitPrice).toBe(220);
    expect(trade.RealizedGain).toBe(-1000);
    expect(trade.UnrealizedGain).toBeNull();
  });
  it('should throw if orders is empty', () => {
    expect(() => Trade.CreateClosedTradeFromOrders([], mockAccount(), null)).toThrow();
  });

  it('should throw if account is null', () => {
    const order1 = new Order(
      /* BrokerOrderID */ 1,
      /* BrokerOrderStep */ 1,
      /* Symbol */ AAPL_SYMBOL,
      /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
      /* Action */ new OrderActionBuy(),
      /* Quantity */ 100,
      /* ExecutedPrice */ 150,
      /* OrderAmount */ 15000,
      /* Fees */ 10
    );
    const order2 = new Order(
      /* BrokerOrderID */ 2,
      /* BrokerOrderStep */ 1,
      /* Symbol */ AAPL_SYMBOL,
      /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
      /* Action */ new OrderActionSell(),
      /* Quantity */ 100,
      /* ExecutedPrice */ 155,
      /* OrderAmount */ 15500,
      /* Fees */ 12
    );
    expect(() => Trade.CreateClosedTradeFromOrders([order1, order2], null as any, null)).toThrow('Account must not be null');
  });


  it('should throw if orders have different symbols', () => {
    const order1 = new Order(
      /* BrokerOrderID */ 1,
      /* BrokerOrderStep */ 1,
      /* Symbol */ AAPL_SYMBOL,
      /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
      /* Action */ new OrderActionBuy(),
      /* Quantity */ 100,
      /* ExecutedPrice */ 150,
      /* OrderAmount */ 15000,
      /* Fees */ 10
    );
    const order2 = new Order(
      /* BrokerOrderID */ 2,
      /* BrokerOrderStep */ 1,
      /* Symbol */ 'MSFT',
      /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
      /* Action */ new OrderActionSell(),
      /* Quantity */ 100,
      /* ExecutedPrice */ 155,
      /* OrderAmount */ 15500,
      /* Fees */ 12
    );
    expect(() => Trade.CreateClosedTradeFromOrders([order1, order2], mockAccount(), null)).toThrow();
  });

  it('should throw if the order sequencing is wrong (long)', () => {
    const order1 = new Order(
      /* BrokerOrderID */ 1,
      /* BrokerOrderStep */ 1,
      /* Symbol */ AAPL_SYMBOL,
      /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
      /* Action */ new OrderActionSell(),
      /* Quantity */ 10,
      /* ExecutedPrice */ 10,
      /* OrderAmount */ 100,
      /* Fees */ 0
    );
    const order2 = new Order(
      /* BrokerOrderID */ 2,
      /* BrokerOrderStep */ 1,
      /* Symbol */ AAPL_SYMBOL,
      /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
      /* Action */ new OrderActionBuy(),
      /* Quantity */ 10,
      /* ExecutedPrice */ 10,
      /* OrderAmount */ 100,
      /* Fees */ 0
    );
    expect(() => Trade.CreateClosedTradeFromOrders([order1, order2], mockAccount(), null)).toThrow();
  });

  it('should throw if the order sequencing is wrong (short)', () => {
    const order1 = new Order(
      /* BrokerOrderID */ 1,
      /* BrokerOrderStep */ 1,
      /* Symbol */ AAPL_SYMBOL,
      /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
      /* Action */ new OrderActionBuyToCover(),
      /* Quantity */ 10,
      /* ExecutedPrice */ 10,
      /* OrderAmount */ 100,
      /* Fees */ 0
    );
    const order2 = new Order(
      /* BrokerOrderID */ 2,
      /* BrokerOrderStep */ 1,
      /* Symbol */ AAPL_SYMBOL,
      /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
      /* Action */ new OrderActionSellShort(),
      /* Quantity */ 10,
      /* ExecutedPrice */ 10,
      /* OrderAmount */ 100,
      /* Fees */ 0
    );
    expect(() => Trade.CreateClosedTradeFromOrders([order1, order2], mockAccount(), null)).toThrow();
  });

  it('should roll up a losing long trade', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 150,
        /* OrderAmount */ 15000,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 140,
        /* OrderAmount */ 14000,
        /* Fees */ 12
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toEqual(new Date('2023-01-01T11:00:00Z'));
    expect(trade.DurationMS).toBe(BigInt(3600000));
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(true);
    expect(trade.TotalGain).toBe(-1000);
    expect(trade.TotalFees).toBe(22);
    expect(trade.LargestRisk).toBe(15000);
    expect(trade.WinningTrade).toBe(false);
    expect(trade.OpenQuantity).toBe(0);
    expect(trade.BreakEvenPrice).toBe(150);
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.Closed).toBe(true);
    expect(trade.AvgEntryPrice).toBe(150);
    expect(trade.AvgExitPrice).toBe(140);
    expect(trade.RealizedGain).toBe(-1000);
    expect(trade.UnrealizedGain).toBeNull();
  });

  it('should roll up a losing short trade', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 200,
        /* OrderAmount */ 10000,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T12:00:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 220,
        /* OrderAmount */ 11000,
        /* Fees */ 7
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toEqual(new Date('2023-01-01T12:00:00Z'));
    expect(trade.DurationMS).toBe(BigInt(7200000));
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(false);
    expect(trade.TotalGain).toBe(-1000);
    expect(trade.TotalFees).toBe(12);
    expect(trade.LargestRisk).toBe(10000);
    expect(trade.WinningTrade).toBe(false);
    expect(trade.OpenQuantity).toBe(0);
    expect(trade.BreakEvenPrice).toBe(200);
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.Closed).toBe(true);
    expect(trade.AvgEntryPrice).toBe(200);
    expect(trade.AvgExitPrice).toBe(220);
    expect(trade.RealizedGain).toBe(-1000);
    expect(trade.UnrealizedGain).toBeNull();
  });

  it('should throw if OrderAmount does not equal ExecutedPrice * Quantity', () => {
    expect(() => {
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 150,
        /* OrderAmount */ 14998, // should be 15000
        /* Fees */ 10
      );
    }).toThrow();
  });

  it('should roll up 2 buys and 1 sell', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 150,
        /* OrderAmount */ 15000,
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 155,
        /* OrderAmount */ 7750,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 3,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T12:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 150,
        /* ExecutedPrice */ 160,
        /* OrderAmount */ 24000,
        /* Fees */ 8
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toEqual(new Date('2023-01-01T12:00:00Z'));
    expect(trade.DurationMS).toBe(BigInt(7200000));
    expect(trade.TotalOrderCount).toBe(3);
    expect(trade.LongTrade).toBe(true);
    expect(trade.TotalGain).toBe(-15000 - 7750 + 24000);
    expect(trade.TotalFees).toBe(10 + 5 + 8);
    expect(trade.LargestRisk).toBe(15000 + 7750); // max abs Proceeds at any point
    expect(trade.WinningTrade).toBe(true);
    expect(trade.OpenQuantity).toBe(0);
    expect(trade.BreakEvenPrice).toBe(151.6667);
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.Closed).toBe(true);
    expect(trade.AvgEntryPrice).toBeCloseTo(151.6667, 4);
    expect(trade.AvgExitPrice).toBe(160);
    expect(trade.RealizedGain).toBeCloseTo(1250, 4);
    expect(trade.UnrealizedGain).toBeNull();
  });

  it('should roll up 2 shorts and 1 cover', () => {
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
        /* Fees */ 10
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 155,
        /* OrderAmount */ 7750,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 3,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T12:00:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 150,
        /* ExecutedPrice */ 140,
        /* OrderAmount */ 21000,
        /* Fees */ 8
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toEqual(new Date('2023-01-01T12:00:00Z'));
    expect(trade.DurationMS).toBe(BigInt(7200000));
    expect(trade.TotalOrderCount).toBe(3);
    expect(trade.LongTrade).toBe(false);
    expect(trade.TotalGain).toBe(15000 + 7750 - 21000);
    expect(trade.TotalFees).toBe(10 + 5 + 8);
    expect(trade.LargestRisk).toBe(15000 + 7750); // max abs Proceeds at any point
    expect(trade.WinningTrade).toBe(true);
    expect(trade.OpenQuantity).toBe(0);
    expect(trade.BreakEvenPrice).toBe(151.6667);
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.Closed).toBe(true);
    expect(trade.AvgEntryPrice).toBeCloseTo(151.6667, 4);
    expect(trade.AvgExitPrice).toBe(140);
    expect(trade.RealizedGain).toBeCloseTo(1750, 4);
    expect(trade.UnrealizedGain).toBeNull();
  });

  it('closed processor should throw an error on an open trade (long)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 150,
        /* OrderAmount */ 15000,
        /* Fees */ 10
      )
    ];
    expect(() => Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null)).toThrow();
  });

  it('closed processor should throw an error on an open trade (short)', () => {
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
        /* Fees */ 10
      )
    ];
    expect(() => Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null)).toThrow();
  });

  it('closed processor should throw an error on an open trade (long)', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 150,
        /* OrderAmount */ 15000,
        /* Fees */ 10
      )
    ];
    expect(() => Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null)).toThrow();
  });

  it('closed processor should throw an error on an open trade (short)', () => {
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
        /* Fees */ 10
      )
    ];
    expect(() => Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null)).toThrow();
  });

  it('should not allow an order with 0 quantity', () => {
    expect(() => {
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 0,
        /* ExecutedPrice */ 150,
        /* OrderAmount */ 0,
        /* Fees */ 10
      );
    }).toThrow();
  });

  it('should not allow an order with negative quantity', () => {
    expect(() => {
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ -1,
        /* ExecutedPrice */ 150,
        /* OrderAmount */ -150,
        /* Fees */ 10
      );
    }).toThrow();
  });

  it('should properly round partial quantity to close a trade', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 1,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 10,
        /* Fees */ 0
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 0.9999999,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 9.999999,
        /* Fees */ 0
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(trade.Symbol).toBe(AAPL_SYMBOL);
    expect(trade.OpenDate).toEqual(new Date('2023-01-01T10:00:00Z'));
    expect(trade.CloseDate).toEqual(new Date('2023-01-01T11:00:00Z'));
    expect(trade.DurationMS).toBe(BigInt(3600000));
    expect(trade.TotalOrderCount).toBe(2);
    expect(trade.LongTrade).toBe(true);
    expect(trade.TotalGain).toBe(-0);
    expect(trade.TotalFees).toBe(0);
    expect(trade.LargestRisk).toBe(10);
    expect(trade.WinningTrade).toBe(false);
    expect(trade.OpenQuantity).toBe(0);
    expect(trade.BreakEvenPrice).toBe(10);
    expect(trade.CurrentPrice).toBeNull();
    expect(trade.Closed).toBe(true);
    expect(trade.AvgEntryPrice).toBe(10);
    expect(trade.AvgExitPrice).toBeCloseTo(10, 4);
    expect(trade.RealizedGain).toBeCloseTo(0, 4);
    expect(trade.UnrealizedGain).toBeNull();
  });

  it('should roll up a winning short trade (profit) and compute positive GainPct', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-02T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 200,
        /* OrderAmount */ 10000,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-02T12:00:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 180,
        /* OrderAmount */ 9000,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null);
    expect(trade.TotalGain).toBe(1000);
    expect(trade.WinningTrade).toBe(true);
    expect(trade.AvgEntryPrice).toBe(200);
    expect(trade.AvgExitPrice).toBe(180);
    expect(trade.RealizedGain).toBe(1000);
    expect(trade.UnrealizedGain).toBeNull();
    // TotalGainPct should be (BreakEvenPrice - CurrentPrice) / EntryPrice -> (200-180)/200 = 0.10
    expect(trade.TotalGainPct).not.toBeNull();
    expect(trade.TotalGainPct as number).toBeCloseTo(0.10, 4);
  });

  it('should roll up a losing short trade (loss) and compute negative GainPct', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-03T10:00:00Z'),
        /* Action */ new OrderActionSellShort(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 200,
        /* OrderAmount */ 10000,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-03T12:00:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 220,
        /* OrderAmount */ 11000,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null);
    expect(trade.TotalGain).toBe(-1000);
    expect(trade.WinningTrade).toBe(false);
    expect(trade.AvgEntryPrice).toBe(200);
    expect(trade.AvgExitPrice).toBe(220);
    expect(trade.RealizedGain).toBe(-1000);
    expect(trade.UnrealizedGain).toBeNull();
    // TotalGainPct should be (BreakEvenPrice - CurrentPrice) / EntryPrice -> (200-220)/200 = -0.10
    expect(trade.TotalGainPct).not.toBeNull();
    expect(trade.TotalGainPct as number).toBeCloseTo(-0.10, 4);
  });

  // Long trade equivalents
  it('should roll up a winning long trade (profit) and compute positive GainPct', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-04T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 100,
        /* OrderAmount */ 5000,
        /* Fees */ 2
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-04T12:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 110,
        /* OrderAmount */ 5500,
        /* Fees */ 3
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null);
    expect(trade.TotalGain).toBe(500);
    expect(trade.WinningTrade).toBe(true);
    expect(trade.AvgEntryPrice).toBe(100);
    expect(trade.AvgExitPrice).toBe(110);
    expect(trade.RealizedGain).toBe(500);
    expect(trade.UnrealizedGain).toBeNull();
    // TotalGainPct should be (CurrentPrice / BreakEvenPrice) - 1 -> (110/100)-1 = 0.10
    expect(trade.TotalGainPct).not.toBeNull();
    expect(trade.TotalGainPct as number).toBeCloseTo(0.10, 4);
  });

  it('should roll up a losing long trade (loss) and compute negative GainPct', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-05T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 100,
        /* OrderAmount */ 5000,
        /* Fees */ 2
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-05T12:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 90,
        /* OrderAmount */ 4500,
        /* Fees */ 3
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null);
    expect(trade.TotalGain).toBe(-500);
    expect(trade.WinningTrade).toBe(false);
    expect(trade.AvgEntryPrice).toBe(100);
    expect(trade.AvgExitPrice).toBe(90);
    expect(trade.RealizedGain).toBe(-500);
    expect(trade.UnrealizedGain).toBeNull();
    // TotalGainPct should be (CurrentPrice / BreakEvenPrice) - 1 -> (90/100)-1 = -0.10
    expect(trade.TotalGainPct).not.toBeNull();
    expect(trade.TotalGainPct as number).toBeCloseTo(-0.10, 4);
  });

  it('should calculate new fields correctly for a winning long trade', () => {
    const orders = [
      new Order(
        /* BrokerOrderID */ 1,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T10:00:00Z'),
        /* Action */ new OrderActionBuy(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 10,
        /* OrderAmount */ 1000,
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 15,
        /* OrderAmount */ 1500,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AvgEntryPrice).toBe(10);
    expect(trade.AvgExitPrice).toBe(15);
    expect(trade.RealizedGain).toBe(500); // 100 * (15 - 10) * 1
    expect(trade.UnrealizedGain).toBeNull(); // Closed trade, no unrealized gain
    expect(trade.TotalGain).toBe(500); // 1500 - 1000
  });

  it('should calculate new fields correctly for a winning short trade', () => {
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
        /* Fees */ 5
      ),
      new Order(
        /* BrokerOrderID */ 2,
        /* BrokerOrderStep */ 1,
        /* Symbol */ AAPL_SYMBOL,
        /* ExecutedTime */ new Date('2023-01-01T12:00:00Z'),
        /* Action */ new OrderActionBuyToCover(),
        /* Quantity */ 50,
        /* ExecutedPrice */ 80,
        /* OrderAmount */ 4000,
        /* Fees */ 5
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), null);
    expect(trade.AvgEntryPrice).toBe(100);
    expect(trade.AvgExitPrice).toBe(80);
    expect(trade.RealizedGain).toBe(1000); // 50 * (80 - 100) * -1 = 1000
    expect(trade.UnrealizedGain).toBeNull();
    expect(trade.TotalGain).toBe(1000); // 5000 - 4000
  });

  it('should demonstrate AvgExitPrice != CurrentPrice when quote provided (closed long)', () => {
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
        /* ExecutedTime */ new Date('2023-01-01T11:00:00Z'),
        /* Action */ new OrderActionSell(),
        /* Quantity */ 100,
        /* ExecutedPrice */ 60,
        /* OrderAmount */ 6000,
        /* Fees */ 10
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), mockQuote(75));
    expect(trade.AvgEntryPrice).toBe(50);
    expect(trade.AvgExitPrice).toBe(60);
    expect(trade.RealizedGain).toBe(1000);
    expect(trade.UnrealizedGain).toBeNull();
    expect(trade.CurrentPrice).toBe(75);
    expect(trade.Closed).toBe(true);
  });

  it('should demonstrate AvgExitPrice != CurrentPrice when quote provided (closed short)', () => {
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
      )
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), mockQuote(85));
    expect(trade.AvgEntryPrice).toBe(100);
    expect(trade.AvgExitPrice).toBe(90);
    expect(trade.RealizedGain).toBe(500);
    expect(trade.UnrealizedGain).toBeNull();
    expect(trade.CurrentPrice).toBe(85);
    expect(trade.Closed).toBe(true);
  });






});
