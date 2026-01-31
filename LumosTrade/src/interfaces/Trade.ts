import { or } from '@google-cloud/datastore';
import { RoundUtil } from '../utils/RoundUtil';
import { Account } from './Account';
import { Order } from './Order';
import { OrderAction } from './OrderAction';
import { Quote } from './Quote';
export class Trade {
  TradeID: number | null;
  AccountID: number;
  Symbol: string;
  LongTrade: boolean;
  WinningTrade: boolean | null;
  OpenDate: Date;
  CloseDate: Date | null;
  DurationMS: bigint | null;
  Closed: boolean;
  OpenQuantity: number;
  BreakEvenPrice: number;
  CurrentPrice: number | null;
  TotalGain: number | null;
  TotalGainPct: number | null;
  LargestRisk: number;
  TotalFees: number;
  TotalOrderCount: number;
  ManuallyAdjusted: boolean;
  CurrentPriceDateTime?: Date;
  CurrentCost: number | null;
  CurrentValue: number | null;
  RealizedGain: number | null;
  UnrealizedGain: number | null;
  AvgEntryPrice: number | null;
  AvgExitPrice: number | null;

  constructor(params: {
    TradeID?: number | null;
    AccountID: number;
    Symbol: string;
    LongTrade: boolean;
    WinningTrade: boolean | null;
    OpenDate: Date;
    CloseDate: Date | null;
    DurationMS: bigint | null;
    Closed: boolean;
    OpenQuantity: number;
    BreakEvenPrice: number;
    CurrentPrice: number | null;
    TotalGain: number | null;
    TotalGainPct: number | null;
    LargestRisk: number;
    TotalFees: number;
    TotalOrderCount: number;
    ManuallyAdjusted?: boolean;
    CurrentPriceDateTime?: Date;
    CurrentCost?: number | null;
    CurrentValue?: number | null;
    RealizedGain?: number | null;
    UnrealizedGain?: number | null;
    AvgEntryPrice?: number | null;
    AvgExitPrice?: number | null;
  }) {
    this.TradeID = params.TradeID ?? null;
    this.AccountID = params.AccountID;
    this.Symbol = params.Symbol;
    this.LongTrade = params.LongTrade;
    this.WinningTrade = params.WinningTrade;
    this.OpenDate = params.OpenDate;
    this.CloseDate = params.CloseDate;
    this.DurationMS = params.DurationMS;
    this.Closed = params.Closed;
    this.OpenQuantity = params.OpenQuantity;
    this.BreakEvenPrice = params.BreakEvenPrice;
    this.CurrentPrice = params.CurrentPrice;
    this.TotalGain = params.TotalGain;
    this.TotalGainPct = params.TotalGainPct;
    this.LargestRisk = params.LargestRisk;
    this.TotalFees = params.TotalFees;
    this.TotalOrderCount = params.TotalOrderCount;
    this.ManuallyAdjusted = params.ManuallyAdjusted ?? false;
    this.CurrentPriceDateTime = params.CurrentPriceDateTime;
    this.CurrentCost = params.CurrentCost ?? null;
    this.CurrentValue = params.CurrentValue ?? null;
    this.RealizedGain = params.RealizedGain ?? null;
    this.UnrealizedGain = params.UnrealizedGain ?? null;
    this.AvgEntryPrice = params.AvgEntryPrice ?? null;
    this.AvgExitPrice = params.AvgExitPrice ?? null;
  }

  public static FromTradeID(tradeID: number): Trade {
    return new Trade({
      TradeID: tradeID,
      AccountID: 0,
      Symbol: '',
      LongTrade: false,
      WinningTrade: null,
      OpenDate: new Date(),
      CloseDate: null,
      DurationMS: null,
      Closed: false,
      OpenQuantity: 0,
      BreakEvenPrice: 0,
      CurrentPrice: null,
      TotalGain: null,
      TotalGainPct: null,
      LargestRisk: 0,
      TotalFees: 0,
      TotalOrderCount: 0,
      ManuallyAdjusted: false
    });
  }

  public Round(): void {
    // Round OpenQuantity to match DB precision (decimal(13,4))
    this.OpenQuantity = RoundUtil.RoundForDB(this.OpenQuantity)!;
    if (this.BreakEvenPrice != null) {
      this.BreakEvenPrice = RoundUtil.RoundForDB(this.BreakEvenPrice)!;
    }
    if (this.CurrentPrice != null) {
      this.CurrentPrice = RoundUtil.RoundForDB(this.CurrentPrice)!;
    }
    if (this.TotalGain != null) {
      this.TotalGain = RoundUtil.RoundForDB(this.TotalGain)!;
    }
    if (this.TotalGainPct != null) {
      this.TotalGainPct = RoundUtil.RoundForDB(this.TotalGainPct)!;
    }
    this.LargestRisk = RoundUtil.RoundForDB(this.LargestRisk)!;
    this.TotalFees = RoundUtil.RoundForDB(this.TotalFees)!;
  }

  private static createInitialTradeFromOrders(orders: Order[], account: Account): Trade {
    if(!orders || orders.length === 0) {
      throw new Error('Order list must not be empty');
    }
    if(account==null) {
      throw new Error('Account must not be null');
    }
    const firstOrder: Order = orders[0];

    // If any orders were adjusted, then the trade is considered manually adjusted
    const manuallyAdjusted = orders.some(o => (o as any).ManuallyAdjusted === true);

    return new Trade({
      AccountID: account.AccountID ?? 0,
      TradeID: firstOrder.TradeID ?? null,
      Symbol: firstOrder.Symbol,
      LongTrade: firstOrder.Action.IsLongTrade(),
      WinningTrade: null,
      OpenDate: firstOrder.ExecutedTime,
      CloseDate: null,
      DurationMS: null,
      Closed: false,
      OpenQuantity: 0,
      BreakEvenPrice: 0,
      CurrentPrice: 0,
      TotalGain: 0,
      TotalGainPct: 0,
      LargestRisk: 0,
      TotalFees: 0,
      TotalOrderCount: orders.length,
      ManuallyAdjusted: manuallyAdjusted,
      RealizedGain: 0,
      UnrealizedGain: 0,
      AvgEntryPrice: 0,
      AvgExitPrice: 0
    });
  }

  /**
   * Core calculation logic for trade metrics based on orders.
   * 
   * @param trade - Trade object to populate with calculated values
   * @param orders - Array of all orders for this trade
   * @param currentPrice - Current market price (for open trades) or null
   */
  private static calculateTradeMetrics(trade: Trade, orders: Order[], currentPrice: number | null): void {
    // State variables for tracking trade metrics
    let totalEnteredQty = 0;
    let totalExitedQty = 0;
    let totalEntryCost = 0;
    let totalExitProceeds = 0;
    let tradeCost = 0;

    trade.TotalFees = 0;
    trade.LargestRisk = 0;
    trade.OpenQuantity = 0;

    // Direction multiplier: 1 for long, -1 for short
    const directionMultiplier = trade.LongTrade ? 1 : -1;

    // Process all orders to calculate state variables
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const isLastOrder = i === orders.length - 1;

      if(order.Symbol !== trade.Symbol) {
        throw new Error(`Order symbol ${order.Symbol} does not match trade symbol ${trade.Symbol}`);
      }

      // Track entry orders (Buys for Long / Sells for Short)
      if((trade.LongTrade && order.Action.IsBuy()) || (!trade.LongTrade && order.Action.IsSellShort())) {
        totalEnteredQty += order.Quantity;
        totalEntryCost += order.Quantity * order.ExecutedPrice;
        // For long trades: add to OpenQuantity; for short trades: subtract (making it more negative)
        trade.OpenQuantity += order.Quantity * directionMultiplier;
        tradeCost += Math.abs(order.OrderAmount);
      } 
      // Track exit orders (Sells for Long / Buys for Short)
      else if((trade.LongTrade && order.Action.IsSell()) || (!trade.LongTrade && order.Action.IsBuyToCover())) {
        totalExitedQty += order.Quantity;
        totalExitProceeds += order.Quantity * order.ExecutedPrice;
        // For long trades: subtract from OpenQuantity; for short trades: add (making it less negative)
        trade.OpenQuantity -= order.Quantity * directionMultiplier;
        tradeCost -= Math.abs(order.OrderAmount);
      }

      trade.TotalFees += order.Fees;
      trade.LargestRisk = Math.max(tradeCost, trade.LargestRisk);

      // Compensate for rounding errors on last order
      if (isLastOrder && Math.abs(trade.OpenQuantity) > 0 && Math.abs(trade.OpenQuantity) < 0.0001) {
        const rounded = RoundUtil.RoundNearZero(trade.OpenQuantity);
        if (rounded === 0) {
          console.log(`Trade order rollups: Adjusting ${order.Symbol} trade quantity from ${trade.OpenQuantity.toFixed(17)} to zero due to rounding error.`);
          trade.OpenQuantity = 0;
        }
      }

      // Validate open quantity consistency
      if(trade.LongTrade && trade.OpenQuantity < 0) {
        throw new Error('Long trade cannot have negative open quantity');
      }
      if(!trade.LongTrade && trade.OpenQuantity > 0) {
        throw new Error('Short trade cannot have positive open quantity');
      }
    }

    // Calculate derived metrics
    // Average Entry Price
    trade.AvgEntryPrice = totalEnteredQty > 0 ? totalEntryCost / totalEnteredQty : 0;

    // Average Exit Price (only if we have exits)
    trade.AvgExitPrice = totalExitedQty > 0 ? totalExitProceeds / totalExitedQty : null;

    // Realized Gain calculation
    // For a fully or partially closed position, this is the gain from the exited quantity
    if (totalExitedQty > 0 && trade.AvgExitPrice !== null) {
      // Use the formula: Total_Exited_Qty * (Average_Exit_Price - Average_Entry_Price) * Direction_Multiplier
      trade.RealizedGain = totalExitedQty * (trade.AvgExitPrice - trade.AvgEntryPrice) * directionMultiplier;
    } else {
      trade.RealizedGain = 0;
    }

    // Unrealized Gain: Current_Open_Qty * (Current_Market_Price - Average_Entry_Price) * Direction_Multiplier
    if (currentPrice !== null && Math.abs(trade.OpenQuantity) > 0) {
      trade.UnrealizedGain = Math.abs(trade.OpenQuantity) * (currentPrice - trade.AvgEntryPrice) * directionMultiplier;
    } else {
      trade.UnrealizedGain = null;
    }

    // Total Gain: Realized Gain + Unrealized Gain (or just Realized if no current price)
    if (trade.UnrealizedGain !== null) {
      trade.TotalGain = trade.RealizedGain + trade.UnrealizedGain;
    } else if (Math.abs(trade.OpenQuantity) > 0) {
      // Open trade without current price: TotalGain is null
      trade.TotalGain = null;
    } else {
      // Closed trade: use direct calculation for better precision
      // This matches the old implementation: sum of sell proceeds minus sum of buy costs
      if (trade.LongTrade) {
        trade.TotalGain = totalExitProceeds - totalEntryCost;
      } else {
        trade.TotalGain = totalEntryCost - totalExitProceeds;
      }
    }

    // Break-Even Price: This is tradeCost / abs(OpenQuantity) for both long and short
    // tradeCost represents the net capital at risk in the trade at this point
    if (Math.abs(trade.OpenQuantity) > 0) {
      trade.BreakEvenPrice = tradeCost / Math.abs(trade.OpenQuantity);
      // Ensure non-negative
      if (trade.BreakEvenPrice < 0) {
        trade.BreakEvenPrice = 0;
      }
    } else {
      // Closed trade: use average entry price as the effective entry
      trade.BreakEvenPrice = trade.AvgEntryPrice;
    }

    // Always store the most recent price used for this calculation
    // (this logic won't be called again once we process the closed trade the first time,
    // hence we can store a point in time snapshot).
    trade.CurrentPrice = currentPrice;

    // Winning Trade
    if (trade.TotalGain !== null) {
      trade.WinningTrade = trade.TotalGain >= 0;
    } else {
      trade.WinningTrade = null;
    }

    // Total Gain Pct
    if (trade.TotalGain !== null && trade.LargestRisk > 0) {
      trade.TotalGainPct = trade.TotalGain / trade.LargestRisk;
    } else {
      trade.TotalGainPct = null;
    }
  }

  //
  // Create an open Trade
  //

  public static CreateOpenTradeFromOrders(orders: Order[], account: Account, quote: Quote | null): Trade {
    if(!orders || orders.length == 0) {
        throw new Error('At least one order is needed for an open trade');
    }
    if(account==null) {
        throw new Error('Account must not be null');
    }

    // Default trade object
    let trade = this.createInitialTradeFromOrders(orders, account);
    trade.Closed = false;

    // Calculate all trade metrics using common logic
    const currentPrice = quote ? quote.Price : null;
    if(quote && quote.Symbol !== trade.Symbol) {
      throw new Error(`Quote symbol ${quote.Symbol} does not match trade symbol ${trade.Symbol}`);
    }

    this.calculateTradeMetrics(trade, orders, currentPrice);

    // Validate open trade requirements
    if(trade.OpenQuantity === 0) {
       throw new Error('Open trade must have open quantity');
    }

    // Round all the results
    trade.Round();

    return trade;
  }

  //
  // Create a closed Trade
  //

  public static CreateClosedTradeFromOrders(orders: Order[], account: Account, quote: Quote | null): Trade {
    if(!orders || orders.length < 2) {
        throw new Error('At least two orders are required to create a closed trade');
    }
    if(account==null) {
        throw new Error('Account must not be null');
    }

    let firstOrder: Order = orders[0];
    let lastOrder: Order =orders[orders.length - 1];
    if(lastOrder.ExecutedTime < firstOrder.ExecutedTime) {
        console.warn('Orders ' + (firstOrder.BrokerOrderID ?? 'null') + ',' + (lastOrder.BrokerOrderID ?? 'null') + ' are not sorted by ExecutedTime in ascending order. Still proceeding.');
    }

    // Initial trade properties 
    let trade = this.createInitialTradeFromOrders(orders, account);
    trade.Closed = true;
    trade.CloseDate = lastOrder.ExecutedTime;
    trade.DurationMS = BigInt(trade.CloseDate.getTime() - trade.OpenDate.getTime());

    // Calculate all trade metrics using common logic
    const currentPrice = quote ? quote.Price : null;
    if(quote && quote.Symbol !== trade.Symbol) {
      throw new Error(`Quote symbol ${quote.Symbol} does not match trade symbol ${trade.Symbol}`);
    }

    this.calculateTradeMetrics(trade, orders, currentPrice);

    // Validate closed trade requirements
    if(trade.OpenQuantity !== 0) {
        throw new Error('Closed trade cannot have non-zero open quantity');
    }
    if(trade.TotalGain === null) {  
      throw new Error('Trade.TotalGain must be non-null for closed trades');
    }

    // Round all the results
    trade.Round();

    return trade;
  }

  /**
   * Map a list of trades into a symbol-keyed map of trades.
   * Returns an object whose keys are symbol strings and values are arrays of Trade objects.
   */
  public static MapSymbolToTrades(trades: Trade[] | null | undefined): Record<string, Trade[]> {
    const out: Record<string, Trade[]> = {};
    if (!trades || trades.length === 0) return out;

    for (const t of trades) {
      const sym = (t?.Symbol ?? '').toString();
      if (!sym) continue;
      if (!out[sym]) out[sym] = [];
      out[sym].push(t);
    }
    return out;
  }
}