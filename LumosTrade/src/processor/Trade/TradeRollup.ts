import { DataAccess } from '../../database/DataAccess';
import { Account } from '../../interfaces/Account';
import { TradeHistory } from '../../interfaces/TradeHistory';
import { RollupPeriod, RollupPeriodCache, RollupUtils } from '../../utils/RollupUtils';
import { DateUtils } from '../../utils/DateUtils';
import { Trade } from '../../interfaces/Trade';
import { SimulationContext } from '../Simulator/SimulationContext';

export class TradeRollup {

  /**
   * Process the latest rollups for the current day or simulated date.
   */
  public static async Process(account: Account, simContext?: SimulationContext): Promise<void> {
    const accountId = account.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required for trade rollup processing');
    }
    console.log(`Processing trade rollups for account ${account.Name} (${accountId})...`);

    // Build cache of current and previous rollup periods for all rollup types
    const periodCache = RollupUtils.BuildPeriodCache(simContext);

    // Get trades that are open or recently closed
    const dailyPeriod = periodCache.get(RollupPeriod.Daily)!;
    const closedOnOrAfter = dailyPeriod.current[1]; // End of daily period (most recent business day)
    const trades = await DataAccess.GetTradesForRollup(account, closedOnOrAfter);
    console.log(`Found ${trades.length} trades that were open or closed after ${closedOnOrAfter} to process for account ${account.Name} (${accountId}).`);

    // Process each trade
    for (const trade of trades) {
      if (trade.TradeID == null) {
        throw new Error('Trade.TradeID is required for trade rollup processing');
      }

      // Process each rollup period
      for (const period of [RollupPeriod.Daily, RollupPeriod.Weekly, RollupPeriod.Monthly]) {
        const cache = periodCache.get(period)!;
        await this.processTradeForPeriod(account, trade, period, cache);
      }
    }

    console.log(`Trade rollup processing complete for account ${account.Name} (${accountId}).`);
  }

  /**
   * Process a single trade for a specific rollup period.
   */
  private static async processTradeForPeriod(
    account: Account,
    trade: Trade,
    rollupPeriod: RollupPeriod,
    periodCache: RollupPeriodCache
  ): Promise<void> {
    const accountId = account.AccountID!;
    const tradeId = trade.TradeID!;
    const currentPeriodEnd = periodCache.current[1];
    const previousPeriodEnd = periodCache.previous[1];

    // Step 3.a.a: Load TradeHistory records for current and previous periods
    const currentHistory = await DataAccess.GetTradeHistoryForPeriod(
      accountId,
      tradeId,
      rollupPeriod,
      currentPeriodEnd
    );

    const previousHistory = await DataAccess.GetTradeHistoryForPeriod(
      accountId,
      tradeId,
      rollupPeriod,
      previousPeriodEnd
    );

    // Calculate new values for current period
    const totalGain = trade.TotalGain ?? 0;
    const currentCost = trade.CurrentCost ?? 0
    const currentValue = trade.CurrentValue ?? 0

    // Always recalc latest pct if we can to avoid bugs from cumulative drift.
    const totalGainPct =  currentCost > 0 ?  totalGain / currentCost : trade.TotalGainPct ?? 0;     
    const previousTotalGain = previousHistory?.TotalGain ?? 0;
    const periodGain = totalGain - previousTotalGain;
    
    let periodGainPct: number | null = null;
    if(previousHistory!=null && previousHistory.CurrentValue != null && previousHistory.CurrentValue !== 0) {
      periodGainPct = (periodGain / previousHistory.CurrentValue);    
    } else {
      periodGainPct = 0;
    }

    const isClosed = trade.Closed ?? false;
    const currentPriceAtPeriodEnd = trade.CurrentPrice ?? null;
    const openQuantityAtPeriodEnd = isClosed ? null : (trade.OpenQuantity ?? null);
    const breakevenPriceAtPeriodEnd = isClosed ? null : (trade.BreakEvenPrice ?? null);
    const realizedGainAtPeriodEnd = trade.RealizedGain ?? null;
    const unrealizedGainAtPeriodEnd = trade.UnrealizedGain ?? null;

    // Create or update TradeHistory object
    const history = new TradeHistory(
      currentHistory?.TradeHistoryID ?? null,
      accountId,
      tradeId,
      rollupPeriod,
      new Date(currentPeriodEnd),
      periodGain,
      periodGainPct,
      totalGain,
      totalGainPct,
      currentValue,
      currentCost,
      currentPriceAtPeriodEnd,
      openQuantityAtPeriodEnd,
      breakevenPriceAtPeriodEnd,
      realizedGainAtPeriodEnd,
      unrealizedGainAtPeriodEnd
    );

    // Upsert to database
    await DataAccess.UpsertTradeHistory(history);

    return;
  }
}
