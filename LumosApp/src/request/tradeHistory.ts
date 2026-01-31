import { Request, Response } from 'express';
import { RollupPeriod, RollupUtils, DateUtils, DataAccess } from 'lumostrade';
import { TradeHistoryFilter } from '../database/TradeHistoryFilter';
import { AppDataAccess } from '../database/AppDataAccess';

export type TradeHistoryRow = {
  TradeHistoryID: number | null;
  AccountID: number;
  TradeID: number;
  AccountName: string;
  BrokerID: number | null;
  BrokerName: string | null;
  Symbol: string;
  Closed: boolean;
  RollupPeriod: RollupPeriod;
  PeriodEnd: string;
  PeriodGain: number | null;
  PeriodGainPct: number | null;
  TotalGain: number | null;
  TotalGainPct: number | null;
  LargestRisk: number | null;
  CurrentValue: number | null;
  CurrentCost: number | null;
  AvgEntryPrice: number | null;
  AvgExitPrice: number | null;
  LongTrade: boolean | null;
  CurrentPriceAtPeriodEnd: number | null;
  OpenQuantityAtPeriodEnd: number | null;
  BreakevenPriceAtPeriodEnd: number | null;
  RealizedGainAtPeriodEnd: number | null;
  UnrealizedGainAtPeriodEnd: number | null;
};

type SortState = {
  key: string;
  direction: string;
};

type TradeHistoryApiResponse = {
  asOf: string;
  periodEnd: string;
  periodStart: string;
  isLatestPeriod: boolean;
  rollupPeriod: RollupPeriod;
  tradeHistory: TradeHistoryRow[];
  sort: SortState;
  quotesAsOf?: string | null;
};

export default async function tradeHistoryRequest(req: Request, res: Response) {
  try {
    const { 
      sortKey, 
      sortDirection, 
      periodEnd: periodEndParam, 
      rollupPeriod: rollupPeriodParam,
      accountId: accountIdParam,
      brokerId: brokerIdParam,
      symbol: symbolParam,
      symbols: symbolsParam,
      closedState: closedStateParam,
      op: opParam,
      dateRange: dateRangeParam,
      columns: columnsParam,
      groupBy: groupByParam
    } = req.query;

    // Parse rollup period (default to Daily)
    let rollupPeriod = RollupPeriod.Daily;
    if (rollupPeriodParam) {
      const numVal = typeof rollupPeriodParam === 'string' ? 
        parseInt(rollupPeriodParam, 10) : rollupPeriodParam;
      if ([RollupPeriod.Daily, RollupPeriod.Weekly, RollupPeriod.Monthly].includes(Number(numVal))) {
        rollupPeriod = Number(numVal) as RollupPeriod;
      }
    }

    // Check if we're in date range mode first (for chart view)
    const isDateRangeMode = typeof dateRangeParam === 'string' && dateRangeParam && !periodEndParam;

    // Determine the period end date based on operation and current period
    // Skip this calculation if we're in date range mode
    let periodEndDate: Date;
    let isLatestPeriod: boolean;

    if (typeof opParam === 'string' && opParam === 'previous' && typeof periodEndParam === 'string' && periodEndParam) {
      // Calculate previous period using RollupUtils
      const currentDate = new Date(periodEndParam + 'T12:00:00');
      const [prevStart, prevEnd] = RollupUtils.GetPreviousRollupPeriod(rollupPeriod, currentDate);
      periodEndDate = new Date(prevEnd + 'T12:00:00');
      const today = new Date();
      const [todayStart, todayEnd] = RollupUtils.GetRollupPeriod(rollupPeriod, today);
      isLatestPeriod = (prevEnd === todayEnd);
    } else if (typeof opParam === 'string' && opParam === 'next' && typeof periodEndParam === 'string' && periodEndParam) {
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
    } else if (!isDateRangeMode) {
      // Only set default periodEnd if not in date range mode
      periodEndDate = new Date();
      isLatestPeriod = true;
    } else {
      // In date range mode, use today but it won't be used
      periodEndDate = new Date();
      isLatestPeriod = true;
    }

    // Get the actual rollup period for the given date (skip if in date range mode)
    const [periodStart, periodEnd] = isDateRangeMode ? ['', ''] : RollupUtils.GetRollupPeriod(rollupPeriod, periodEndDate);

    // Parse accountId filter
    const accountId = accountIdParam ? 
      (typeof accountIdParam === 'string' ? parseInt(accountIdParam, 10) : Number(accountIdParam)) : null;
    
    // Parse brokerId filter
    const brokerId = brokerIdParam ? 
      (typeof brokerIdParam === 'string' ? parseInt(brokerIdParam, 10) : Number(brokerIdParam)) : null;

    // Parse symbol filters
    const symbol = typeof symbolParam === 'string' ? symbolParam : null;
    const symbols = Array.isArray(symbolsParam) ? 
      symbolsParam.filter(s => typeof s === 'string') as string[] : 
      (typeof symbolsParam === 'string' ? [symbolsParam] : null);

    // Parse closedState filter
    const closedState = typeof closedStateParam === 'string' ? closedStateParam : undefined;

    // Check if we're in date range mode (for chart view)
    let startDateStr: string | null = null;
    let endDateStr: string | null = null;
    
    if (typeof dateRangeParam === 'string' && dateRangeParam) {
      const { AccountHistoryFilter } = await import('../database/AccountHistoryFilter');
      const { startDate, endDate } = AccountHistoryFilter.getDateWindowForKey(dateRangeParam);
      
      // Handle milestone-specific date ranges
      if (dateRangeParam.startsWith('MILESTONE:')) {
        const milestoneId = parseInt(dateRangeParam.split(':')[1], 10);
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
              startDateStr = toYMD(new Date(milestone.DayStart));
            }
            if (milestone.DayEnd) {
              endDateStr = toYMD(new Date(milestone.DayEnd));
            } else {
              endDateStr = null;
            }
          }
        }
      } else {
        startDateStr = startDate;
        endDateStr = endDate;
      }
    }

    // Parse columns parameter for optimization
    const columns = typeof columnsParam === 'string' ? 
      columnsParam.split(',').map(c => c.trim()).filter(c => c.length > 0) : null;

    // Create filter (with date range if provided, otherwise use periodEnd)
    // For open-ended date ranges (endDateStr is null), use today's date as the end
    const finalEndDateStr = startDateStr && !endDateStr ? new Date().toISOString().split('T')[0] : endDateStr;
    
    const filter = TradeHistoryFilter.fromQueryParams(
      typeof sortKey === 'string' ? sortKey : undefined,
      typeof sortDirection === 'string' ? sortDirection : undefined,
      startDateStr && finalEndDateStr ? null : periodEnd,
      rollupPeriod,
      accountId || undefined,
      brokerId || undefined,
      symbol || undefined,
      symbols || undefined,
      closedState,
      startDateStr,
      finalEndDateStr,
      columns,
      typeof groupByParam === 'string' ? groupByParam : undefined
    );

    // Fetch trade history from database
    const results = await AppDataAccess.GetTradeHistory(filter);

    // Map to response format
    const tradeHistory: TradeHistoryRow[] = results.map(row => ({
      TradeHistoryID: row.TradeHistoryID,
      AccountID: row.AccountID,
      TradeID: row.TradeID,
      AccountName: row.AccountName,
      BrokerID: row.BrokerID,
      BrokerName: row.BrokerName,
      Symbol: row.Symbol,
      Closed: row.Closed,
      RollupPeriod: row.RollupPeriod,
      PeriodEnd: row.PeriodEnd instanceof Date ? row.PeriodEnd.toISOString().split('T')[0] : String(row.PeriodEnd),
      PeriodGain: row.PeriodGain,
      PeriodGainPct: row.PeriodGainPct,
      TotalGain: row.TotalGain,
      TotalGainPct: row.TotalGainPct,
      LargestRisk: row.LargestRisk ?? null,
      CurrentValue: row.CurrentValue,
      CurrentCost: row.CurrentCost,
      AvgEntryPrice: row.AvgEntryPrice ?? null,
      AvgExitPrice: row.AvgExitPrice ?? null,
      LongTrade: row.LongTrade ?? null,
      CurrentPriceAtPeriodEnd: row.CurrentPriceAtPeriodEnd,
      OpenQuantityAtPeriodEnd: row.OpenQuantityAtPeriodEnd,
      BreakevenPriceAtPeriodEnd: row.BreakevenPriceAtPeriodEnd,
      RealizedGainAtPeriodEnd: row.RealizedGainAtPeriodEnd,
      UnrealizedGainAtPeriodEnd: row.UnrealizedGainAtPeriodEnd,
    }));

    let latestQuote: Date | null = null;
    try {
      const acct = filter.accountId != null ? { AccountID: filter.accountId } as any : null;
      latestQuote = await DataAccess.GetLatestQuoteUpdate(acct);
    } catch (err) {
      console.warn('[tradeHistoryRequest] Unable to fetch latest quote update:', err);
      latestQuote = null;
    }

    const response: TradeHistoryApiResponse = {
      asOf: new Date().toISOString(),
      periodEnd,
      periodStart,
      isLatestPeriod,
      rollupPeriod,
      tradeHistory,
      sort: {
        key: filter.sortColumn,
        direction: filter.sortDirection
      },
      quotesAsOf: latestQuote ? latestQuote.toISOString() : null
    };

    res.json(response);
  } catch (error) {
    console.error('[tradeHistoryRequest] Error fetching trade history:', error);
    res.status(500).json({
      error: 'Failed to fetch trade history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
