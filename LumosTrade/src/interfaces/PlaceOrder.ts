import { OrderAction } from './OrderAction';
import { OrderStatus } from './OrderStatus';

export class PlaceOrder {
  public PlaceOrderID?: number | null;
  public AccountID: number;
  public BrokerOrderID?: number | null;
  public Symbol: string;
  public Action: OrderAction;
  public Price: number;
  public Quantity: number;
  public OrderAmount: number;
  public Status?: OrderStatus | null;
  public LastUpdated?: Date | null;

  constructor(accountId: number, symbol: string, action: OrderAction, price: number, quantity: number,
    status?: OrderStatus | null, brokerOrderId?: number | null, placeOrderId?: number | null, lastUpdated?: Date | null) {
    this.PlaceOrderID = placeOrderId ?? null;
    this.AccountID = accountId;
    this.BrokerOrderID = brokerOrderId ?? null;
    this.Symbol = symbol;
    this.Action = action;
    this.Price = price;
    this.Quantity = quantity;
    this.OrderAmount = price * quantity;
    this.Status = status ?? null;
    this.LastUpdated = lastUpdated ?? null;

    if (!this.AccountID || Number.isNaN(Number(this.AccountID))) {
      throw new Error('AccountID must be provided');
    }

    if (!this.Symbol || this.Symbol.trim().length === 0) {
      throw new Error('Symbol must be provided');
    }

    if (this.Price == null || Number.isNaN(Number(this.Price)) || this.Price < 0) {
      throw new Error('Price must be a non-negative number');
    }

    if (this.Quantity == null || Number.isNaN(Number(this.Quantity)) || this.Quantity <= 0) {
      throw new Error('Quantity must be a positive number');
    }
  }
}
