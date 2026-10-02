import { RepairOneOpenTrade } from '../processor/repair/RepairOneOpenTrade';
import { TradeImport } from '../processor/Trade/TradeImport';
import { Order } from '../interfaces/Order';
import { OrderActionBuy } from '../interfaces/OrderAction';

const AAPL_SYMBOL = 'AAPL';

// createDeltaOrder is private; access it directly to test the repair order without a database.
const createDeltaOrder = (orders: Order[], currentQty: number, currentTotalCost: number, targetQty: number, targetPrice: number | null): Order =>
  (RepairOneOpenTrade as any).createDeltaOrder(orders, currentQty, currentTotalCost, targetQty, targetPrice);

// Matches the Orders query sort: ExecutedTime ASC, BrokerOrderID ASC (MySQL sorts NULL first).
const sortLikeDb = (orders: Order[]): Order[] =>
  [...orders].sort((a, b) =>
    (a.ExecutedTime.getTime() - b.ExecutedTime.getTime()) ||
    ((a.BrokerOrderID ?? -Infinity) - (b.BrokerOrderID ?? -Infinity)));

describe('RepairOneOpenTrade.createDeltaOrder', () => {

  it('should place the repair order after the last order', () => {
    const lastTime = new Date('2023-01-01T10:00:00Z');
    const existingOrder = new Order(1, 1, AAPL_SYMBOL, lastTime, new OrderActionBuy(), 10, 10, 100, 0, null, 100, 7);
    const deltaOrder = createDeltaOrder([existingOrder], 10, 100, 5, null);
    expect(deltaOrder.ExecutedTime.getTime()).toBe(lastTime.getTime() + 1000);
    expect(deltaOrder.Action.IsSell()).toBe(true);
    expect(deltaOrder.Quantity).toBe(5);
  });

  it('should produce a valid order sequence when reducing a single-order trade', async () => {
    const existingOrder = new Order(1, 1, AAPL_SYMBOL, new Date('2023-01-01T10:00:00Z'), new OrderActionBuy(), 10, 10, 100, 0, null, 100, 7);
    const deltaOrder = createDeltaOrder([existingOrder], 10, 100, 5, null);

    const orders = sortLikeDb([existingOrder, deltaOrder]);
    expect(orders[orders.length - 1]).toBe(deltaOrder);

    const { partialAtStart, completedTrades, partialAtEnd } = await TradeImport.ProcessTradesForSymbolTest(orders, true);
    expect(partialAtStart).toHaveLength(0);
    expect(completedTrades).toHaveLength(0);
    expect(partialAtEnd).toEqual([existingOrder, deltaOrder]);
  });

});
