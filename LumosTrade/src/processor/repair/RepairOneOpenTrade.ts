import { DataAccess } from '../../database/DataAccess';
import { Order } from '../../interfaces/Order';
import { OrderAction, OrderActionBuy, OrderActionSell, OrderActionBuyToCover, OrderActionSellShort } from '../../interfaces/OrderAction';
import { Account } from '../../interfaces/Account';
import { Position } from '../../interfaces/Position';
import { RoundUtil } from '../../utils/RoundUtil';
import { Trade } from '../..';


export class RepairOneOpenTrade {

  public static async Repair(account : Account, trade: Trade, targetQty: number, targetPrice: number | null) : Promise<boolean> {
    let orders: Order[] = await DataAccess.GetOrdersForTrade(account, trade);
    if (orders.length === 0) {
      throw new Error(`No orders found for trade ${trade.TradeID} in account ${account.Name} (${account.AccountID}).`);
    }
    if (targetQty<0) {
      throw new Error(`Invalid target quantity ${targetQty} for trade ${trade.TradeID} in account ${account.Name} (${account.AccountID}).`);
    }
    else if (targetQty > 0 && (targetPrice === null || targetPrice === undefined || targetPrice<=0))  {
        throw new Error(`Invalid target cost ${targetPrice} for trade ${trade.TradeID} in account ${account.Name} (${account.AccountID}).`);
    }

    let tradeTotals = this.calculateTradeTotals(orders);
    let deltaOrder: Order = this.createDeltaOrder(orders, tradeTotals.currentQty, tradeTotals.currentTotalCost, targetQty, targetPrice);
    await DataAccess.OrderInsert(account, deltaOrder);

    console.log(`Repair inserted manually adjusted order: AccountID ${account.AccountID}, Symbol: ${deltaOrder.Symbol}, Action: ${deltaOrder.Action.GetActionType()}, Qty: ${deltaOrder.Quantity}, Price: ${deltaOrder.ExecutedPrice.toFixed(4)}, Date: ${deltaOrder.ExecutedTime.toISOString()}. Trade target qty: ${targetQty}, target price: ${targetPrice}.`);
    return true;
}


  /**
   * Calculate running quantity and total cost for the trade.
   */
  private static calculateTradeTotals(orders: Order[]): { currentQty: number; currentTotalCost: number } {
    let currentQty = 0;
    let currentTotalCost = 0;

    for (const order of orders) {
      if (order.Action.IsBuy() || order.Action.IsBuyToCover()) {
        currentQty += order.Quantity;
        currentTotalCost += order.Quantity * order.ExecutedPrice;
      } else if (order.Action.IsSell() || order.Action.IsSellShort()) {
        currentQty -= order.Quantity;
        currentTotalCost -= order.Quantity * order.ExecutedPrice;
      }
    }

    return { currentQty, currentTotalCost };
  }

  /**
   * Create the delta order to adjust the position.
   */
  private static createDeltaOrder(
    orders: Order[],
    currentQty: number,
    currentTotalCost: number,
    targetQty: number,
    targetPrice: number | null
  ): Order {

    // Determine trade direction from the first order in the sequence (start of trade)
    const lastOrder= orders[orders.length - 1];
    const isSequenceLong = lastOrder.Action.IsLongTrade();
    const { action, adjustmentQty } = this.determineActionAndQuantity(currentQty, targetQty, targetQty - currentQty, isSequenceLong);

    let deltaOrderPrice = lastOrder.ExecutedPrice; 
    if(targetPrice !=null) {
        // Calculate the price needed to arrive at the target per-share price
        deltaOrderPrice = (targetPrice * targetQty - currentTotalCost) / adjustmentQty;
        deltaOrderPrice = Math.abs(deltaOrderPrice); 
        deltaOrderPrice = RoundUtil.RoundForDB(deltaOrderPrice)!;
    }

    const executedTime = new Date(lastOrder.ExecutedTime.getTime());
    const fees = 0;
    const orderAmount = adjustmentQty * deltaOrderPrice;

    let deltaOrder : Order = new Order(
      null,
      null,
      lastOrder.Symbol,
      executedTime,
      action,
      adjustmentQty,
      deltaOrderPrice,
      orderAmount,
      fees
    );
    deltaOrder.ManuallyAdjusted = true;
    deltaOrder.AdjustedComment = `Incremental repair order to reach target trade quantity ${targetQty} as of ${executedTime.toISOString()}`;
    return deltaOrder;
  }

  /**
   * Determine the action and quantity for the delta order.
   */
  private static determineActionAndQuantity(
    currentQty: number,
    targetQty: number,
    deltaQty: number,
    isSequenceLong: boolean
  ): { action: OrderAction; adjustmentQty: number } {
    let action: OrderAction;
    let adjustmentQty: number;
    
    // Sequence is homogeneous (all long or all short). Choose action based on sequence direction.
    if (isSequenceLong) {
      // For a long sequence: positive delta -> BUY, negative delta -> SELL
      action = deltaQty > 0 ? new OrderActionBuy() : new OrderActionSell();
    } else {
      // For a short sequence: negative delta -> SELL_SHORT, positive delta -> BUY_TO_COVER
      action = deltaQty < 0 ? new OrderActionSellShort() : new OrderActionBuyToCover();
    }

    adjustmentQty = Math.abs(deltaQty);
    // normalize to 4 decimal places
    adjustmentQty = RoundUtil.RoundForDB(adjustmentQty)!;
    return { action, adjustmentQty };
  }

  // Create a missing order to match an open position on the broker.
  public static async CreateMissingOrder(account : Account, position: Position) : Promise<boolean> {
    if(position == null || position.Quantity == 0) {
        throw new Error(`Invalid position quantity ${position.Quantity} for symbol ${position.Symbol} in account ${account.Name} (${account.AccountID}).`);
    }

    // Create a buy order to match the open position
    let isLong : boolean = position.Quantity > 0;
    let qty : number = Math.abs(position.Quantity);
    let order : Order = new Order(
      null,
      null,
      position.Symbol,
      new Date(), // Use current date/time for the order
      isLong ? new OrderActionBuy() : new OrderActionSellShort(),
      qty,
      position.Price,
      qty * position.Price,
      0 // Assume no fees for this synthetic order
    );
    order.ManuallyAdjusted = true;
    order.AdjustedComment = `Synthetic order created to match open position for symbol ${position.Symbol} as of ${new Date().toISOString()}`;
    await DataAccess.OrderInsert(account, order);

    console.log(`Created missing order to match open position: AccountID ${account.AccountID}, Symbol: ${order.Symbol}, Action: ${order.Action.GetActionType()}, Qty: ${order.Quantity}, Price: ${order.ExecutedPrice.toFixed(4)}, Date: ${order.ExecutedTime.toISOString()}.`);
    return true;
  }

}
