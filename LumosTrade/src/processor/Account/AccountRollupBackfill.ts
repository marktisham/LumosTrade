import { DataAccess } from '../../database/DataAccess';
import { Account } from '../../interfaces/Account';
import { AccountHistory } from '../../interfaces/AccountHistory';
import { RollupPeriod } from '../../utils/RollupUtils';
import { AccountRollupCalculator } from './AccountRollupCalculator';
import { BrokerManager } from '../BrokerManager';
import { SimulationContext } from '../Simulator/SimulationContext';

/**
 * Backfill and recalculate account rollup records for historical data.
 * This class processes existing daily balance records and regenerates weekly/monthly rollups.
 * It does NOT load new balances from the broker - only recalculates from existing data.
 */
export class AccountRollupBackfill {

  /**
   * Backfill all rollup periods for all accounts across all brokers.
   * Processes all accounts in parallel for efficiency.
   */
  public static async BackfillAll(): Promise<void> {
    console.log('Starting backfill for all accounts across all brokers...');
    
    const brokers = BrokerManager.GetBrokerClients();
    const allBackfillPromises: Promise<void>[] = [];

    for (const broker of brokers) {
      const accounts = await DataAccess.GetAccounts(broker);
      
      for (const account of accounts) {
        allBackfillPromises.push(
          this.BackfillRollups(account, null).catch((error) => {
            console.error(`Error backfilling account ${account.Name} (${account.AccountID}):`, error);
          })
        );
      }
    }

    await Promise.all(allBackfillPromises);
    console.log(`Backfill complete for all ${allBackfillPromises.length} accounts.`);
  }

  /**
   * Backfill all rollup periods (Daily, Weekly, Monthly) for an account.
   * Loads all existing daily records and recalculates delta values, then
   * regenerates weekly and monthly rollups from the updated daily data.
   * @param account The account to backfill
   * @param fromDate Optional date to start backfill from (inclusive). If null, processes all records.
   */
  public static async BackfillRollups(account: Account, fromDate: Date | null = null): Promise<void> {
    const accountId = account.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required for backfill');
    }
    
    if(fromDate) {
      console.log(`Backfilling account rollups for account ${account.Name} (${accountId}) from ${fromDate.toISOString().substring(0, 10)}...`);
    } else {
      console.log(`Backfilling account rollups for account ${account.Name} (${accountId}) for all dates...`);
    }

    // Load daily records from the specified date (or all if fromDate is null)
    let dailyRecords = await DataAccess.GetAccountHistoryOnOrAfterDate(account, fromDate, RollupPeriod.Daily);
    
    if (dailyRecords.length === 0) {
      console.log(`No daily records found for account ${account.Name} (${accountId}). Nothing to backfill.`);
      return;
    }

    // Sort by date to ensure chronological processing
    dailyRecords.sort((a, b) => a.PeriodEnd.getTime() - b.PeriodEnd.getTime());

    const firstDate = dailyRecords[0].PeriodEnd.toISOString().substring(0, 10);
    const lastDate = dailyRecords[dailyRecords.length - 1].PeriodEnd.toISOString().substring(0, 10);
    console.log(`Backfilling from ${firstDate} to ${lastDate}...`);

    // Step 1: Recalculate all daily records with updated delta values
    dailyRecords = await this.backfillDailyRollups(account, dailyRecords);

    // Step 2: Regenerate weekly rollups from daily data
    await this.backfillPeriodRollups(account, RollupPeriod.Weekly, dailyRecords);

    // Step 3: Regenerate monthly rollups from daily data
    await this.backfillPeriodRollups(account, RollupPeriod.Monthly, dailyRecords);

    console.log(`Backfill complete for account ${account.Name} (${accountId}).`);
  }

  /**
   * Backfill daily rollup records by recalculating delta values in chronological order.
   * Returns the updated list of daily records.
   */
  private static async backfillDailyRollups(
    account: Account,
    dailyRecords: AccountHistory[]
  ): Promise<AccountHistory[]> {
    const accountId = account.AccountID!;
    console.log(`Recalculating ${dailyRecords.length} daily records...`);

    for (let i = 0; i < dailyRecords.length; i++) {
      const currentRecord = dailyRecords[i];
      const currentDate = currentRecord.PeriodEnd.toISOString().substring(0, 10);

      let previousRecord: AccountHistory | null = i > 0 ? dailyRecords[i - 1] : null;
      if (previousRecord == null) {
        // Load previous from database if not in memory so we can compare
        previousRecord = await DataAccess.GetAccountHistoryForPeriodPrior(account.AccountID!, RollupPeriod.Daily, currentDate);
      }

      // Get orders executed count for this date
      const ordersExecuted = await DataAccess.GetOrdersExecutedCount(accountId, currentDate);

      // Use the existing balance from the record (don't call broker)
      const currentBalance = currentRecord.Balance ?? 0;

      // Calculate updated values using shared calculator
      const updatedRecord = AccountRollupCalculator.CalculateRollupValues(
        account,
        RollupPeriod.Daily,
        currentDate,
        currentDate,
        currentBalance,
        currentRecord,
        previousRecord,
        [currentRecord], // For daily, just pass the current record
        ordersExecuted
      );

      // Upsert to database
      await DataAccess.UpsertAccountHistory(account, updatedRecord);

      // Update our in-memory list with the new values for use in weekly/monthly calculations
      dailyRecords[i] = updatedRecord;
    }

    console.log(`Daily recalculation complete.`);
    return dailyRecords;
  }

  /**
   * Backfill weekly or monthly rollup records from daily data.
   */
  private static async backfillPeriodRollups(
    account: Account,
    rollupPeriod: RollupPeriod,
    dailyRecords: AccountHistory[]
  ): Promise<void> {
    const periodName = rollupPeriod === RollupPeriod.Weekly ? 'weekly' : 'monthly';
    console.log(`Regenerating ${periodName} rollups from daily data...`);

    // Group daily records by their rollup period
    const periodGroups = AccountRollupCalculator.GroupDailyRecordsByPeriod(rollupPeriod, dailyRecords);

    // Process each period in chronological order
    const sortedPeriodEnds = Array.from(periodGroups.keys()).sort();
    
    for (const periodEnd of sortedPeriodEnds) {
      const recordsInPeriod = periodGroups.get(periodEnd)!;
      
      await AccountRollupCalculator.ProcessPeriodFromDailyRecords(
        account,
        rollupPeriod,
        periodEnd,
        recordsInPeriod,
        dailyRecords
      );
    }

    console.log(`Backfilled ${periodGroups.size} ${periodName} periods.`);
  }
}
