import { DataAccess } from '../../database/DataAccess';
import { Account } from '../../interfaces/Account';
import { AccountHistory } from '../../interfaces/AccountHistory';
import { RollupPeriod, RollupPeriodCache, RollupUtils } from '../../utils/RollupUtils';
import { BrokerClient } from '../../interfaces/BrokerClient';
import { AccountRollupCalculator } from './AccountRollupCalculator';
import { SimulationContext } from '../Simulator/SimulationContext';

/**
 * Process current-day account rollups by loading balance from broker.
 * This class is designed to be called once per day to update the most recent rollup periods.
 * For historical backfill, use AccountRollupBackfill instead.
 */
export class AccountRollup {

  /**
   * Process the latest rollups for the current day or simulated date for a given account.
   * Loads the current balance from the broker and updates all rollup periods.
   */
  public static async Process(broker: BrokerClient, account: Account, simContext?: SimulationContext): Promise<void> {
    const accountId = account.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required for account rollup processing');
    }
    console.log(`Processing account rollups for account ${account.Name} (${accountId})...`);

    // Build cache of current and previous rollup periods for all rollup types
    const periodCache = RollupUtils.BuildPeriodCache(simContext);

    // Get the most recent balance from the broker
    const brokerBalance = await broker.GetAccountBalance(account);
    if (brokerBalance?.totalAccountValue == null) {
      console.log(`Broker balance totalAccountValue is null for AccountID=${accountId}, skipping rollup processing.`);
      return;
    }
    const currentBalance = brokerBalance.totalAccountValue;

    // Get the daily period to determine the current date (automatically adjusts around weekends)
    const dailyPeriod = periodCache.get(RollupPeriod.Daily)!;
    const currentDate = dailyPeriod.current[1];

    // Load all daily AccountHistory records covering the date range needed for all rollup periods
    const { rangeStart, rangeEnd } = this.getDailyRecordDateRange(periodCache);
    const dailyRecords = await DataAccess.GetDailyAccountHistoryInRange(accountId, rangeStart, rangeEnd);

    // Get the orders executed count for today
    const ordersExecutedToday = await DataAccess.GetOrdersExecutedCount(accountId, currentDate);

    // Process each rollup period
    for (const period of [RollupPeriod.Daily, RollupPeriod.Weekly, RollupPeriod.Monthly]) {
      const cache = periodCache.get(period)!;
      await this.processAccountForPeriod(
        account,
        period,
        cache,
        currentBalance,
        dailyRecords,
        ordersExecutedToday
      );
    }

    // Refresh account all-time high statistics
    await DataAccess.RefreshAccountATH(account);

    console.log(`Account rollup processing complete for account ${account.Name} (${accountId}).`);
  }

  /**
   * Determine the date range needed to load daily records for all rollup periods.
   * Returns the earliest start date and latest end date across all periods.
   */
  private static getDailyRecordDateRange(periodCache: Map<RollupPeriod, RollupPeriodCache>): { rangeStart: string; rangeEnd: string } {
    const weeklyPeriod = periodCache.get(RollupPeriod.Weekly)!;
    const monthlyPeriod = periodCache.get(RollupPeriod.Monthly)!;
    
    // Use the earliest start date (weekly can start before monthly)
    const rangeStart = weeklyPeriod.current[0] < monthlyPeriod.current[0] 
      ? weeklyPeriod.current[0] 
      : monthlyPeriod.current[0];
    
    // Use the latest end date (monthly end is always >= weekly end)
    const rangeEnd = monthlyPeriod.current[1];
    
    return { rangeStart, rangeEnd };
  }

  /**
   * Process a single account for a specific rollup period.
   */
  private static async processAccountForPeriod(
    account: Account,
    rollupPeriod: RollupPeriod,
    periodCache: RollupPeriodCache,
    currentBalance: number,
    dailyRecords: AccountHistory[],
    ordersExecutedToday: number
  ): Promise<void> {
    const accountId = account.AccountID!;
    const currentPeriodStart = periodCache.current[0];
    const currentPeriodEnd = periodCache.current[1];

    // Load current and previous AccountHistory records for this rollup period
    // Note: currentHistory can be null if we're calculating a new day for the first time
    const currentHistory: AccountHistory | null  = 
      await DataAccess.GetAccountHistoryForPeriod(
        accountId,
        rollupPeriod,
        currentPeriodEnd
    );
    const previousHistory: AccountHistory | null = 
      await DataAccess.GetAccountHistoryForPeriodPrior(
        accountId,
        rollupPeriod,
        currentPeriodEnd
    );

    // Calculate values for the current period
    const history = AccountRollupCalculator.CalculateRollupValues(
      account,
      rollupPeriod,
      currentPeriodStart,
      currentPeriodEnd,
      currentBalance,
      currentHistory,
      previousHistory,
      dailyRecords,
      ordersExecutedToday
    );

    // Upsert to database
    await DataAccess.UpsertAccountHistory(account, history);
  }
}
