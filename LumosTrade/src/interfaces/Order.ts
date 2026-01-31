import { OrderAction } from './OrderAction';
import { OrderStatus } from './OrderStatus';

export class Order {

  OrderID?: number | null;
  TradeID?: number | null;
  BrokerOrderID: number | null;
  BrokerOrderStep: number | null;
  Symbol: string;
  ExecutedTime: Date;
  Action: OrderAction;
  Quantity: number;
  ExecutedPrice: number;
  OrderAmount: number;
  Fees: number;
  ManuallyAdjusted?: boolean;
  AdjustedComment?: string | null;
  BrokerTransactionID?: number | null;
  Status?: OrderStatus | null;
  IncompleteTrade: boolean;

  constructor(
    BrokerOrderID: number | null,
    BrokerOrderStep: number | null,
    Symbol: string,
    ExecutedTime: Date,
    Action: OrderAction,
    Quantity: number,
    ExecutedPrice: number,
    OrderAmount: number,
    Fees: number,
    Status?: OrderStatus | null,
    OrderID?: number | null,
    TradeID?: number | null,
    filledOrdersOnly: boolean = true
  ) {
    this.BrokerOrderID = BrokerOrderID;
    this.BrokerOrderStep = BrokerOrderStep;
    this.Symbol = Symbol;
    this.ExecutedTime = ExecutedTime;
    this.Action = Action;
    this.Quantity = Quantity;
    this.ExecutedPrice = ExecutedPrice;
    this.OrderAmount = OrderAmount;
    this.Fees = Fees;
    this.OrderID = OrderID ?? null;
    this.TradeID = TradeID ?? null;
    this.IncompleteTrade = false;
    this.Status = Status ?? null;

    // Throw when caller requests filled orders only (default). Pass filledOrdersOnly=false to allow zero-quantity / non-filled orders when reconciling broker data.
    if (this.Quantity <= 0 && filledOrdersOnly) {
      throw new Error(`Order quantity must be positive. Got ${this.Quantity}`);
    }

    // Validate order amount with tolerance for floating point rounding errors
    const EPSILON = 1.00;
    if (Math.abs(this.OrderAmount - (this.ExecutedPrice * this.Quantity)) > EPSILON) {
      throw new Error(`Order amount ${this.OrderAmount} does not equal ExecutedPrice * Quantity (${this.ExecutedPrice} * ${this.Quantity}) for OrderID ${this.OrderID}`);
    }
  }

  // Given a list of orders, return just the long orders and just the short orders
  public static SplitOrdersByType(orders: Order[]): { longOrders: Order[]; shortOrders: Order[] } {
    const longOrders: Order[] = [];
    const shortOrders: Order[] = [];
    for (const order of orders) {
      if (order.Action.IsLongTrade()) {
        longOrders.push(order);
      } else if (order.Action.IsShortTrade()) {
        shortOrders.push(order);
      } else {
        throw new Error(`Order ${order.BrokerOrderID ?? 'unknown'} has unknown trade type.`);
      }
    }
    return { longOrders, shortOrders };
  }

  /**
   * Return true if any order in the provided list does not have a TradeID set.
   * Throws an error if the provided list is empty.
   */
  public static HasOrderWithoutTrade(orders: Order[]): boolean {
    if (!orders || orders.length === 0) {
      throw new Error('Order list must not be empty');
    }

    for (const o of orders) {
      if (o.TradeID == null) return true;
    }

    return false;
  }
}
