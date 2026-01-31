export class PlaceOrderResponse {
  Symbol: string;
  BrokerOrderID: number;

  constructor(Symbol: string, BrokerOrderID: number) {
    this.Symbol = Symbol;
    this.BrokerOrderID = BrokerOrderID;

    if (!this.Symbol || this.Symbol.trim().length === 0) {
      throw new Error(`Symbol must be a non-empty string. Got '${this.Symbol}'`);
    }

    if (this.BrokerOrderID == null || Number.isNaN(Number(this.BrokerOrderID))) {
      throw new Error(`BrokerOrderID must be a number. Got ${this.BrokerOrderID}`);
    }
  }
}
