import { Request, Response } from 'express';
import { AccountHistory, DataAccess } from 'lumostrade';
import { AccountHistoryFilter } from '../database/AccountHistoryFilter';
import { AppDataAccess } from '../database/AppDataAccess';

export type AccountHistoryBalanceResponse = {
  AccountID: number | null;
  Balance: number | null;
  BalanceChangeAmount: number | null;
  BalanceChangePct: number | null;
  InvestedAmount: number | null;
  NetGain: number | null;
  NetGainPct: number | null;
  TransferAmount: number | null;
  TransferDescription: string | null;
  OrdersExecuted: number | null;
  PeriodEnd: string | null;
  Comment: string | null;
};

type SortState = {
  key: string;
  direction: string;
};

type AccountHistoryApiResponse = {
  asOf: string;
  history: AccountHistoryBalanceResponse[];
  sort: SortState;
  appliedStartDate?: string | null;
  appliedEndDate?: string | null;
};

const mapToResponse = (balance: AccountHistory): AccountHistoryBalanceResponse => {
  // Format PeriodEnd as YYYY-MM-DD string
  // MySQL returns DATE as UTC midnight, so we need to extract UTC date components
  let atDayEndStr: string | null = null;
  if (balance.PeriodEnd) {
    const date = balance.PeriodEnd instanceof Date ? balance.PeriodEnd : new Date(balance.PeriodEnd);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    atDayEndStr = `${year}-${month}-${day}`;
  }
  
  return {
    AccountID: balance.AccountID,
    Balance: balance.Balance,
    BalanceChangeAmount: balance.BalanceChangeAmount,
    BalanceChangePct: balance.BalanceChangePct,
    InvestedAmount: balance.InvestedAmount,
    NetGain: balance.NetGain,
    NetGainPct: balance.NetGainPct,
    TransferAmount: balance.TransferAmount,
    TransferDescription: balance.TransferDescription ?? null,
    OrdersExecuted: balance.OrdersExecuted ?? null,
    PeriodEnd: atDayEndStr
    ,
    Comment: balance.Comment ?? null
  };
};

export default async function accountHistoryRequest(req: Request, res: Response) {
  try {
    const { sortKey, sortDirection, accountId, dateRange, rollupPeriod } = req.query;

    // Build filter from query params (include dateRange and rollupPeriod)
    const filter = AccountHistoryFilter.fromQueryParams(
      sortKey as string | undefined,
      sortDirection as string | undefined,
      accountId as string | undefined,
      dateRange as string | undefined,
      rollupPeriod as string | undefined,
      typeof req.query.brokerId === 'string' ? req.query.brokerId : undefined
    );
    
    // Handle Milestone date range
    if (typeof dateRange === 'string' && dateRange.startsWith('MILESTONE:')) {
      const milestoneId = parseInt(dateRange.split(':')[1], 10);
      if (!isNaN(milestoneId)) {
        const milestone = await AppDataAccess.GetMilestone(milestoneId);
        if (milestone) {
          const toYMD = (d: Date) => {
             const year = d.getUTCFullYear();
             const month = String(d.getUTCMonth() + 1).padStart(2, '0');
             const day = String(d.getUTCDate()).padStart(2, '0');
             return `${year}-${month}-${day}`;
          };
          
          if (milestone.DayStart) {
             filter.startDate = toYMD(new Date(milestone.DayStart));
          }
          if (milestone.DayEnd) {
             filter.endDate = toYMD(new Date(milestone.DayEnd));
          } else {
             filter.endDate = null;
          }
        }
      }
    }
    
    // Load account history
    const balances = await AppDataAccess.GetAccountHistory(filter);
    
    // Map to response format
    const historyResponse: AccountHistoryBalanceResponse[] = balances.map(mapToResponse);

    // Calculate asOf from most recent BalanceUpdateTime
    const updateTimes = balances
      .map(b => b.BalanceUpdateTime)
      .filter((t): t is Date => t !== null && t !== undefined)
      .filter(d => !isNaN(d.getTime()));
    const asOf = updateTimes.length > 0
      ? new Date(Math.max(...updateTimes.map(d => d.getTime()))).toISOString()
      : new Date().toISOString();

    const response: AccountHistoryApiResponse = {
      asOf,
      history: historyResponse,
      sort: {
        key: filter.sortColumn,
        direction: filter.sortDirection
      },
      appliedStartDate: filter.startDate ?? null,
      appliedEndDate: filter.endDate ?? null
    };
    
    res.json(response);
  } catch (error) {
    console.error('[accountHistoryRequest] Error loading account history:', error);
    res.status(500).json({ 
      error: 'Failed to load account history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
