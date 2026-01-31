import { Trade } from '../interfaces/Trade';
import { Order } from '../interfaces/Order';
import { OrderActionBuy, OrderActionSell, OrderActionSellShort, OrderActionBuyToCover } from '../interfaces/OrderAction';

const AAPL_SYMBOL = 'AAPL';
const MOCK_ACCOUNT_ID = 42;
const mockAccount = () => ({ AccountID: MOCK_ACCOUNT_ID } as any);
const mockQuote = (price: number) => ({ Symbol: AAPL_SYMBOL, Price: price } as any);

describe('Trade.multiLeg - Closed trades', () => {
  // Sequence: buy100@50 -> sell30@55 -> buy20@60 -> sell90@70
  it('should roll up multi-leg closed long trade (buy,sell,buy,sell) - winner', () => {
    const orders = [
      new Order(/* BrokerOrderID */ 1, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-01-06T10:00:00Z'), /* Action */ new OrderActionBuy(), /* Quantity */ 100, /* ExecutedPrice */ 50, /* OrderAmount */ 5000, /* Fees */ 2),
      new Order(/* BrokerOrderID */ 2, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-01-06T10:30:00Z'), /* Action */ new OrderActionSell(), /* Quantity */ 30, /* ExecutedPrice */ 55, /* OrderAmount */ 1650, /* Fees */ 3),
      new Order(/* BrokerOrderID */ 3, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-01-06T11:00:00Z'), /* Action */ new OrderActionBuy(), /* Quantity */ 20, /* ExecutedPrice */ 60, /* OrderAmount */ 1200, /* Fees */ 4),
      new Order(/* BrokerOrderID */ 4, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-01-06T11:30:00Z'), /* Action */ new OrderActionSell(), /* Quantity */ 90, /* ExecutedPrice */ 70, /* OrderAmount */ 6300, /* Fees */ 5)
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), mockQuote(68));
    expect(trade.AvgEntryPrice).toBeCloseTo(51.6667, 4); // (5000 + 1200) / 120
    expect(trade.AvgExitPrice).toBeCloseTo(66.25, 4); // (1650 + 6300) / 120
    expect(trade.RealizedGain).toBeCloseTo(1750, 4); // 120 * (66.25 - 51.6667)
    expect(trade.TotalGain).toBeCloseTo(1750, 4); // realized + unrealized (unrealized null)
    expect(trade.BreakEvenPrice).toBeCloseTo(51.6667, 4); // AvgEntryPrice
    expect(trade.CurrentPrice).toBe(68); // quote
    expect(trade.OpenQuantity).toBe(0); // closed
    expect(trade.Closed).toBe(true); // closed
    expect(trade.TotalFees).toBe(14); // 2+3+4+5
    expect(trade.WinningTrade).toBe(true); // TotalGain >= 0
  });

  // Sequence: buy100@60 -> sell30@55 -> buy20@62 -> sell90@56
  it('should roll up multi-leg closed long trade (buy,sell,buy,sell) - loser', () => {
    const orders = [
      new Order(/* BrokerOrderID */ 11, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-02-06T10:00:00Z'), /* Action */ new OrderActionBuy(), /* Quantity */ 100, /* ExecutedPrice */ 60, /* OrderAmount */ 6000, /* Fees */ 2),
      new Order(/* BrokerOrderID */ 12, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-02-06T10:30:00Z'), /* Action */ new OrderActionSell(), /* Quantity */ 30, /* ExecutedPrice */ 55, /* OrderAmount */ 1650, /* Fees */ 3),
      new Order(/* BrokerOrderID */ 13, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-02-06T11:00:00Z'), /* Action */ new OrderActionBuy(), /* Quantity */ 20, /* ExecutedPrice */ 62, /* OrderAmount */ 1240, /* Fees */ 4),
      new Order(/* BrokerOrderID */ 14, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-02-06T11:30:00Z'), /* Action */ new OrderActionSell(), /* Quantity */ 90, /* ExecutedPrice */ 56, /* OrderAmount */ 5040, /* Fees */ 5)
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), mockQuote(54));
    expect(trade.AvgEntryPrice).toBeCloseTo(60.3333, 4); // (6000 + 1240) / 120
    expect(trade.AvgExitPrice).toBeCloseTo(55.75, 4); // (1650 + 5040) / 120
    expect(trade.RealizedGain).toBeCloseTo(-550, 4); // 120 * (55.75 - 60.3333)
    expect(trade.TotalGain).toBeCloseTo(-550, 4); // realized + unrealized (unrealized null)
    expect(trade.BreakEvenPrice).toBeCloseTo(60.3333, 4); // AvgEntryPrice
    expect(trade.CurrentPrice).toBe(54); // quote
    expect(trade.OpenQuantity).toBe(0); // closed
    expect(trade.Closed).toBe(true); // closed
    expect(trade.TotalFees).toBe(14); // 2+3+4+5
    expect(trade.WinningTrade).toBe(false); // TotalGain < 0
  });

  // Sequence: sell80@100 -> cover50@90 -> sell40@95 -> cover70@88
  it('should roll up multi-leg closed short trade (sell,cover,sell,cover) - winner', () => {
    const orders = [
      new Order(/* BrokerOrderID */ 21, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-03-06T10:00:00Z'), /* Action */ new OrderActionSellShort(), /* Quantity */ 80, /* ExecutedPrice */ 100, /* OrderAmount */ 8000, /* Fees */ 2),
      new Order(/* BrokerOrderID */ 22, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-03-06T10:30:00Z'), /* Action */ new OrderActionBuyToCover(), /* Quantity */ 50, /* ExecutedPrice */ 90, /* OrderAmount */ 4500, /* Fees */ 3),
      new Order(/* BrokerOrderID */ 23, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-03-06T11:00:00Z'), /* Action */ new OrderActionSellShort(), /* Quantity */ 40, /* ExecutedPrice */ 95, /* OrderAmount */ 3800, /* Fees */ 4),
      new Order(/* BrokerOrderID */ 24, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-03-06T11:30:00Z'), /* Action */ new OrderActionBuyToCover(), /* Quantity */ 70, /* ExecutedPrice */ 88, /* OrderAmount */ 6160, /* Fees */ 5)
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), mockQuote(85));
    expect(trade.AvgEntryPrice).toBeCloseTo(98.3333, 4); // (8000 + 3800) / 120
    expect(trade.AvgExitPrice).toBeCloseTo(88.8333, 4); // (4500 + 6160) / 120
    expect(trade.RealizedGain).toBeCloseTo(1140, 4); // 120 * (98.3333 - 88.8333)
    expect(trade.TotalGain).toBeCloseTo(1140, 4); // realized + unrealized (unrealized null)
    expect(trade.BreakEvenPrice).toBeCloseTo(98.3333, 4); // AvgEntryPrice
    expect(trade.CurrentPrice).toBe(85); // quote
    expect(trade.OpenQuantity).toBe(0); // closed
    expect(trade.Closed).toBe(true); // closed
    expect(trade.TotalFees).toBe(14); // 2+3+4+5
    expect(trade.WinningTrade).toBe(true); // TotalGain >= 0
  });

  // Sequence: sell100@100 -> sell20@105 -> cover50@110 -> cover70@115
  it('should roll up multi-leg closed short trade (sell,cover,sell,cover) - loser', () => {
    const orders = [
      new Order(/* BrokerOrderID */ 31, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-04-06T10:00:00Z'), /* Action */ new OrderActionSellShort(), /* Quantity */ 100, /* ExecutedPrice */ 100, /* OrderAmount */ 10000, /* Fees */ 2),
      new Order(/* BrokerOrderID */ 32, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-04-06T10:30:00Z'), /* Action */ new OrderActionSellShort(), /* Quantity */ 20, /* ExecutedPrice */ 105, /* OrderAmount */ 2100, /* Fees */ 3),
      new Order(/* BrokerOrderID */ 33, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-04-06T11:00:00Z'), /* Action */ new OrderActionBuyToCover(), /* Quantity */ 50, /* ExecutedPrice */ 110, /* OrderAmount */ 5500, /* Fees */ 4),
      new Order(/* BrokerOrderID */ 34, /* BrokerOrderStep */ 1, /* Symbol */ AAPL_SYMBOL, /* ExecutedTime */ new Date('2023-04-06T11:30:00Z'), /* Action */ new OrderActionBuyToCover(), /* Quantity */ 70, /* ExecutedPrice */ 115, /* OrderAmount */ 8050, /* Fees */ 5)
    ];
    const trade = Trade.CreateClosedTradeFromOrders(orders, mockAccount(), mockQuote(118));
    expect(trade.AvgEntryPrice).toBeCloseTo(100.8333, 4); // (10000 + 2100) / 120
    expect(trade.AvgExitPrice).toBeCloseTo(112.9167, 4); // (5500 + 8050) / 120
    expect(trade.RealizedGain).toBeCloseTo(-1450, 4); // 120 * (112.9167 - 100.8333) * -1 -> 120*(100.8333-112.9167)
    expect(trade.TotalGain).toBeCloseTo(-1450, 4); // realized + unrealized (unrealized null)
    expect(trade.BreakEvenPrice).toBeCloseTo(100.8333, 4); // AvgEntryPrice
    expect(trade.CurrentPrice).toBe(118); // quote
    expect(trade.OpenQuantity).toBe(0); // closed
    expect(trade.Closed).toBe(true); // closed
    expect(trade.TotalFees).toBe(14); // 2+3+4+5
    expect(trade.WinningTrade).toBe(false); // TotalGain < 0
  });
});


describe('Trade.multiLeg - Open trades', () => {
  it('open long multi-leg sequence updates correctly after each leg', () => {
    // Sequence: buy100@50 -> sell30@55 -> buy20@60 -> sell80@70 (leaves 10 open)
    const orders1 = [new Order(/* 1 */ 1, 1, AAPL_SYMBOL, new Date('2023-01-06T10:00:00Z'), new OrderActionBuy(), 100, 50, 5000, 2)];
    // Order: buy 100 @ 50
    const trade1 = Trade.CreateOpenTradeFromOrders(orders1, mockAccount(), mockQuote(52));
    expect(trade1.AvgEntryPrice).toBe(50); // 5000 / 100
    expect(trade1.AvgExitPrice).toBeNull();
    // BreakEven = tradeCost / abs(OpenQuantity) = 5000 / 100
    expect(trade1.BreakEvenPrice).toBe(50);
    expect(trade1.CurrentPrice).toBe(52); // quote
    expect(trade1.OpenQuantity).toBe(100); // 100
    expect(trade1.RealizedGain).toBe(0); // no exits
    expect(trade1.UnrealizedGain).toBeCloseTo(200, 4); // 100 * (52 - 50)
    expect(trade1.TotalGain).toBeCloseTo(200, 4); // realized + unrealized

    const orders2 = [...orders1, new Order(/* 2 */ 2, 1, AAPL_SYMBOL, new Date('2023-01-06T10:30:00Z'), new OrderActionSell(), 30, 55, 1650, 3)];
    // Order: sell 30 @ 55
    const trade2 = Trade.CreateOpenTradeFromOrders(orders2, mockAccount(), mockQuote(60));
    expect(trade2.AvgEntryPrice).toBe(50); // 5000 / 100
    expect(trade2.AvgExitPrice).toBe(55); // 1650 / 30
    // BreakEven = (5000 - 1650) / 70 = 47.857142857
    expect(trade2.BreakEvenPrice).toBeCloseTo(47.8571429, 4);
    expect(trade2.CurrentPrice).toBe(60); // quote
    expect(trade2.OpenQuantity).toBe(70); // 100 - 30
    expect(trade2.RealizedGain).toBeCloseTo(150, 4); // 30 * (55 - 50)
    expect(trade2.UnrealizedGain).toBeCloseTo(700, 4); // 70 * (60 - 50)
    expect(trade2.TotalGain).toBeCloseTo(850, 4); // 150 + 700
    expect(trade2.WinningTrade).toBe(true); // TotalGain >= 0

    const orders3 = [...orders2, new Order(/* 3 */ 3, 1, AAPL_SYMBOL, new Date('2023-01-06T11:00:00Z'), new OrderActionBuy(), 20, 60, 1200, 4)];
    // Order: buy 20 @ 60
    const trade3 = Trade.CreateOpenTradeFromOrders(orders3, mockAccount(), mockQuote(65));
    expect(trade3.AvgEntryPrice).toBeCloseTo(51.6667, 4); // (5000 + 1200) / 120
    expect(trade3.AvgExitPrice).toBe(55); // 1650 / 30
    // BreakEven = (6200 - 1650) / 90 = 50.555555...
    expect(trade3.BreakEvenPrice).toBeCloseTo(50.5555556, 4);
    expect(trade3.CurrentPrice).toBe(65); // quote
    expect(trade3.OpenQuantity).toBe(90); // 100 - 30 + 20
    // Realized gain updated because avg entry changed
    expect(trade3.RealizedGain).toBeCloseTo(100, 4); // 30 * (55 - 51.6667)
    expect(trade3.UnrealizedGain).toBeCloseTo(1200, 4); // 90 * (65 - 51.6667)
    expect(trade3.TotalGain).toBeCloseTo(1300, 4); // 100 + 1200
    expect(trade3.WinningTrade).toBe(true); // TotalGain >= 0

    const orders4 = [...orders3, new Order(/* 4 */ 4, 1, AAPL_SYMBOL, new Date('2023-01-06T11:30:00Z'), new OrderActionSell(), 80, 70, 5600, 5)];
    // Order: sell 80 @ 70
    const trade4 = Trade.CreateOpenTradeFromOrders(orders4, mockAccount(), mockQuote(68));
    expect(trade4.AvgEntryPrice).toBeCloseTo(51.6667, 4); // (5000 + 1200) / 120
    expect(trade4.AvgExitPrice).toBeCloseTo(65.9090909, 4); // (1650 + 5600) / 110
    expect(trade4.RealizedGain).toBeCloseTo(1566.6667, 3); // 110 * (65.9091 - 51.6667)
    expect(trade4.UnrealizedGain).toBeCloseTo(163.3333, 4); // 10 * (68 - 51.6667)
    expect(trade4.TotalGain).toBeCloseTo(1730, 3); // 1566.6667 + 163.3333
    expect(trade4.WinningTrade).toBe(true); // TotalGain >= 0
    expect(trade4.OpenQuantity).toBe(10); // 90 - 80
    expect(trade4.BreakEvenPrice).toBeCloseTo(0, 4); // house money -> zero break-even
  });

  it('open long multi-leg losing sequence updates correctly after each leg', () => {
    // Sequence: buy100@60 -> sell30@55 -> buy20@62 -> sell80@56 (leaves 10 open)
    const orders1 = [new Order(/* 1 */ 11, 1, AAPL_SYMBOL, new Date('2023-02-06T10:00:00Z'), new OrderActionBuy(), 100, 60, 6000, 2)];
    // Order: buy 100 @ 60
    const t1 = Trade.CreateOpenTradeFromOrders(orders1, mockAccount(), mockQuote(61));
    expect(t1.AvgEntryPrice).toBe(60); // 6000 / 100
    expect(t1.AvgExitPrice).toBeNull();
    expect(t1.BreakEvenPrice).toBe(60); // tradeCost / 100
    expect(t1.CurrentPrice).toBe(61); // quote
    expect(t1.OpenQuantity).toBe(100); // 100
    expect(t1.RealizedGain).toBe(0); // no exits
    expect(t1.UnrealizedGain).toBeCloseTo(100, 4); // 100 * (61 - 60)
    expect(t1.WinningTrade).toBe(true); // TotalGain >= 0

    const orders2 = [...orders1, new Order(/* 2 */ 12, 1, AAPL_SYMBOL, new Date('2023-02-06T10:30:00Z'), new OrderActionSell(), 30, 55, 1650, 3)];
    const t2 = Trade.CreateOpenTradeFromOrders(orders2, mockAccount(), mockQuote(58));
    expect(t2.AvgEntryPrice).toBe(60);
    expect(t2.AvgExitPrice).toBe(55);
    // BreakEven = (6000 - 1650) / 70 = 62.142857
    expect(t2.BreakEvenPrice).toBeCloseTo(62.1428571, 4);
    expect(t2.CurrentPrice).toBe(58);
    expect(t2.OpenQuantity).toBe(70);
    expect(t2.RealizedGain).toBeCloseTo(-150, 4);
    expect(t2.UnrealizedGain).toBeCloseTo(-140, 4); // 70*(58-60)
    expect(t2.TotalGain).toBeCloseTo(-290, 4);
    expect(t2.WinningTrade).toBe(false); // TotalGain < 0

    const orders3 = [...orders2, new Order(/* 3 */ 13, 1, AAPL_SYMBOL, new Date('2023-02-06T11:00:00Z'), new OrderActionBuy(), 20, 62, 1240, 4)];
    // Order: buy 20 @ 62
    const t3 = Trade.CreateOpenTradeFromOrders(orders3, mockAccount(), mockQuote(56));
    expect(t3.AvgEntryPrice).toBeCloseTo(60.3333, 4); // (6000 + 1240) / 120
    expect(t3.AvgExitPrice).toBeCloseTo(55, 4); // 1650 / 30
    // BreakEven = (7240 - 1650) / 90 = 62.111111
    expect(t3.BreakEvenPrice).toBeCloseTo(62.111111, 4);
    expect(t3.CurrentPrice).toBe(56); // quote
    expect(t3.OpenQuantity).toBe(90); // 100 - 30 + 20
    // realized = 30 * (55 - 60.3333) = -160
    expect(t3.RealizedGain).toBeCloseTo(-160, 4);
    // unrealized = 90 * (56 - 60.3333) = -390
    expect(t3.UnrealizedGain).toBeCloseTo(-390, 4);
    // total = -160 + -390 = -550
    expect(t3.TotalGain).toBeCloseTo(-550, 3);
    expect(t3.WinningTrade).toBe(false); // TotalGain < 0

    const orders4 = [...orders3, new Order(/* 4 */ 14, 1, AAPL_SYMBOL, new Date('2023-02-06T11:30:00Z'), new OrderActionSell(), 80, 56, 4480, 5)];
    // Order: sell 80 @ 56
    const t4 = Trade.CreateOpenTradeFromOrders(orders4, mockAccount(), mockQuote(54));
    expect(t4.AvgEntryPrice).toBeCloseTo(60.3333, 4); // (6000 + 1240) / 120
    // avgExit = (30*55 + 80*56) / 110 = 55.7272727...
    expect(t4.AvgExitPrice).toBeCloseTo(55.7272727, 4);
    // realized = 110 * (55.7272727 - 60.3333) = -506.6667
    expect(t4.RealizedGain).toBeCloseTo(-506.6667, 4);
    expect(t4.UnrealizedGain).toBeCloseTo(-63.3333, 4); // 10*(54 - 60.3333)
    expect(t4.TotalGain).toBeCloseTo(-570, 3); // -506.6667 + -63.3333
    expect(t4.OpenQuantity).toBe(10); // 90 - 80
    expect(t4.WinningTrade).toBe(false); // TotalGain < 0
    // tradeCost = entries(7240) - exits(6130) = 1110 -> breakEven = 1110/10 = 111
    expect(t4.BreakEvenPrice).toBeCloseTo(111, 4);
    expect(t4.CurrentPrice).toBe(54); // quote
  });

  it('open short multi-leg sequence (sell,cover,sell,cover) winner updates after each leg', () => {
    // Sequence: sell80@100 -> cover50@90 -> sell40@95 -> cover70@88 (leaves -10 open)
    const o1 = [new Order(/* 1 */ 21, 1, AAPL_SYMBOL, new Date('2023-03-06T10:00:00Z'), new OrderActionSellShort(), 80, 100, 8000, 2)];
    // Order: sell 80 @ 100
    const s1 = Trade.CreateOpenTradeFromOrders(o1, mockAccount(), mockQuote(98));
    expect(s1.AvgEntryPrice).toBe(100); // (80*100)/80
    expect(s1.AvgExitPrice).toBeNull();
    expect(s1.OpenQuantity).toBe(-80); // -80
    expect(s1.RealizedGain).toBe(0); // no exits
    expect(s1.UnrealizedGain).toBeCloseTo(160, 4); // 80 * (98 - 100) * -1 = 160
    expect(s1.CurrentPrice).toBe(98); // quote
    expect(s1.WinningTrade).toBe(true); // TotalGain >= 0

    const o2 = [...o1, new Order(/* 2 */ 22, 1, AAPL_SYMBOL, new Date('2023-03-06T10:30:00Z'), new OrderActionBuyToCover(), 50, 90, 4500, 3)];
    const s2 = Trade.CreateOpenTradeFromOrders(o2, mockAccount(), mockQuote(92));
    // Order: cover 50 @ 90
    expect(s2.AvgEntryPrice).toBe(100); // entries unchanged
    expect(s2.AvgExitPrice).toBe(90); // 4500 / 50
    expect(s2.OpenQuantity).toBe(-30); // -80 + 50
    expect(s2.RealizedGain).toBeCloseTo(500, 4); // 50*(100 - 90)
    expect(s2.UnrealizedGain).toBeCloseTo(240, 4); // 30*(92 - 100)*-1 = 240
    expect(s2.TotalGain).toBeCloseTo(740, 3); // 500 + 240
    expect(s2.CurrentPrice).toBe(92); // quote
    expect(s2.WinningTrade).toBe(true); // TotalGain >= 0

    const o3 = [...o2, new Order(/* 3 */ 23, 1, AAPL_SYMBOL, new Date('2023-03-06T11:00:00Z'), new OrderActionSellShort(), 40, 95, 3800, 4)];
    const s3 = Trade.CreateOpenTradeFromOrders(o3, mockAccount(), mockQuote(90));
    // Order: sell 40 @ 95
    expect(s3.AvgEntryPrice).toBeCloseTo(98.3333, 4); // (8000 + 3800) / 120
    expect(s3.AvgExitPrice).toBeCloseTo(90, 4); // 4500 / 50
    expect(s3.OpenQuantity).toBe(-70); // -30 - 40
    expect(s3.RealizedGain).toBeCloseTo(416.6667, 4); // 50*(100 - 98.3333?) -> 50*(90 - 98.3333)*-1 = 416.6667
    expect(s3.UnrealizedGain).toBeCloseTo(583.3333, 4); // 70*(90 - 98.3333)*-1
    expect(s3.TotalGain).toBeCloseTo(1000, 3); // ~416.6667 + 583.3333
    expect(s3.CurrentPrice).toBe(90); // quote
    expect(s3.WinningTrade).toBe(true); // TotalGain >= 0

    const o4 = [...o3, new Order(/* 4 */ 24, 1, AAPL_SYMBOL, new Date('2023-03-06T11:30:00Z'), new OrderActionBuyToCover(), 60, 88, 5280, 5)];
    const s4 = Trade.CreateOpenTradeFromOrders(o4, mockAccount(), mockQuote(85));
    // Order: cover 60 @ 88
    expect(s4.AvgEntryPrice).toBeCloseTo(98.3333, 4); // (8000 + 3800) / 120
    expect(s4.AvgExitPrice).toBeCloseTo(88.9090909, 4); // (50*90 + 60*88) / 110
    expect(s4.RealizedGain).toBeCloseTo(1036.6667, 3); // 110*(98.3333 - 88.9091)
    expect(s4.UnrealizedGain).toBeCloseTo(133.3333, 3); // -10*(85 - 98.3333) * -1
    expect(s4.TotalGain).toBeCloseTo(1170, 3); // 1036.6667 + 133.3333
    expect(s4.CurrentPrice).toBe(85); // quote
    expect(s4.OpenQuantity).toBe(-10); // -70 + 60
    expect(s4.WinningTrade).toBe(true); // TotalGain >= 0
  });

  it('open short multi-leg losing sequence (sell,cover,sell,cover) loser updates after each leg', () => {
    // Sequence: sell100@100 -> sell20@105 -> cover50@110 -> cover70@115 (leaves -0? to keep open, we'll make last cover 60 leaving -10 short)
    const p1 = [new Order(/* 1 */ 31, 1, AAPL_SYMBOL, new Date('2023-04-06T10:00:00Z'), new OrderActionSellShort(), 100, 100, 10000, 2)];
    const t1 = Trade.CreateOpenTradeFromOrders(p1, mockAccount(), mockQuote(102));
    expect(t1.AvgEntryPrice).toBe(100);
    expect(t1.AvgExitPrice).toBeNull();
    expect(t1.OpenQuantity).toBe(-100);
    expect(t1.UnrealizedGain).toBeCloseTo(-200, 4);
    expect(t1.CurrentPrice).toBe(102); // quote
    expect(t1.WinningTrade).toBe(false); // TotalGain < 0

    const p2 = [...p1, new Order(/* 2 */ 32, 1, AAPL_SYMBOL, new Date('2023-04-06T10:30:00Z'), new OrderActionSellShort(), 20, 105, 2100, 3)];
    const t2 = Trade.CreateOpenTradeFromOrders(p2, mockAccount(), mockQuote(103));
    expect(t2.AvgEntryPrice).toBeCloseTo(100.8333, 4);
    expect(t2.OpenQuantity).toBe(-120);
    expect(t2.CurrentPrice).toBe(103); // quote
    expect(t2.WinningTrade).toBe(false); // TotalGain < 0

    const p3 = [...p2, new Order(/* 3 */ 33, 1, AAPL_SYMBOL, new Date('2023-04-06T11:00:00Z'), new OrderActionBuyToCover(), 50, 110, 5500, 4)];
    const t3 = Trade.CreateOpenTradeFromOrders(p3, mockAccount(), mockQuote(112));
    expect(t3.AvgExitPrice).toBeCloseTo(110, 4);
    expect(t3.OpenQuantity).toBe(-70);
    // realized = 50*(110 - 100.8333)*-1 = -458.3333
    expect(t3.RealizedGain).toBeCloseTo(-458.3333, 4);
    expect(t3.CurrentPrice).toBe(112); // quote
    expect(t3.WinningTrade).toBe(false); // TotalGain < 0

    const p4 = [...p3, new Order(/* 4 */ 34, 1, AAPL_SYMBOL, new Date('2023-01-01T11:30:00Z'), new OrderActionBuyToCover(), 60, 115, 6900, 5)];
    const t4 = Trade.CreateOpenTradeFromOrders(p4, mockAccount(), mockQuote(118));
    // avgExit = (50*110 + 60*115) / 110 = 112.7272727
    expect(t4.AvgExitPrice).toBeCloseTo(112.7272727, 4);
    // realized = 110*(112.7272727 - 100.8333)*-1 = -1308.3333
    expect(t4.RealizedGain).toBeCloseTo(-1308.3333, 4);
    // open qty = 120 - 110 = 10 short -> -10
    expect(t4.OpenQuantity).toBe(-10);
    // unrealized = 10 * (118 - 100.8333) * -1 = -171.6667
    expect(t4.UnrealizedGain).toBeCloseTo(-171.6667, 3);
    // total = -1308.3333 + -171.6667 = -1480
    expect(t4.TotalGain).toBeCloseTo(-1480, 3);
    expect(t4.WinningTrade).toBe(false); // TotalGain < 0
    expect(t4.CurrentPrice).toBe(118); // quote
  });
});