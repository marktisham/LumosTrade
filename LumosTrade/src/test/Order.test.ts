import { Order } from '../interfaces/Order';
import { OrderActionBuy } from '../interfaces/OrderAction';
import { OrderStatus } from '../interfaces/OrderStatus';

describe('Order', () => {
  describe('constructor', () => {
    it('should construct an Order with all properties set correctly', () => {
      const brokerOrderID = 12345;
      const brokerOrderStep = 2;
      const symbol = 'TSLA';
      const executedTime = new Date('2024-05-15T14:30:00Z');
      const action = new OrderActionBuy();
      const quantity = 75;
      const executedPrice = 180.50;
      const orderAmount = 13537.5;
      const fees = 8.25;
      const status = OrderStatus.EXECUTED;
      const orderID = 999;
      const tradeID = 888;
      const filledOrdersOnly = true;

      const order = new Order(
        brokerOrderID,
        brokerOrderStep,
        symbol,
        executedTime,
        action,
        quantity,
        executedPrice,
        orderAmount,
        fees,
        status,
        orderID,
        tradeID,
        filledOrdersOnly
      );

      expect(order.BrokerOrderID).toBe(brokerOrderID);
      expect(order.BrokerOrderStep).toBe(brokerOrderStep);
      expect(order.Symbol).toBe(symbol);
      expect(order.ExecutedTime).toEqual(executedTime);
      expect(order.Action).toBe(action);
      expect(order.Quantity).toBe(quantity);
      expect(order.ExecutedPrice).toBe(executedPrice);
      expect(order.OrderAmount).toBe(orderAmount);
      expect(order.Fees).toBe(fees);
      expect(order.Status).toBe(status);
      expect(order.OrderID).toBe(orderID);
      expect(order.TradeID).toBe(tradeID);
      expect(order.IncompleteTrade).toBe(false);
    });

    it('should handle optional parameters with defaults', () => {
      const order = new Order(
        100,
        1,
        'AAPL',
        new Date('2024-01-01T10:00:00Z'),
        new OrderActionBuy(),
        50,
        150,
        7500,
        5
      );

      expect(order.Status).toBeNull();
      expect(order.OrderID).toBeNull();
      expect(order.TradeID).toBeNull();
      expect(order.IncompleteTrade).toBe(false);
    });

    it('should handle null values for BrokerOrderID and BrokerOrderStep', () => {
      const order = new Order(
        null,
        null,
        'NVDA',
        new Date('2024-06-01T09:00:00Z'),
        new OrderActionBuy(),
        25,
        400,
        10000,
        10
      );

      expect(order.BrokerOrderID).toBeNull();
      expect(order.BrokerOrderStep).toBeNull();
    });
  });
});
