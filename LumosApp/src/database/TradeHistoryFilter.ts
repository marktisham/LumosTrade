// TradeHistoryFilter.ts
// Encapsulates sorting and filter state for loading TradeHistory rows from the database

import { RollupPeriod } from 'lumostrade';

const VALID_SORT_COLUMNS = [
  'BrokerName',
  'AccountName',
  'Symbol',
  'Closed',
  'PeriodGain',
  'PeriodGainPct',
  'TotalGain',
  'TotalGainPct',
  'CurrentCost',
  'CurrentValue'
] as const;

export type TradeHistorySortColumn = typeof VALID_SORT_COLUMNS[number];

export type SortDirection = 'asc' | 'desc';

export type ClosedState = 'all' | 'open' | 'closed';
export type GroupByFilter = 'symbol' | 'symbolGroup';

export class TradeHistoryFilter {
  sortColumn: TradeHistorySortColumn;
  sortDirection: SortDirection;
  periodEnd: string | null; // YYYY-MM-DD string in ET timezone (null for date range mode)
  startDate: string | null; // For date range mode
  endDate: string | null; // For date range mode
  rollupPeriod: RollupPeriod;
  accountId: number | null;
  brokerId: number | null;
  symbol: string | null;
  symbols: string[] | null;
  closedState: ClosedState;
  columns: string[] | null; // Optional column filter for optimization
  groupBy: GroupByFilter;

  constructor(
    sortColumn: TradeHistorySortColumn = 'AccountName',
    sortDirection: SortDirection = 'asc',
    periodEnd: string | null,
    rollupPeriod: RollupPeriod = RollupPeriod.Daily,
    accountId: number | null = null,
    brokerId: number | null = null,
    symbol: string | null = null,
    symbols: string[] | null = null,
    closedState: ClosedState = 'all',
    startDate: string | null = null,
    endDate: string | null = null,
    columns: string[] | null = null,
    groupBy: GroupByFilter = 'symbol'
  ) {
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
    this.periodEnd = periodEnd;
    this.rollupPeriod = rollupPeriod;
    this.accountId = accountId;
    this.brokerId = brokerId;
    this.symbol = symbol;
    this.symbols = symbols;
    this.closedState = closedState;
    this.startDate = startDate;
    this.endDate = endDate;
    this.columns = columns;
    this.groupBy = groupBy;
  }

  getOrderByClause(includeAccountsJoin: boolean = true, isGrouped: boolean = false): string {
    if (!TradeHistoryFilter.isValidSortColumn(this.sortColumn)) {
      throw new Error(`Invalid sort column: ${this.sortColumn}`);
    }
    if (!TradeHistoryFilter.isValidSortDirection(this.sortDirection)) {
      throw new Error(`Invalid sort direction: ${this.sortDirection}`);
    }
    
    const direction = this.sortDirection.toUpperCase();
    
    // When grouping by symbol groups, use column aliases instead of table-prefixed names
    // to reference the aggregated columns in the SELECT clause
    if (isGrouped) {
      switch (this.sortColumn) {
        case 'Symbol':
          return `Symbol ${direction}`;
        case 'Closed':
          return `Closed ${direction}`;
        case 'PeriodGain':
          return `PeriodGain ${direction}`;
        case 'PeriodGainPct':
          return `PeriodGainPct ${direction}`;
        case 'TotalGain':
          return `TotalGain ${direction}`;
        case 'TotalGainPct':
          return `TotalGainPct ${direction}`;
        case 'CurrentCost':
          return `CurrentCost ${direction}`;
        case 'CurrentValue':
          return `CurrentValue ${direction}`;
        case 'AccountName':
          return `AccountName ${direction}`;
        case 'BrokerName':
          return `BrokerName ${direction}`;
        default:
          return `PeriodEnd ${direction}`;
      }
    }
    
    // If Accounts table is not joined, fall back to a column that always exists
    if (!includeAccountsJoin) {
      switch (this.sortColumn) {
        case 'Symbol':
          return `t.Symbol ${direction}`;
        case 'Closed':
          return `t.Closed ${direction}`;
        case 'PeriodGain':
          return `th.PeriodGain ${direction}`;
        case 'PeriodGainPct':
          return `th.PeriodGainPct ${direction}`;
        case 'TotalGain':
          return `th.TotalGain ${direction}`;
        case 'TotalGainPct':
          return `th.TotalGainPct ${direction}`;
        case 'CurrentCost':
          return `th.CurrentCost ${direction}`;
        case 'CurrentValue':
          return `th.CurrentValue ${direction}`;
        default:
          // Fall back to PeriodEnd for AccountName/BrokerName when Accounts not joined
          return `th.PeriodEnd ${direction}`;
      }
    }
    
    switch (this.sortColumn) {
      case 'BrokerName':
        return `b.Name ${direction}, a.Name ${direction}`;
      case 'AccountName':
        return `a.Name ${direction}`;
      case 'Symbol':
        return `t.Symbol ${direction}`;
      case 'Closed':
        return `t.Closed ${direction}`;
      case 'PeriodGain':
        return `th.PeriodGain ${direction}`;
      case 'PeriodGainPct':
        return `th.PeriodGainPct ${direction}`;
      case 'TotalGain':
        return `th.TotalGain ${direction}`;
      case 'TotalGainPct':
        return `th.TotalGainPct ${direction}`;
      case 'CurrentCost':
        return `th.CurrentCost ${direction}`;
      case 'CurrentValue':
        return `th.CurrentValue ${direction}`;
      default:
        return `a.Name ${direction}`;
    }
  }

  getWhereClause(): string {
    const conditions: string[] = [];
    
    // Use either date range mode or single period mode
    if (this.startDate && this.endDate) {
      conditions.push('th.PeriodEnd >= ?');
      // For date ranges, be lenient with end date to include partial periods
      // Use a buffer based on rollup period (35 days for monthly, 10 for weekly, 2 for daily)
      // This ensures we capture periods that contain the end date but have PeriodEnd after it
      if (this.rollupPeriod === 3) { // Monthly
        conditions.push('th.PeriodEnd <= DATE_ADD(?, INTERVAL 35 DAY)');
      } else if (this.rollupPeriod === 2) { // Weekly  
        conditions.push('th.PeriodEnd <= DATE_ADD(?, INTERVAL 10 DAY)');
      } else { // Daily
        conditions.push('th.PeriodEnd <= DATE_ADD(?, INTERVAL 2 DAY)');
      }
    } else if (this.periodEnd) {
      conditions.push('th.PeriodEnd = ?');
    }
    
    conditions.push('th.RollupPeriod = ?');

    if (this.accountId !== null) {
      conditions.push('th.AccountID = ?');
    }
    
    if (this.brokerId !== null) {
      conditions.push('a.BrokerID = ?');
    }

    if (this.symbols && this.symbols.length > 0) {
      const placeholders = this.symbols.map(() => '?').join(', ');
      conditions.push(`t.Symbol IN (${placeholders})`);
    } else if (this.symbol) {
      conditions.push('t.Symbol = ?');
    }

    if (this.closedState === 'open') {
      conditions.push('t.Closed = FALSE');
    } else if (this.closedState === 'closed') {
      conditions.push('t.Closed = TRUE');
    }

    return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  }

  getWhereParams(): any[] {
    const params: any[] = [];
    
    // Add date parameters based on mode
    if (this.startDate && this.endDate) {
      params.push(this.startDate, this.endDate);
    } else if (this.periodEnd) {
      params.push(this.periodEnd);
    }
    
    params.push(this.rollupPeriod);

    if (this.accountId !== null) {
      params.push(this.accountId);
    }
    
    if (this.brokerId !== null) {
      params.push(this.brokerId);
    }

    if (this.symbols && this.symbols.length > 0) {
      params.push(...this.symbols);
    } else if (this.symbol) {
      params.push(this.symbol);
    }

    return params;
  }

  static isValidSortColumn(value: string): value is TradeHistorySortColumn {
    return VALID_SORT_COLUMNS.includes(value as TradeHistorySortColumn);
  }

  static isValidSortDirection(value: string): value is SortDirection {
    return value === 'asc' || value === 'desc';
  }

  static sanitizeSymbol(value: string | undefined | null): string | null {
    if (!value || typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
      return null;
    }
    return trimmed.toUpperCase();
  }

  static fromQueryParams(
    sortColumn?: string,
    sortDirection?: string,
    periodEnd?: string | null,
    rollupPeriod?: string | number,
    accountId?: string | number,
    brokerId?: string | number,
    symbol?: string,
    symbols?: string[],
    closedState?: string,
    startDate?: string | null,
    endDate?: string | null,
    columns?: string[] | null,
    groupBy?: string,
    defaultColumn: TradeHistorySortColumn = 'AccountName',
    defaultDirection: SortDirection = 'asc'
  ): TradeHistoryFilter {
    const validatedColumn = sortColumn && this.isValidSortColumn(sortColumn)
      ? sortColumn
      : defaultColumn;

    const validatedDirection = sortDirection && this.isValidSortDirection(sortDirection)
      ? sortDirection
      : defaultDirection;

    const periodEndStr = periodEnd !== null && periodEnd !== undefined ? periodEnd : (startDate && endDate ? null : new Date().toISOString().split('T')[0]);

    let rollupPeriodValue = RollupPeriod.Daily;
    if (rollupPeriod !== undefined) {
      const numVal = typeof rollupPeriod === 'string' ? parseInt(rollupPeriod, 10) : rollupPeriod;
      if ([RollupPeriod.Daily, RollupPeriod.Weekly, RollupPeriod.Monthly].includes(numVal)) {
        rollupPeriodValue = numVal;
      }
    }

    const accountIdValue = accountId ? 
      (typeof accountId === 'string' ? parseInt(accountId, 10) : accountId) : null;
    
    const brokerIdValue = brokerId ? 
      (typeof brokerId === 'string' ? parseInt(brokerId, 10) : brokerId) : null;

    const symbolValue = this.sanitizeSymbol(symbol);
    const symbolsValue = symbols && symbols.length > 0 ? 
      symbols.map(s => this.sanitizeSymbol(s)).filter((s): s is string => s !== null) : null;

    const closedStateValue: ClosedState = 
      closedState === 'open' || closedState === 'closed' ? closedState : 'all';

    const groupByValue: GroupByFilter = 
      groupBy === 'symbolGroup' ? 'symbolGroup' : 'symbol';

    return new TradeHistoryFilter(
      validatedColumn,
      validatedDirection,
      periodEndStr,
      rollupPeriodValue,
      accountIdValue,
      brokerIdValue,
      symbolValue,
      symbolsValue,
      closedStateValue,
      startDate || null,
      endDate || null,
      columns || null,
      groupByValue
    );
  }
}
