

import { TradeImport } from '../processor/Trade/TradeImport';
import { Order } from '../interfaces/Order';
import { OrderActionBuy, OrderActionSell, OrderActionSellShort, OrderActionBuyToCover } from '../interfaces/OrderAction';



describe('TradeImport.ProcessTradesForSymbol', () => {

  it('should return empty arrays for no orders', async () => {
    const result = await TradeImport.ProcessTradesForSymbolTest([]);
    expect(result).toEqual({
      partialAtStart: [],
      completedTrades: [],
      partialAtEnd: []
    });
  });

  it('should handle a single buy order as partial at end', async () => {
    const mockOrder: Order = {
      Quantity: 100,
      Action: new OrderActionBuy()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([mockOrder]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([]);
    expect(result.partialAtEnd).toEqual([mockOrder]);
  });

  it('should handle a single sell short order as partial at end', async () => {
    const mockOrder: Order = {
      Quantity: 50,
      Action: new OrderActionSellShort()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([mockOrder]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([]);
    expect(result.partialAtEnd).toEqual([mockOrder]);
  });

  it('should handle a single sell order as in incomplete order', async () => {
    const mockOrder: Order = {
      Quantity: 100,
      Action: new OrderActionSell()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([mockOrder]);
    expect(result.partialAtStart).toEqual([mockOrder]);
    expect(result.completedTrades).toEqual([]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('should handle a single buy to cover order as in incomplete order', async () => {
    const mockOrder: Order = {
      Quantity: 100,
      Action: new OrderActionBuyToCover()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([mockOrder]);
    expect(result.partialAtStart).toEqual([mockOrder]);
    expect(result.completedTrades).toEqual([]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('should handle a multiple buy orders as partial at end', async () => {
    const buy1: Order = {
      Quantity: 100,
      Action: new OrderActionBuy()
    } as any;
    const buy2: Order = {
      Quantity: 50,
      Action: new OrderActionBuy()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([buy1, buy2]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([]);
    expect(result.partialAtEnd).toEqual([buy1, buy2]);
  });

  it('should handle a multiple short orders as partial at end', async () => {
    const short1: Order = {
      Quantity: 100,
      Action: new OrderActionSellShort()
    } as any;
    const short2: Order = {
      Quantity: 50,
      Action: new OrderActionSellShort()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([short1, short2]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([]);
    expect(result.partialAtEnd).toEqual([short1, short2]);
  });

  it('should handle a multiple buy/sell orders (incomplete) as partial at end', async () => {
    const buy1: Order = {
      Quantity: 100,
      Action: new OrderActionBuy()
    } as any;
    const sell1: Order = {
      Quantity: 50,
      Action: new OrderActionSell()
    } as any;
    const buy2: Order = {
      Quantity: 50,
      Action: new OrderActionBuy()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([buy1, sell1, buy2]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([]);
    expect(result.partialAtEnd).toEqual([buy1,sell1, buy2]);
  });

  it('should handle a multiple short/cover orders (incomplete) as partial at end', async () => {
    const short1: Order = {
      Quantity: 100,
      Action: new OrderActionSellShort()
    } as any;
    const cover1: Order = {
      Quantity: 50,
      Action: new OrderActionBuyToCover()
    } as any;
    const short2: Order = {
      Quantity: 50,
      Action: new OrderActionSellShort()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([short1, cover1, short2]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([]);
    expect(result.partialAtEnd).toEqual([short1, cover1, short2]);
  });

  it('should handle a buy then sell completing a trade', async () => {
    const buyOrder: Order = {
      Quantity: 100,
      Action: new OrderActionBuy()
    } as any;
    const sellOrder: Order = {
      Quantity: 100,
      Action: new OrderActionSell()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([buyOrder, sellOrder]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([[buyOrder, sellOrder]]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('should handle a sell short then buy to cover completing a trade', async () => {
    const sellShortOrder: Order = {
      Quantity: 50,
      Action: new OrderActionSellShort()
    } as any;
    const buyToCoverOrder: Order = {
      Quantity: 50,
      Action: new OrderActionBuyToCover()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([sellShortOrder, buyToCoverOrder]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([[sellShortOrder, buyToCoverOrder]]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('should handle multiple buy/sells completing a trade', async () => {
    const buyOrder: Order = {
      Quantity: 100,
      Action: new OrderActionBuy()
    } as any;
    const buyOrder2: Order = {
      Quantity: 50,
      Action: new OrderActionBuy()
    } as any;
    const sellOrder1: Order = {
      Quantity: 80,
      Action: new OrderActionSell()
    } as any;
    const sellOrder2: Order = {
      Quantity: 70,
      Action: new OrderActionSell()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([buyOrder, buyOrder2, sellOrder1, sellOrder2]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([[buyOrder, buyOrder2, sellOrder1, sellOrder2]]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('should handle multiple short/covers completing a trade', async () => {
    const short1: Order = {
      Quantity: 100,
      Action: new OrderActionSellShort()
    } as any;
    const short2: Order = {
      Quantity: 50,
      Action: new OrderActionSellShort()
    } as any;
    const buyToCoverOrder1: Order = {
      Quantity: 80,
      Action: new OrderActionBuyToCover()
    } as any;
    const buyToCoverOrder2: Order = {
      Quantity: 70,
      Action: new OrderActionBuyToCover()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([short1, short2, buyToCoverOrder1, buyToCoverOrder2]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([[short1, short2, buyToCoverOrder1, buyToCoverOrder2]]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('partial before valid long', async () => {
    const sell1: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;
    const buy1: Order = {
      Quantity: 100,
      Action: new OrderActionBuy()
    } as any;
    const sell2: Order = {
      Quantity: 100,
      Action: new OrderActionSell()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([sell1, buy1, sell2]);
    expect(result.partialAtStart).toEqual([sell1]);
    expect(result.completedTrades).toEqual([[buy1, sell2]]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('partial after valid long', async () => {
    const buy1: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const sell1: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;
    const buy2: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([buy1, sell1, buy2]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([[buy1, sell1]]);
    expect(result.partialAtEnd).toEqual([buy2]);
  });

  it('partial before valid short', async () => {
    const buyToCover1: Order = {
      Quantity: 10,
      Action: new OrderActionBuyToCover()
    } as any;
    const short2: Order = {
      Quantity: 10,
      Action: new OrderActionSellShort()
    } as any;
    const buyToCover3: Order = {
      Quantity: 10,
      Action: new OrderActionBuyToCover()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([buyToCover1, short2, buyToCover3]);
    expect(result.partialAtStart).toEqual([buyToCover1]);
    expect(result.completedTrades).toEqual([[short2, buyToCover3]]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('partial after valid short', async () => {
    const short1: Order = {
      Quantity: 10,
      Action: new OrderActionSellShort()
    } as any;
    const buyToCover2: Order = {
      Quantity: 10,
      Action: new OrderActionBuyToCover()
    } as any;
    const short3: Order = {
      Quantity: 10,
      Action: new OrderActionSellShort()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([short1, buyToCover2, short3]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([[short1, buyToCover2]]);
    expect(result.partialAtEnd).toEqual([short3]);
  });

  it('should handle incomplete long with complete short', async () => {
    const sell1: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;
    const sellShortOrder: Order = {
      Quantity: 100,
      Action: new OrderActionSellShort()
    } as any;
    const buyToCoverOrder: Order = {
      Quantity: 100,
      Action: new OrderActionBuyToCover()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([sell1, sellShortOrder, buyToCoverOrder]);
    expect(result.partialAtStart).toEqual([sell1]);
    expect(result.completedTrades).toEqual([[sellShortOrder, buyToCoverOrder]]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('should handle incomplete short with complete long', async () => {
    const buyToCover1: Order = {
      Quantity: 10,
      Action: new OrderActionBuyToCover()
    } as any;
    const buy1: Order = {
      Quantity: 100,
      Action: new OrderActionBuy()
    } as any;
    const sell1: Order = {
      Quantity: 100,
      Action: new OrderActionSell()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([buyToCover1, buy1, sell1]);
    expect(result.partialAtStart).toEqual([buyToCover1]);
    expect(result.completedTrades).toEqual([[buy1, sell1]]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('should handle multiple trades with no partials (buy/sell)', async () => {
    const buy1: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const sell1: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;
    const buy2: Order = {
      Quantity: 20,
      Action: new OrderActionBuy()
    } as any;
    const sell2: Order = {
      Quantity: 20,
      Action: new OrderActionSell()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([buy1, sell1, buy2, sell2]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([[buy1, sell1], [buy2, sell2]]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('should handle multiple trades with no partials (short/cover)', async () => {
    const sell1: Order = {
      Quantity: 10,
      Action: new OrderActionSellShort()
    } as any;
    const buy1: Order = {
      Quantity: 10,
      Action: new OrderActionBuyToCover()
    } as any;
    const sell2: Order = {
      Quantity: 20,
      Action: new OrderActionSellShort()
    } as any;
    const buy2: Order = {
      Quantity: 20,
      Action: new OrderActionBuyToCover()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([sell1, buy1, sell2, buy2]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([[sell1, buy1], [sell2, buy2]]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('should handle multiple trades with no partials (buy/sell then short/cover)', async () => {
    const buy1: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const sell1: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;
    const sell2: Order = {
      Quantity: 20,
      Action: new OrderActionSellShort()
    } as any;
    const buy2: Order = {
      Quantity: 20,
      Action: new OrderActionBuyToCover()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([buy1, sell1, sell2, buy2]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([[buy1, sell1], [sell2, buy2]]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('should handle multiple trades with no partials (short/cover then buy/sell)', async () => {
    const short1: Order = {
      Quantity: 20,
      Action: new OrderActionSellShort()
    } as any;
    const cover1: Order = {
      Quantity: 20,
      Action: new OrderActionBuyToCover()
    } as any;
    const buy2: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const sell2: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;

    const result = await TradeImport.ProcessTradesForSymbolTest([short1, cover1, buy2, sell2]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([[buy2, sell2], [short1, cover1]]);  // code returns long orders first
    expect(result.partialAtEnd).toEqual([]);
  });

  it('should handle mixed longs and shorts, no partials', async () => {
    const buy1: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const sell2: Order = {
      Quantity: 20,
      Action: new OrderActionSellShort()
    } as any;
    const sell1: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;
    const buy2: Order = {
      Quantity: 20,
      Action: new OrderActionBuyToCover()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([buy1, sell2, sell1, buy2]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([[buy1, sell1], [sell2, buy2]]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('should handle mixed shorts and long, no partials', async () => {

    const sell1: Order = {
      Quantity: 20,
      Action: new OrderActionSellShort()
    } as any;
    const buy2: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const buy1: Order = {
      Quantity: 20,
      Action: new OrderActionBuyToCover()
    } as any;
    const sell2: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;

    const result = await TradeImport.ProcessTradesForSymbolTest([sell1, buy2, buy1, sell2]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([[buy2, sell2], [sell1, buy1]]); // longs go first
    expect(result.partialAtEnd).toEqual([]);
  });

  it('should handle multiple trades and partial at end', async () => {
    const buy1: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const sell1: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;
    const buy2: Order = {
      Quantity: 20,
      Action: new OrderActionBuy()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([buy1, sell1, buy2]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([[buy1, sell1]]);
    expect(result.partialAtEnd).toEqual([buy2]);
  });

  it('should handle partials for both directions (long first)', async () => {
    const buy: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const sellShort: Order = {
      Quantity: 10,
      Action: new OrderActionSellShort()
    } as any;
    const result = await TradeImport.ProcessTradesForSymbolTest([buy, sellShort]);
    expect(result.partialAtStart).toEqual([]);
    expect(result.completedTrades).toEqual([]); 
    expect(result.partialAtEnd).toEqual([buy, sellShort]);
  });

  it('should handle partials for both directions (short first)', async () => {
    const buyToCover: Order = {
      Quantity: 10,
      Action: new OrderActionBuyToCover()
    } as any;
    const buy: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;

    const result = await TradeImport.ProcessTradesForSymbolTest([buyToCover, buy]);
    expect(result.partialAtStart).toEqual([buyToCover]);
    expect(result.completedTrades).toEqual([]); 
    expect(result.partialAtEnd).toEqual([buy]); 
  });

  it('should throw error if a sell closes more than the buy quantity for a valid trade (long)', async () => {

    const buy1: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const sell1: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;
    const buy2: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const sell2: Order = {
      Quantity: 20,
      Action: new OrderActionSell()
    } as any;

    try {
      const mockHasExistingTrades = true;
      await TradeImport.ProcessTradesForSymbolTest([buy1, sell1, buy2, sell2],mockHasExistingTrades);
    } catch (error) {
      // Error expected
      return;
    }
    throw new Error('Expected error was not thrown');
  });

  it('should throw error if a sell closes more than the buy quantity for a valid trade (short)', async () => {
    const sell1: Order = {
      Quantity: 10,
      Action: new OrderActionSellShort()
    } as any;
    const buy1: Order = {
      Quantity: 10,
      Action: new OrderActionBuyToCover()
    } as any;
    const sell2: Order = {
      Quantity: 10,
      Action: new OrderActionSellShort()
    } as any;
    const buy2: Order = {
      Quantity: 20,
      Action: new OrderActionBuyToCover()
    } as any;

    try {
      const mockHasExistingTrades = true;
      await TradeImport.ProcessTradesForSymbolTest([sell1, buy1, sell2, buy2], mockHasExistingTrades);
    } catch (error) {
      // Error expected
      return;
    }
    throw new Error('Expected error was not thrown');
  });

  it('detect the start of a trade after several partials (long)', async () => {
    const buyPartial1: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const buyPartial2: Order = {
      Quantity: 20,
      Action: new OrderActionBuy()
    } as any;
    const sellPartial3: Order = {
      Quantity: 35,
      Action: new OrderActionSell()
    } as any;
    const buyValid1: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const sellValid2: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;
    const buyValid3: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const sellValid4: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;

    const result = await TradeImport.ProcessTradesForSymbolTest([buyPartial1, buyPartial2, sellPartial3, buyValid1, sellValid2, buyValid3, sellValid4]);
    expect(result.partialAtStart).toEqual([buyPartial1, buyPartial2, sellPartial3]);
    expect(result.completedTrades).toEqual([[buyValid1, sellValid2], [buyValid3, sellValid4]]); 
    expect(result.partialAtEnd).toEqual([]); // longs go first
  });

  it('detect the start of a trade after several partials (short)', async () => {
    const shortPartial1: Order = {
      Quantity: 10,
      Action: new OrderActionSellShort()
    } as any;
    const shortPartial2: Order = {
      Quantity: 20,
      Action: new OrderActionSellShort()
    } as any;
    const coverPartial3: Order = {
      Quantity: 35,
      Action: new OrderActionBuyToCover()
    } as any;
    const shortValid1: Order = {
      Quantity: 10,
      Action: new OrderActionSellShort()
    } as any;
    const coverValid2: Order = {
      Quantity: 10,
      Action: new OrderActionBuyToCover()
    } as any;
    const shortValid3: Order = {
      Quantity: 10,
      Action: new OrderActionSellShort()
    } as any;
    const coverValid4: Order = {
      Quantity: 10,
      Action: new OrderActionBuyToCover()
    } as any;

    const result = await TradeImport.ProcessTradesForSymbolTest([shortPartial1, shortPartial2, coverPartial3, shortValid1, coverValid2, shortValid3, coverValid4]);
    expect(result.partialAtStart).toEqual([shortPartial1, shortPartial2, coverPartial3]);
    expect(result.completedTrades).toEqual([[shortValid1, coverValid2], [shortValid3, coverValid4]]); 
    expect(result.partialAtEnd).toEqual([]); 
  });

  it('should detect the start of trades after several partials for both long and short directions in one sequence', async () => {
    // Long partials 
    const buyPartial1: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const buyPartial2: Order = {
      Quantity: 20,
      Action: new OrderActionBuy()
    } as any;
    const sellPartial3: Order = {
      Quantity: 35,
      Action: new OrderActionSell()
    } as any;

    // Short partials 
    const shortPartial1: Order = {
      Quantity: 10,
      Action: new OrderActionSellShort()
    } as any;
    const shortPartial2: Order = {
      Quantity: 20,
      Action: new OrderActionSellShort()
    } as any;
    const coverPartial3: Order = {
      Quantity: 35,
      Action: new OrderActionBuyToCover()
    } as any;

    // Long valids
    const buyValid1: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const sellValid2: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;
    const buyValid3: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const sellValid4: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;

    // Short valids
    const shortValid1: Order = {
      Quantity: 10,
      Action: new OrderActionSellShort()
    } as any;
    const coverValid2: Order = {
      Quantity: 10,
      Action: new OrderActionBuyToCover()
    } as any;
    const shortValid3: Order = {
      Quantity: 10,
      Action: new OrderActionSellShort()
    } as any;
    const coverValid4: Order = {
      Quantity: 10,
      Action: new OrderActionBuyToCover()
    } as any;

    // Combine all orders into one sequence: long partials, long valids, short partials, short valids
    const allOrders: Order[] = [
      buyPartial1, buyPartial2, sellPartial3, 
      shortPartial1, shortPartial2, coverPartial3, 
      buyValid1, sellValid2, buyValid3, sellValid4,
      shortValid1, coverValid2, shortValid3, coverValid4
    ];

    const result = await TradeImport.ProcessTradesForSymbolTest(allOrders);
    expect(result.partialAtStart).toEqual([
      buyPartial1, buyPartial2, sellPartial3,
      shortPartial1, shortPartial2, coverPartial3
    ]);
    expect(result.completedTrades).toEqual([
      [buyValid1, sellValid2],
      [buyValid3, sellValid4],
      [shortValid1, coverValid2],
      [shortValid3, coverValid4]
    ]);
    expect(result.partialAtEnd).toEqual([]);
  });

  it('should not get faked out on detecting partial with an embedded valid trade', async () => {

    // Partial, invalid at start
    const sell1: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;

    // Valid trade?
    const buy2: Order = {
      Quantity: 10,
      Action: new OrderActionBuy()
    } as any;
    const sell3: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;

    // Nope, fake out. All invalid.
    const sell4: Order = {
      Quantity: 10,
      Action: new OrderActionSell()
    } as any;

    const result = await TradeImport.ProcessTradesForSymbolTest([sell1, buy2, sell3, sell4]);
    expect(result.partialAtStart).toEqual([sell1,buy2,sell3,sell4]);
    expect(result.completedTrades).toEqual([]); 
    expect(result.partialAtEnd).toEqual([]); 
  });

});
