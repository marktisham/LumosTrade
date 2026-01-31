import { Order } from '../../interfaces/Order';
import { OrderActionBuy, OrderActionSell, OrderActionSellShort, OrderActionBuyToCover } from '../../interfaces/OrderAction';
import { OrderStatus } from '../../interfaces/OrderStatus';
import { Account } from '../../interfaces/Account';
import { Trade } from '../../interfaces/Trade';
import { Quote } from '../../interfaces/Quote';
import { DataAccess } from '../../database/DataAccess';
import { DateUtils } from '../../utils/DateUtils';
import { SimulateQuotes } from './SimulateQuotes';

// Forward declaration to avoid circular dependency
interface ISimulatorClient {
  GetBrokerID(): number;
  GetEffectiveDate(): Date;
}

// Account configuration for order simulation
interface AccountConfig {
  brokerId: number;
  brokerAccountId: number;
  symbols: string[];
  dailyTradeChancePct: number;
  maxOrdersPerDay: number;
  shortTradeChancePct: number;
  maxOrderSize: number;
}

// Simulated account registry - compact format for easy editing
const SIMULATED_ACCOUNTS: AccountConfig[] = [
  { brokerId: 1, brokerAccountId: 1, symbols: ['AAPL', 'MSFT', 'TSLA','QQQ','ARKK','SOXL','IBIT','TQQQ'], dailyTradeChancePct: 75, maxOrdersPerDay: 8, shortTradeChancePct: 20, maxOrderSize: 1000 },
  { brokerId: 1, brokerAccountId: 2, symbols: ['AAPL', 'MSFT', 'TSLA','SPY','QQQ','F','SCHD','BRK.B'], dailyTradeChancePct: 25, maxOrdersPerDay: 2, shortTradeChancePct: 5, maxOrderSize: 2000 },
  { brokerId: 2, brokerAccountId: 1, symbols: ['SPY','QQQ','SCHD','BRK.B','MSFT'], dailyTradeChancePct: 15, maxOrdersPerDay: 1, shortTradeChancePct: 0, maxOrderSize: 4000 },
];

/**
 * Handles order simulation for simulated broker accounts.
 * 
 * Algorithm:
 * 1. Look up account configuration for the given broker/account
 * 2. Roll random number to determine if trading occurs today (based on dailyTradeChancePct)
 * 3. If trading occurs, roll for number of orders to create (1 to maxOrdersPerDay)
 * 4. Query database for orders already executed today - if at/above target, exit
 * 5. Load existing open trades and initialize in-flight trade tracking map
 * 6. For each order to create:
 *    a. Increment execution time by 1 second to ensure proper ordering
 *    b. Pick random symbol from configured symbol list
 *    c. Check in-flight trade tracking for existing position (updated as orders are generated)
 *    d. If existing position, use its direction; roll 50/50 for entry vs exit
 *    e. If no position, roll random for long vs short based on shortTradeChancePct
 *    f. Roll random order size (up to maxOrderSize)
 *    g. Get current quote price for symbol (cached during loop)
 *    h. Calculate quantity = orderSize / price, rounded to whole number (minimum 1 share)
 *    i. If exit order, cap quantity at current in-flight open quantity
 *    j. Update in-flight trade tracking: increase qty on entry, decrease on exit, remove when qty reaches 0
 *    k. Validate that exit orders never result in negative quantity (throw error if violated)
 *    l. Determine order action based on trade direction and entry/exit
 *    m. Create Order object with calculated values
 * 7. Return array of generated orders
 */
export class SimulateOrders {
  /**
   * Simulate orders for a specific account.
   * Randomly generates orders based on configured probabilities.
   */
  static async SimulateOrders(
    simulatorClient: ISimulatorClient,
    account: Account
  ): Promise<Order[]> {
    // Step 1: Look up account configuration
    const config = this.getAccountConfig(simulatorClient.GetBrokerID(), account);
    if (!config) {
      console.error(`SimulateOrders: No configuration found for BrokerID=${simulatorClient.GetBrokerID()} AccountID=${account.BrokerAccountID}`);
      return [];
    }

    // Step 2: Roll to see if trading occurs today
    if (Math.random() * 100 >= config.dailyTradeChancePct) {
      return [];
    }

    // Step 3: Roll for number of orders to create today
    const targetOrderCount = Math.floor(Math.random() * config.maxOrdersPerDay) + 1;

    // Step 4: Check how many orders already executed today
    const currentDate = simulatorClient.GetEffectiveDate();
    const todayDateString = DateUtils.ToDateStringInTimeZone(currentDate, 'America/New_York');
    if (!todayDateString) {
      console.error(`SimulateOrders: Failed to convert current date to string in timezone America/New_York`);
      return [];
    }
    const existingOrderCount = await DataAccess.GetOrdersExecutedCount(account.AccountID!, todayDateString);
    
    if (existingOrderCount >= targetOrderCount) {
      return [];
    }

    const ordersToCreate = targetOrderCount - existingOrderCount;

    // Step 5: Initialize in-flight trade tracking with existing open trades
    // Map<symbol, { isLong: boolean, openQty: number }>
    const inFlightTrades = new Map<string, { isLong: boolean; openQty: number }>();
    
    const openTrades = await DataAccess.GetOpenTrades(account);
    for (const trade of openTrades) {
      if (inFlightTrades.has(trade.Symbol)) {
        throw new Error(`SimulateOrders: Multiple open trades found for symbol ${trade.Symbol} in account ${account.AccountID}. This should never happen.`);
      }
      inFlightTrades.set(trade.Symbol, {
        isLong: trade.LongTrade,
        openQty: Math.abs(trade.OpenQuantity)
      });
    }

    // Quote cache to avoid repeated lookups
    const quoteCache = new Map<string, Quote>();

    const orders: Order[] = [];

    // Step 6: Create each order
    for (let i = 0; i < ordersToCreate; i++) {
      // Step 6a: Use effective date but with current time of day
      const effectiveDate = simulatorClient.GetEffectiveDate();
      const now = new Date();
      const executedTime = new Date(
        effectiveDate.getFullYear(),
        effectiveDate.getMonth(),
        effectiveDate.getDate(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
        now.getMilliseconds()
      );
      
      // Wait 5ms to ensure subsequent orders in tight loop have small time difference
      await new Promise(resolve => setTimeout(resolve, 5));
      
      const order = await this.generateOrder(
        simulatorClient,
        account,
        config,
        quoteCache,
        inFlightTrades,
        executedTime
      );
      if (order) {
        orders.push(order);
      }
    }

    return orders;
  }

  /**
   * Look up account configuration by broker ID and account.
   */
  private static getAccountConfig(brokerId: number, account: Account): AccountConfig | null {
    const brokerAccountId = account.BrokerAccountID ?? account.AccountID ?? null;
    if (brokerAccountId == null) {
      return null;
    }
    return SIMULATED_ACCOUNTS.find(
      c => c.brokerId === brokerId && c.brokerAccountId === brokerAccountId
    ) ?? null;
  }

  /**
   * Generate a single simulated order.
   */
  private static async generateOrder(
    simulatorClient: ISimulatorClient,
    account: Account,
    config: AccountConfig,
    quoteCache: Map<string, Quote>,
    inFlightTrades: Map<string, { isLong: boolean; openQty: number }>,
    executedTime: Date
  ): Promise<Order | null> {
    // Step 6b: Pick random symbol
    const symbol = config.symbols[Math.floor(Math.random() * config.symbols.length)];

    // Step 6c: Check in-flight tracking for existing position
    const inFlightTrade = inFlightTrades.get(symbol);
    let isLongTrade: boolean;
    let isEntry: boolean;

    // Step 6d-e: Determine trade direction and entry/exit
    if (inFlightTrade) {
      if(inFlightTrade.openQty <= 0) {
        throw new Error(`SimulateOrders: In-flight trade for ${symbol} has non-positive open quantity (${inFlightTrade.openQty}). This should never happen.`);
      }
      isLongTrade = inFlightTrade.isLong;

      // 50/50 shot of scaling in vs scaling out
      isEntry = Math.random() < 0.5;
    } else {
      isLongTrade = Math.random() * 100 >= config.shortTradeChancePct;

      // New trade, so always an entry
      isEntry = true;
    }

    // Step 6f: Generate random order size
    const orderSize = Math.random() * config.maxOrderSize;

    // Step 6g: Get current quote price (with caching)
    let quote = quoteCache.get(symbol);
    if (!quote) {
      const quotes = await SimulateQuotes.GetQuotes(simulatorClient, [symbol]);
      if (quotes.length === 0) {
        console.error(`SimulateOrders: Failed to get quote for ${symbol}`);
        return null;
      }
      quote = quotes[0];
      quoteCache.set(symbol, quote);
    }

    const price = quote.Price;

    // Step 6h: Calculate quantity (rounded to whole number, minimum 1 share)
    let quantity = Math.round(orderSize / price);
    if (quantity <= 0) {
      quantity = 1;
    }

    // Step 6i: Cap exit orders at current in-flight open quantity
    if (!isEntry && inFlightTrade) {
      const openQuantity = inFlightTrade.openQty;
      if (quantity > openQuantity) {
        quantity = openQuantity;
      }
    }

    // Step 6j-k: Update in-flight trade state and validate
    if (isEntry) {
      // Entry: increase open quantity
      const current = inFlightTrades.get(symbol) || { isLong: isLongTrade, openQty: 0 };
      inFlightTrades.set(symbol, {
        isLong: isLongTrade,
        openQty: current.openQty + quantity
      });
    } else {
      // Exit: decrease open quantity
      const current = inFlightTrades.get(symbol);
      if (current) {
        const newQty = current.openQty - quantity;
        
        // Validate quantity - should never go negative
        if (newQty < 0) {
          throw new Error(`SimulateOrders: Exit order for ${symbol} would result in negative quantity (${newQty}). Current: ${current.openQty}, Order: ${quantity}`);
        }
        
        if (newQty === 0) {
          // Trade fully closed, remove from in-flight tracking
          inFlightTrades.delete(symbol);
        } else {
          // Partial close
          inFlightTrades.set(symbol, {
            isLong: current.isLong,
            openQty: newQty
          });
        }
      }
    }

    // Step 6l: Determine order action based on trade direction and entry/exit
    let action;
    if (isLongTrade) {
      action = isEntry ? new OrderActionBuy() : new OrderActionSell();
    } else {
      action = isEntry ? new OrderActionSellShort() : new OrderActionBuyToCover();
    }

    const orderAmount = price * quantity;

    // Generate random fee (hardcoded 15% chance of having a fee between 0 and 1)
    const fees = Math.random() < 0.15 ? Math.random() : 0;

    // Generate unique BrokerOrderID combining account ID and timestamp to prevent collisions across accounts
    const accountId = account.AccountID || 0;
    const timestamp = executedTime.getTime();
    const brokerOrderId = parseInt(`${accountId}${timestamp}`);

    // Step 6m: Create Order object with calculated values
    const order = new Order(
      brokerOrderId,            // BrokerOrderID (timestamp in milliseconds)
      null,                     // BrokerOrderStep
      symbol,                   // Symbol
      executedTime,             // ExecutedTime (incremented by 1 second per order)
      action,                   // Action
      quantity,                 // Quantity
      price,                    // ExecutedPrice
      orderAmount,              // OrderAmount
      fees,                     // Fees
      OrderStatus.EXECUTED,     // Status
      null,                     // OrderID (null for new)
      null                      // TradeID (null for new)
    );

    return order;
  }
}
