import { DataAccess } from '../../database/DataAccess';
import { Account } from '../../interfaces/Account';
import { AccountHistory } from '../../interfaces/AccountHistory';
import { RollupPeriod, RollupUtils } from '../../utils/RollupUtils';
import { LumosStateHelper } from '../../utils/LumosStateHelper';

/**
 * Shared calculation logic for account rollups.
 * Used by both AccountRollup (current day processing) and AccountRollupBackfill (historical recalculation).
 */
export class AccountRollupCalculator {

  /**
   * Calculate and populate values for an AccountHistory record for a specific rollup period.
   * This is the main calculation logic shared between current-day processing and backfill.
   */
  public static CalculateRollupValues(
    account: Account,
    rollupPeriod: RollupPeriod,
    periodStart: string,
    periodEnd: string,
    currentBalance: number,
    currentHistory: AccountHistory | null,
    previousHistory: AccountHistory | null,
    dailyRecords: AccountHistory[],
    ordersExecutedToday: number
  ): AccountHistory {
    
    // For aggregation totals, pull from the list of daily records within the period.
    const periodDailyRecords = dailyRecords.filter(r => {
      const recordDate = r.PeriodEnd.toISOString().substring(0, 10);
      return recordDate >= periodStart && recordDate <= periodEnd;
    });

    // Create or update the history record
    const history = this.createOrUpdateHistoryRecord(account, rollupPeriod, periodEnd, currentHistory);

    // Set balance and update time
    history.Balance = currentBalance;
    history.BalanceUpdateTime = new Date();

    // Aggregate transfer amounts and descriptions
    this.aggregateTransfers(history, rollupPeriod, periodDailyRecords);

    // Calculate balance change from previous period
    this.calculateBalanceChange(history, previousHistory);

    // Find and set invested amount
    const investedAmount = this.findInvestedAmount(periodDailyRecords, previousHistory);
    history.InvestedAmount = investedAmount;

    // Calculate net gain metrics
    this.calculateNetGain(history, currentBalance, investedAmount);

    // Calculate orders executed
    this.calculateOrdersExecuted(history, rollupPeriod, periodDailyRecords, periodEnd, ordersExecutedToday);

    return history;
  }

  /**
   * Create a new or return existing AccountHistory record for the period.
   */
  private static createOrUpdateHistoryRecord(
    account: Account,
    rollupPeriod: RollupPeriod,
    periodEnd: string,
    currentHistory: AccountHistory | null
  ): AccountHistory {
    if (currentHistory) {
      return currentHistory;
    }
    return new AccountHistory(
      account.AccountID!,
      rollupPeriod,
      new Date(periodEnd + 'T00:00:00.000Z'),
      null,
      null,
      null
    );
  }

  /**
   * Calculate balance change amount and percentage from previous period.
   */
  private static calculateBalanceChange(
    history: AccountHistory,
    previousHistory: AccountHistory | null
  ): void {
    const previousBalance = previousHistory?.Balance;
    
    // In demo mode, if a transfer occurred we won't get an update from the broker (since it's simulated),
    // so we need to manually adjust the balance here. Just adjust for daily period since weekly/monthly
    // will aggregate from daily records. 
    if (LumosStateHelper.IsDemoMode() && history.TransferAmount != null && previousBalance != null) {
      history.Balance = (history.Balance ?? 0) + history.TransferAmount;
    }
    
    if (previousBalance != null) {
      history.BalanceChangeAmount = (history.Balance ?? 0) - previousBalance;
      history.BalanceChangePct = previousBalance !== 0 
        ? history.BalanceChangeAmount / previousBalance 
        : null;
    } else {
      history.BalanceChangeAmount = 0;
      history.BalanceChangePct = 0;
    }
  }

  /**
   * Aggregate transfer amounts and descriptions for the period.
   */
  private static aggregateTransfers(
    history: AccountHistory,
    rollupPeriod: RollupPeriod,
    periodDailyRecords: AccountHistory[]
  ): void {
    if (rollupPeriod === RollupPeriod.Daily) {
      // For daily, these are already set directly on the record (via AccountImport transfer logic)
      // Keep existing values if present
      return;
    }

    // For weekly/monthly, aggregate from daily records
    const transferRecords = periodDailyRecords.filter(r => r.TransferAmount != null && r.TransferAmount !== 0);
    if (transferRecords.length > 0) {
      history.TransferAmount = transferRecords.reduce((sum, r) => sum + (r.TransferAmount ?? 0), 0);
      history.TransferDescription = transferRecords
        .map(r => r.TransferDescription)
        .filter(d => d != null && d.trim() !== '')
        .join('. ');
    } else {
      history.TransferAmount = null;
      history.TransferDescription = null;
    }
  }

  /**
   * Calculate invested amount by taking the previous period's invested amount and adding
   * all transfers from the current period. Uses previousHistory (not daily records) to avoid
   * double-counting transfers that are already included in daily InvestedAmount values.
   */
  private static findInvestedAmount(
    periodDailyRecords: AccountHistory[], 
    previousHistory: AccountHistory | null
  ): number | null {
    let investedAmount = previousHistory?.InvestedAmount ?? null;
    const totalTransfers = periodDailyRecords.reduce((sum, r) => sum + (r.TransferAmount ?? 0), 0);
    
    if (totalTransfers !== 0) {
      // If we have transfers but no previous invested amount, this is the initial investment
      if (investedAmount == null) {
        investedAmount = totalTransfers;
      } else {
        investedAmount += totalTransfers;
      }
    }
    
    return investedAmount;
  }

  /**
   * Calculate net gain and net gain percentage.
   */
  private static calculateNetGain(
    history: AccountHistory,
    currentBalance: number,
    investedAmount: number | null
  ): void {
    if (currentBalance != null && investedAmount != null && investedAmount > 0) {
      history.NetGain = currentBalance - investedAmount;
      history.NetGainPct = history.NetGain / investedAmount;
    } else {
      history.NetGain = null;
      history.NetGainPct = null;
    }
  }

  /**
   * Calculate orders executed count for the period.
   */
  private static calculateOrdersExecuted(
    history: AccountHistory,
    rollupPeriod: RollupPeriod,
    periodDailyRecords: AccountHistory[],
    periodEnd: string,
    ordersExecutedToday: number
  ): void {
    if (rollupPeriod === RollupPeriod.Daily) {
      // For daily, use the passed-in count
      history.OrdersExecuted = ordersExecutedToday;
      return;
    }

    // For weekly/monthly, sum from daily records
    let ordersSum = periodDailyRecords.reduce((sum, r) => sum + (r.OrdersExecuted ?? 0), 0);
    
    // Check if today's record is in the period and update its count
    const todayDate = periodEnd;
    const todayRecord = periodDailyRecords.find(r => 
      r.PeriodEnd.toISOString().substring(0, 10) === todayDate
    );
    
    if (todayRecord) {
      // Subtract the old value and add the new one
      ordersSum = ordersSum - (todayRecord.OrdersExecuted ?? 0) + ordersExecutedToday;
    }
    
    history.OrdersExecuted = ordersSum;
  }

  /**
   * Group daily records by their rollup period (weekly or monthly).
   * Returns a map of periodEnd -> array of daily records in that period.
   */
  public static GroupDailyRecordsByPeriod(
    rollupPeriod: RollupPeriod,
    dailyRecords: AccountHistory[]
  ): Map<string, AccountHistory[]> {
    const periodGroups = new Map<string, AccountHistory[]>();
    
    for (const daily of dailyRecords) {
      const dailyDate = daily.PeriodEnd;
      const [, periodEnd] = RollupUtils.GetRollupPeriod(rollupPeriod, dailyDate);
      
      if (!periodGroups.has(periodEnd)) {
        periodGroups.set(periodEnd, []);
      }
      periodGroups.get(periodEnd)!.push(daily);
    }

    return periodGroups;
  }

  /**
   * Process a single period (weekly or monthly) from its daily records.
   * This is used during backfill to regenerate weekly/monthly from updated dailies.
   */
  public static async ProcessPeriodFromDailyRecords(
    account: Account,
    rollupPeriod: RollupPeriod,
    periodEnd: string,
    recordsInPeriod: AccountHistory[],
    allDailyRecords: AccountHistory[]
  ): Promise<void> {
    const accountId = account.AccountID!;

    // Get the most recent daily record in this period (use its balance)
    const mostRecentDaily = recordsInPeriod[recordsInPeriod.length - 1];
    
    // Get the period start
    const [periodStart] = RollupUtils.GetRollupPeriod(
      rollupPeriod, 
      new Date(periodEnd + 'T12:00:00')
    );

    // Get current period record if it exists
    const currentHistory = await DataAccess.GetAccountHistoryForPeriod(
      accountId,
      rollupPeriod,
      periodEnd
    );

    // If we have a current, check for a previous
    let previousHistory: AccountHistory | null = null;
    if(currentHistory != null) {
      previousHistory = await DataAccess.GetAccountHistoryForPeriodPrior(
        accountId,
        rollupPeriod,
        periodEnd
      );
    }

    // Calculate values using the most recent daily record's balance
    const currentBalance = mostRecentDaily.Balance ?? 0;
    
    // Use all daily records for lookups (invested amount, etc.)
    const history = this.CalculateRollupValues(
      account,
      rollupPeriod,
      periodStart,
      periodEnd,
      currentBalance,
      currentHistory,
      previousHistory,
      allDailyRecords,
      0 // Not used for weekly/monthly
    );

    // Upsert to database
    await DataAccess.UpsertAccountHistory(account, history);
  }
}
