
export abstract class OrderAction {
  abstract GetActionType(): string;

  static CreateFromActionType(action: string): OrderAction | undefined {
    switch ((action || '').toUpperCase()) {
      case 'BUY':
        return new OrderActionBuy();
      case 'SELL':
        return new OrderActionSell();
      case 'BUY_TO_COVER':
        return new OrderActionBuyToCover();
      case 'SELL_SHORT':
        return new OrderActionSellShort();
      default:
        return undefined;
    }
  }

  public IsLongTrade(): boolean {
    return this.IsBuy() || this.IsSell();
  }

  public IsShortTrade(): boolean {
    return this.IsSellShort() || this.IsBuyToCover();
  }

  IsBuy(): boolean {
    return this instanceof OrderActionBuy;
  }
  IsSell(): boolean {
    return this instanceof OrderActionSell;
  }
  IsBuyToCover(): boolean {
    return this instanceof OrderActionBuyToCover;
  }
  IsSellShort(): boolean {
    return this instanceof OrderActionSellShort;
  }
}

// (removed duplicate OrderAction class)

export class OrderActionSellShort extends OrderAction {
  GetActionType(): string {
    return 'SELL_SHORT';
  }
}

export class OrderActionBuyToCover extends OrderAction {
  GetActionType(): string {
    return 'BUY_TO_COVER';
  }
}

export class OrderActionBuy extends OrderAction {
  GetActionType(): string {
    return 'BUY';
  }
}

export class OrderActionSell extends OrderAction {
  GetActionType(): string {
    return 'SELL';
  }
}
