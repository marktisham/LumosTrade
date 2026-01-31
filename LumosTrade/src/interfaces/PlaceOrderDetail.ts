import { OrderAction } from './OrderAction';

export class PlaceOrderDetail {
  ClientOrderID: number;
  Symbol: string;
  LimitPrice: number;
  Quantity: number;
  Action: OrderAction;

  constructor(ClientOrderID: number, Symbol: string, LimitPrice: number, Quantity: number, Action: OrderAction) {
    this.ClientOrderID = ClientOrderID;
    this.Symbol = Symbol;
    this.LimitPrice = LimitPrice;
    this.Quantity = Quantity;
    this.Action = Action;

    if (this.Quantity <= 0) {
      throw new Error(`Quantity must be positive. Got ${this.Quantity}`);
    }

    if (this.LimitPrice < 0) {
      throw new Error(`LimitPrice must be non-negative. Got ${this.LimitPrice}`);
    }

    if (!this.Action) {
      throw new Error(`Action must be provided`);
    }
  }
}
