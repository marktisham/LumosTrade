import { DataAccess } from '../../database/DataAccess';
import { Account } from '../../interfaces/Account';
import { BrokerClient } from '../../interfaces/BrokerClient';
import { BrokerManager } from '../BrokerManager';
import { Order } from '../../interfaces/Order';
import { Trade } from '../../interfaces/Trade';
import { Quote } from '../../interfaces/Quote';
import { OrderImport } from '../Order/OrderImport';
import { QuoteImport } from '../Order/QuoteImport';
import { RoundUtil } from '../../utils/RoundUtil';
import { SimulationContext } from '../Simulator/SimulationContext';


export class TradeImport {

  public static async Import(broker: BrokerClient, account: Account): Promise<void> {

    // Load quotes scoped to this account
    const quotesMap = await DataAccess.GetQuotesMap(account);

    // 1. Load all orders that need trades for the account
    const orders: Order[] = await DataAccess.GetOrdersForTrades(account);

    // 2. Group orders by symbol
    const symbolOrderMap: Map<string, Order[]> = new Map();
    for (const order of orders) {
      if (!symbolOrderMap.has(order.Symbol)) {
        symbolOrderMap.set(order.Symbol, []);
      }
      symbolOrderMap.get(order.Symbol)!.push(order);
    }

    // 3. Process trades for each symbol using the new return structure
    let errorCount = 0;
    let tradeCount = 0;
    console.log(`Processing trades for account ${account.Name} (${account.AccountID}), found ${symbolOrderMap.size} symbols from ${orders.length} orders. `);
    for (const [symbol, symbolOrders] of symbolOrderMap.entries()) {
      try {
        // Identify groups of orders for each trade type
        const { partialAtStart, completedTrades, partialAtEnd } = await this.processTradesForSymbol(symbolOrders, account, symbol, false, false);
        
        // Then create/update the trades in the database with the latest rollup values
        const quote = quotesMap.get(symbol) ?? null;
        await this.processTradeResults(account, partialAtStart, completedTrades, partialAtEnd, quote);

        tradeCount += completedTrades.length;
      } catch (error) {
        errorCount++;
        console.error(`Error processing trades for account ${account.Name} (${account.AccountID}), symbol ${symbol}:`, error);
      }
    }
    if(errorCount >0) {
      console.error(`Found ${tradeCount} new trades for account ${account.Name} (${account.AccountID}). ${errorCount} errors encountered.`);
    } else {
      console.log(`Found ${tradeCount} new trades for account ${account.Name} (${account.AccountID}).`);
    }
  }

  // Entry point for unit tests
  public static async ProcessTradesForSymbolTest(orders: Order[], mockHasExistingTrades : boolean = false): Promise<{
    partialAtStart: Order[];
    completedTrades: Order[][];
    partialAtEnd: Order[];
  }> {
    const mockAccount = (id: number = 42) => ({ AccountID: id } as any);
    const DEFAULT_SYMBOL = 'AAPL';
    return await this.processTradesForSymbol(orders, mockAccount(), DEFAULT_SYMBOL, true, mockHasExistingTrades);
  }

  private static async processTradesForSymbol(orders: Order[], account: Account, symbol: string, 
                        mockForTests: boolean, mockHasExistingTrades: boolean): Promise<{
    partialAtStart: Order[];
    completedTrades: Order[][];
    partialAtEnd: Order[];
  }> {

    // Process long and short trades separately, then combine results
    const { longOrders, shortOrders } = Order.SplitOrdersByType(orders);
    const longResult = await this.processTradesForDirection(longOrders, account, symbol, mockForTests, mockHasExistingTrades);
    const shortResult = await this.processTradesForDirection(shortOrders, account, symbol, mockForTests, mockHasExistingTrades);

    return {
      partialAtStart: [...longResult.partialAtStart, ...shortResult.partialAtStart],
      completedTrades: [...longResult.completedTrades, ...shortResult.completedTrades],
      partialAtEnd: [...longResult.partialAtEnd, ...shortResult.partialAtEnd]
    };
  }

  private static async processTradesForDirection(orders: Order[], account: Account, symbol: string, mockForTests: boolean, mockHasExistingTrades: boolean) : Promise<{
    partialAtStart: Order[];
    completedTrades: Order[][];
    partialAtEnd: Order[]; 
  }> {
    const result = {
      partialAtStart: [] as Order[],
      completedTrades: [] as Order[][],
      partialAtEnd: [] as Order[]
    };
    if (orders.length === 0) {
      return result;
    }
    let longTrade = orders[0].Action.IsLongTrade();

    // Find starting index, skipping any partials that were cut off by the import
    let startIndex = await this.findIndexOfFirstTrade(orders, account, symbol, mockForTests, mockHasExistingTrades);
    if (startIndex == null) {
      // We didn't find a valid first trade setup. Split out the incompletes from the possible open trades.
      this.splitInvalidOrders(orders, result);
      return result;
    } 

    // We found a valid start index, push all the pre-amble into an incomplete partial state.
    for (let i = 0; i < startIndex; i++) {
      result.partialAtStart.push(orders[i]);
    }  

    // Should be valid trades moving forward from here.
    let tradeQuantity: number = 0;
    let ordersInCurrentTrade: Order[] = [];
    for (let i = startIndex; i < orders.length; i++) {
      const order = orders[i];
      ordersInCurrentTrade.push(order);
      tradeQuantity += this.addOrderQuantity(order);

      // Partial quantity may result in rounding errors, correct for this.
      tradeQuantity = RoundUtil.RoundNearZero(tradeQuantity);
      if(tradeQuantity === 0) {
        console.log(`Trade detection for ${symbol}, account ${account.AccountID}, OrderID ${order.OrderID ?? '(none)'} rounded trade quantity to zero to complete the trade.`);
      }

      // We complete a trade when quantity returns to zero
      if (tradeQuantity === 0) {
        result.completedTrades.push(ordersInCurrentTrade);
        ordersInCurrentTrade = [];
      }

      // Validate trade direction consistency
      else if(longTrade && tradeQuantity < 0) {
        throw new Error(`Inconsistent order sequence for long trades, ${symbol} - BrokerOrderID:${order.BrokerOrderID ?? 'null'}.`);
      }
      else if(!longTrade && tradeQuantity > 0) {
        throw new Error(`Inconsistent order sequence for short trades, ${symbol} - BrokerOrderID:${order.BrokerOrderID ?? 'null'}.`);
      }
    }

    // Any remaining orders are partials at the end
    result.partialAtEnd = ordersInCurrentTrade;

    return result;
  }

  private static async findIndexOfFirstTrade(orders: Order[], account: Account, symbol: string, mockForTests: boolean, mockHasExistingTrades: boolean) : Promise<number | null> {
    // If there are already trades for this account and symbol, return 0
    if (account && symbol && !mockForTests) {
      const tradeCount = await DataAccess.GetTradeCountForSymbol(account, symbol, orders[0].Action.IsLongTrade());
      if (tradeCount > 0) {
        return 0;
      }
    } else if (mockForTests && mockHasExistingTrades) {
      // Simulate existing trades for testing
      return 0;
    }

    // First import for this symbol. We're looking for any sequence of successive
    // orders that add to zero quantity. This is not perfect, but is "good enough"
    // for most reasonable cases, and we can handle exceptional cases by 
    // manually marking the orders as incomplete in the DB. (Should only need
    // to be done on initial import)
    let longTrade = orders[0].Action.IsLongTrade();
    for(let startIndex=0; startIndex<orders.length; startIndex++) {
      let tradeQuantity: number = 0;
      for(let i=startIndex; i<orders.length; i++) {
        tradeQuantity += this.addOrderQuantity(orders[i]);

        // Partial quantity may result in rounding errors, correct for this.
        tradeQuantity = RoundUtil.RoundNearZero(tradeQuantity);
        if(tradeQuantity === 0) {

          // possible start index, just make sure the remaining trades are not invalid.
          let followingOrdersQty=0;
          let valid : boolean = true;

          for(let j=i+1; j<orders.length; j++) {
            followingOrdersQty += this.addOrderQuantity(orders[j]);
            followingOrdersQty = RoundUtil.RoundNearZero(followingOrdersQty);
            if(this.testForValidQuantity(longTrade, followingOrdersQty) == false) {
              valid = false;
              break;  
            }   
          }
          if(valid) {   
            return startIndex;
          }
        }
        else if(this.testForValidQuantity(longTrade, tradeQuantity) == false) {
          break;  
        }        
      }
    }

    return null;
  }

  /**
   * Split orders into invalid partials at start and valid open trades at end
   */
  private static splitInvalidOrders(orders: Order[], result: {
    partialAtStart: Order[];
    completedTrades: Order[][];
    partialAtEnd: Order[];
  }): void {
    let firstValidIndex = this.findFirstValidIndexInPartial(orders);
    if (firstValidIndex == null) {
      // All incomplete/partials
      for (let i = 0; i < orders.length; i++) {
        result.partialAtStart.push(orders[i]);
      }
    } else {
      for (let i = 0; i < firstValidIndex; i++) {
        result.partialAtStart.push(orders[i]);
      }
      for (let i = firstValidIndex; i < orders.length; i++) {
        result.partialAtEnd.push(orders[i]);
      }
    }
  }

  // Scan a list of partial orders to strip out any invalid leading orders
  private static findFirstValidIndexInPartial(orders: Order[]) : number | null 
  { 
    let tradeQuantity: number = 0;
    let firstValidIndex: number | null = null;
    for(let i=0; i<orders.length; i++) {
      tradeQuantity += this.addOrderQuantity(orders[i]);
      if(this.testForValidQuantity(orders[0].Action.IsLongTrade(), tradeQuantity) == false) {
        // Invalid order, reset
        firstValidIndex = null;
        tradeQuantity = 0;
      } else {
        if(firstValidIndex == null) {
          firstValidIndex = i;
        }
      }
    }
    return firstValidIndex;
  }


  private static testForValidQuantity(longTrade: boolean, tradeQuantity: number): boolean {
    if(longTrade && tradeQuantity < 0) {
      return false;
    }
    if(!longTrade && tradeQuantity > 0) {
      return false;
    }
    return true;
  }

  private static addOrderQuantity(order: Order): number {
    if(order.Action.IsBuy() || order.Action.IsBuyToCover()) {
      return order.Quantity;
    } else {
      return -order.Quantity;
    }
  }

  /**
   * Update database with the results of the trade processing
   */
  private static async processTradeResults(
    account: Account,
    partialAtStart: Order[],
    completedTrades: Order[][],
    partialAtEnd: Order[],
    quote: Quote | null
  ): Promise<void> {

    // Mark partial orders at the start as incomplete
    if (partialAtStart.length > 0) {
      await DataAccess.OrdersSetIncomplete(account, partialAtStart);
    }

    // Mark all the completed trades
    for (const tradeOrders of completedTrades) {
      // Rollup the trade information
      let trade: Trade = Trade.CreateClosedTradeFromOrders(tradeOrders, account, quote);

      // Create or update the trade in the DB 
      trade = await DataAccess.UpsertTrade(account, trade);

      // And assign that trade to the orders
      await DataAccess.TradeSetForOrders(account, trade, tradeOrders);
    }

    // Handle the partials at end as open trades
    if (partialAtEnd.length > 0) {
      // Only process the partial if we found a new order.
      if(Order.HasOrderWithoutTrade(partialAtEnd)) {
        let trade: Trade = Trade.CreateOpenTradeFromOrders(partialAtEnd, account, quote);

        // Create or update the trade in the DB 
        trade = await DataAccess.UpsertTrade(account, trade);

        await DataAccess.TradeSetForOrders(account, trade, partialAtEnd);
      }
    }

    return;
  }
}







 


