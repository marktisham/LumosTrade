import { Request, Response } from 'express';
import { Account, AccountHistory, DataAccess, DateUtils, Conductor, RollupPeriod, RollupUtils } from 'lumostrade';
import { BalanceFilter } from '../database/BalanceFilter';
import { AppDataAccess } from '../database/AppDataAccess';

export type AccountHistoryResponse = {
  AccountID: number | null;
  Name: string;
  BrokerID?: number | null;
  BrokerName?: string | null;
  Balance: number | null;
  BalanceChangeAmount: number | null;
  BalanceChangePct: number | null;
  InvestedAmount: number | null;
  NetGain: number | null;
  NetGainPct: number | null;
  TransferAmount: number | null;
  TransferDescription: string | null;
  OrdersExecuted: number | null;
  Comment: string | null;
  BalanceUpdateTime: string | null;
  PeriodEnd: string | null;
  DrawdownFromATH: number | null;
  DrawdownPctFromATH: number | null;
  AllTimeHigh: number | null;
  AllTimeHighDate: string | null;
  AllTimeHighRangeStart: string | null;
};

type SortState = {
  key: string;
  direction: string;
};

type AccountsApiResponse = {
  asOf: string;
  periodEnd: string;
  periodStart: string;
  isLatestPeriod: boolean;
  rollupPeriod: RollupPeriod;
  accounts: AccountHistoryResponse[];
  brokers?: Array<{ BrokerID: number; Name: string }>;
  sort: SortState;
};

const mapToResponse = (account: Account, balance: AccountHistory | null): AccountHistoryResponse => {
  return {
    AccountID: account.AccountID ?? null,
    Name: account.Name,
    BrokerID: (account as any).BrokerID ?? null,
    BrokerName: (account as any).BrokerName ?? null,
    Balance: balance?.Balance ?? null,
    BalanceChangeAmount: balance?.BalanceChangeAmount ?? null,
    BalanceChangePct: balance?.BalanceChangePct ?? null,
    InvestedAmount: balance?.InvestedAmount ?? null,
    NetGain: balance?.NetGain ?? null,
    NetGainPct: balance?.NetGainPct ?? null,
    TransferAmount: balance?.TransferAmount ?? null,
    TransferDescription: balance?.TransferDescription ?? null,
    OrdersExecuted: balance?.OrdersExecuted ?? null,
    Comment: balance?.Comment ?? null,
    BalanceUpdateTime: balance?.BalanceUpdateTime ? balance.BalanceUpdateTime.toISOString() : null,
    PeriodEnd: balance?.PeriodEnd ? balance.PeriodEnd.toISOString() : null,
    DrawdownFromATH: (account as any).DrawdownFromATH ?? null,
    DrawdownPctFromATH: (account as any).DrawdownPctFromATH ?? null,
    AllTimeHigh: (account as any).AllTimeHigh ?? null,
    AllTimeHighDate: (account as any).AllTimeHighDate ? (account as any).AllTimeHighDate.toISOString() : null,
    AllTimeHighRangeStart: (account as any).AllTimeHighRangeStart ? (account as any).AllTimeHighRangeStart.toISOString() : null
  };
};

export default async function accountsRequest(req: Request, res: Response) {
  try {
    // Handle PUT requests for updating ATH range start
    if (req.method === 'PUT') {
      const { accountId, athRangeStart } = req.body;
      
      if (!accountId || typeof accountId !== 'number') {
        res.status(400).json({ error: 'Invalid accountId' });
        return;
      }
      
      // Find the account by id
      const account = await DataAccess.GetAccount(accountId);
      if (!account) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }
      
      // Parse the range start date (can be null to clear the range start)
      let rangeStartDate: Date | null = null;
      if (athRangeStart) {
        rangeStartDate = new Date(athRangeStart);
        if (isNaN(rangeStartDate.getTime())) {
          res.status(400).json({ error: 'Invalid athRangeStart date format' });
          return;
        }
      }
      
      // Update the ATH range start
      await AppDataAccess.UpdateAccountAllTimeHighRangeStart(accountId, rangeStartDate);
      
      // Refresh the ATH calculations for the account
      await DataAccess.RefreshAccountATH(account);
      
      res.json({ success: true });
      return;
    }

    // Handle POST requests for updating comments
    if (req.method === 'POST') {
      const { accountId, comment, periodEnd: postPeriodEnd, rollupPeriod: postRollupPeriod } = req.body;
      
      if (!accountId || typeof accountId !== 'number') {
        res.status(400).json({ error: 'Invalid accountId' });
        return;
      }
      
      // Find the account by id
      const account = await DataAccess.GetAccount(accountId);
      if (!account) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }
      
      // Parse rollup period and period end from POST body
      let rollupPeriod = RollupPeriod.Daily;
      if (postRollupPeriod) {
        const parsed = typeof postRollupPeriod === 'string' ? parseInt(postRollupPeriod, 10) : postRollupPeriod;
        if ([RollupPeriod.Daily, RollupPeriod.Weekly, RollupPeriod.Monthly].includes(Number(parsed))) {
          rollupPeriod = Number(parsed) as RollupPeriod;
        }
      }

      // Determine period end date
      let periodEndStr: string | null = null;
      if (typeof postPeriodEnd === 'string' && postPeriodEnd.trim() !== '') {
        periodEndStr = DateUtils.ToDateStringInTimeZone(postPeriodEnd);
      }

      if (!periodEndStr) {
        res.status(400).json({ error: 'Invalid or missing periodEnd' });
        return;
      }

      // Get the balance for the requested period
      const balance = await DataAccess.GetAccountHistoryForPeriod(accountId, rollupPeriod, periodEndStr);
      
      if (!balance) {
        res.status(404).json({ error: 'No balance record found for account at specified period' });
        return;
      }
      
      // Update the comment
      balance.Comment = typeof comment === 'string' ? comment : null;
      
      // Save the updated balance
      await DataAccess.UpsertAccountHistory(account, balance);
      
      // Return the updated balance data
      const response = mapToResponse(account, balance);
      res.json(response);
      return;
    }
    
    const { 
      sortKey, 
      sortDirection, 
      periodEnd: periodEndParam, 
      rollupPeriod: rollupPeriodParam,
      op 
    } = req.query;

    // If client requested an import/refresh operation, perform it first.
    let refreshErrors: string | null = null;
    if (typeof op === 'string' && op === 'refresh') {
      // Refresh balances, trades, etc. from the brokers.
      // Use fastMode=true for UI-initiated refreshes to prioritize user experience.
      const conductorError = await Conductor.RefreshTheWorld(true);
      refreshErrors = conductorError.FormatFailures();
    }

    // If client requested a balances-only refresh, call the specialized conductor method
    if (typeof op === 'string' && op === 'refreshBalances') {
      const conductorError = await Conductor.RefreshAccountBalances();
      refreshErrors = conductorError.FormatFailures();
    }
    
    // Parse rollup period (default to Daily)
    let rollupPeriod = RollupPeriod.Daily;
    if (rollupPeriodParam) {
      const numVal = typeof rollupPeriodParam === 'string' ? 
        parseInt(rollupPeriodParam, 10) : rollupPeriodParam;
      if ([RollupPeriod.Daily, RollupPeriod.Weekly, RollupPeriod.Monthly].includes(Number(numVal))) {
        rollupPeriod = Number(numVal) as RollupPeriod;
      }
    }

    // Determine the period end date based on operation and current period
    let periodEndDate: Date;
    let isLatestPeriod: boolean;

    if (typeof op === 'string' && op === 'previous' && typeof periodEndParam === 'string' && periodEndParam) {
      // Calculate previous period using RollupUtils
      const currentDate = new Date(periodEndParam + 'T12:00:00');
      const [prevStart, prevEnd] = RollupUtils.GetPreviousRollupPeriod(rollupPeriod, currentDate);
      periodEndDate = new Date(prevEnd + 'T12:00:00');
      const today = new Date();
      const [todayStart, todayEnd] = RollupUtils.GetRollupPeriod(rollupPeriod, today);
      isLatestPeriod = (prevEnd === todayEnd);
    } else if (typeof op === 'string' && op === 'next' && typeof periodEndParam === 'string' && periodEndParam) {
      // Calculate next period using RollupUtils
      const currentDate = new Date(periodEndParam + 'T12:00:00');
      const [nextStart, nextEnd] = RollupUtils.GetNextRollupPeriod(rollupPeriod, currentDate);
      periodEndDate = new Date(nextEnd + 'T12:00:00');
      const today = new Date();
      const [todayStart, todayEnd] = RollupUtils.GetRollupPeriod(rollupPeriod, today);
      isLatestPeriod = (nextEnd === todayEnd);
    } else if (typeof periodEndParam === 'string' && periodEndParam) {
      // Use the provided period end date
      const parsed = new Date(periodEndParam + 'T12:00:00');
      if (!parsed || isNaN(parsed.getTime())) {
        periodEndDate = new Date();
        isLatestPeriod = true;
      } else {
        periodEndDate = parsed;
        const today = new Date();
        const [todayStart, todayEnd] = RollupUtils.GetRollupPeriod(rollupPeriod, today);
        const [paramStart, paramEnd] = RollupUtils.GetRollupPeriod(rollupPeriod, periodEndDate);
        isLatestPeriod = (paramEnd === todayEnd);
      }
    } else {
      periodEndDate = new Date();
      isLatestPeriod = true;
    }

    // Get the actual rollup period for the given date
    const [periodStart, periodEnd] = RollupUtils.GetRollupPeriod(rollupPeriod, periodEndDate);
    
    // Create BalanceFilter with validated parameters
    const filter = BalanceFilter.fromQueryParams(
      typeof sortKey === 'string' ? sortKey : undefined,
      typeof sortDirection === 'string' ? sortDirection : undefined,
      periodEnd,
      rollupPeriod ? String(rollupPeriod) : undefined,
      typeof req.query.brokerId === 'string' ? req.query.brokerId : undefined
    );
    
    // Fetch account balances from database
    const results = await AppDataAccess.GetMostRecentAccountHistory(filter);
    
    // Map to response format
    const accounts = results.map(({ account, balance }) => mapToResponse(account, balance));
      // Include broker list for client-side filter dropdown
    const brokers = await DataAccess.GetBrokers();
    const response: AccountsApiResponse & { refreshErrors?: string; operationType?: string } = {
      asOf: new Date().toISOString(),
      periodEnd,
      periodStart,
      isLatestPeriod,
      rollupPeriod,
      accounts,
        brokers,
      sort: {
        key: filter.sortColumn,
        direction: filter.sortDirection
      },
      ...(refreshErrors ? { refreshErrors } : {}),
      ...(op && typeof op === 'string' ? { operationType: op } : {})
    };
    
    res.json(response);
  } catch (error) {
    console.error('[accountsRequest] Error fetching account balances:', error);
    res.status(500).json({
      error: 'Failed to fetch account balances',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
