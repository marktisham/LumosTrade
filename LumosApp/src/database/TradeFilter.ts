/**
 * Trade filter used by the UI for listing trades. Encapsulates sorting, filtering, and
 * sanitization helpers used to build SQL WHERE/ORDER BY clauses safely.
 */

import { DateFilter, DateFilterValue } from '../utils/DateFilter';

// Valid sortable columns to prevent SQL injection
const VALID_SORT_COLUMNS = [
  'TradeID',
  'AccountID',
  'BrokerID',
  'Symbol',
  'LongTrade',
  'WinningTrade',
  'OpenQuantity',
  'BreakEvenPrice',
  'CurrentPrice',
  'CurrentCost',
  'CurrentValue',
  'OpenDate',
  'CloseDate',
  'DurationMS',
  'LargestRisk',
  'TotalGain',
  'TotalGainPct',
  'TotalFees',
  'TotalOrderCount',
  'Closed'
] as const;

export type TradeSortColumn = typeof VALID_SORT_COLUMNS[number];

export type SortDirection = 'asc' | 'desc';

export type LongTradeFilter = 'all' | 'long' | 'short';
export type WinningTradeFilter = 'all' | 'win' | 'loss';
export type ClosedStateFilter = 'all' | 'open' | 'closed';
export type GroupByFilter = 'symbol' | 'symbolGroup';

export class TradeFilter {
  sortColumn: TradeSortColumn;
  sortDirection: SortDirection;
  longTradeFilter: LongTradeFilter;
  winningTradeFilter: WinningTradeFilter;
  accountId: number | null;
  brokerId: number | null;
  symbol: string | null;
  symbols: string[] | null = null;
  tradeId: number | null;
  dateRange: string;
  closedState: ClosedStateFilter;
  groupBy: GroupByFilter;

  constructor(
    sortColumn: TradeSortColumn = 'TradeID',
    sortDirection: SortDirection = 'desc',
    longTradeFilter: LongTradeFilter = 'all',
    winningTradeFilter: WinningTradeFilter = 'all',
    accountId: number | null = null,
    brokerId: number | null = null,
    symbol: string | null = null,
    tradeId: number | null = null,
    dateRange: string = 'ALL',
    closedState: ClosedStateFilter = 'all',
    groupBy: GroupByFilter = 'symbol'
  ) {
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
    this.longTradeFilter = longTradeFilter;
    this.winningTradeFilter = winningTradeFilter;
    this.accountId = accountId;
    this.brokerId = brokerId;
    this.symbol = symbol;
    this.tradeId = tradeId;
    this.dateRange = dateRange;
    this.closedState = closedState;
    this.groupBy = groupBy;
  }

  /**
   * Return an ORDER BY clause for SQL, validating sort column and direction.
   */

  getOrderByClause(tableAlias: string = '', isGrouped: boolean = false): string {
    // When grouping by symbol groups, use column aliases instead of table-prefixed names
    // to reference the aggregated columns in the SELECT clause
    if (isGrouped) {
      // Runtime validation
      if (!TradeFilter.isValidSortColumn(this.sortColumn)) {
        throw new Error(`Invalid sort column: ${this.sortColumn}`);
      }
      if (!TradeFilter.isValidSortDirection(this.sortDirection)) {
        throw new Error(`Invalid sort direction: ${this.sortDirection}`);
      }
      const direction = this.sortDirection.toUpperCase();
      return `${this.sortColumn} ${direction}`;
    }

    const prefix = tableAlias ? `${tableAlias}.` : '';

    // Runtime validation as defensive programming, even though types should prevent invalid values
    if (!TradeFilter.isValidSortColumn(this.sortColumn)) {
      throw new Error(`Invalid sort column: ${this.sortColumn}`);
    }
    if (!TradeFilter.isValidSortDirection(this.sortDirection)) {
      throw new Error(`Invalid sort direction: ${this.sortDirection}`);
    }
    const direction = this.sortDirection.toUpperCase();

    // Table alias only needed for ambiguous columns
    if(this.sortColumn === 'Symbol') {
      return `${prefix}${this.sortColumn} ${direction}`;
    }

    return `${this.sortColumn} ${direction}`;
  }

  /** Return true if value is a valid TradeSortColumn. */
  static isValidSortColumn(value: string): value is TradeSortColumn {
    return VALID_SORT_COLUMNS.includes(value as TradeSortColumn);
  }

  /** Return true if value is 'asc' or 'desc'. */
  static isValidSortDirection(value: string): value is SortDirection {
    return value === 'asc' || value === 'desc';
  }

  /** Return true if value is 'all', 'long', or 'short'. */
  static isValidLongTradeFilter(value: string): value is LongTradeFilter {
    return value === 'all' || value === 'long' || value === 'short';
  }

  /**
   * Validates if a string is a valid WinningTradeFilter.
   */
  static isValidWinningTradeFilter(value: string): value is WinningTradeFilter {
    return value === 'all' || value === 'win' || value === 'loss';
  }

  /**
   * Sanitizes a symbol: allows letters/digits and . _ -, limits length, returns null when invalid.
   */
  static sanitizeSymbol(value: string | undefined | null): string | null {
    if (!value || typeof value !== 'string') {
      return null;
    }
    // Trim whitespace
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    // Only allow alphanumeric, periods, hyphens, underscores (typical stock symbols)
    // Reject if it contains any other characters
    if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
      return null;
    }
    // Limit length to reasonable symbol size (e.g., 20 chars)
    if (trimmed.length > 20) {
      return null;
    }
    return trimmed;
  }

  static isValidGroupByFilter(value: string): value is GroupByFilter {
    return value === 'symbol' || value === 'symbolGroup';
  }

  static fromQueryParams(
    sortColumn?: string,
    sortDirection?: string,
    longTradeFilter?: string,
    winningTradeFilter?: string,
    accountId?: string,
    brokerId?: string,
    symbol?: string,
    tradeId?: string,
    dateRange?: string,
    closedState?: string,
    groupBy?: string,
    defaultColumn: TradeSortColumn = 'TradeID',
    defaultDirection: SortDirection = 'desc',
    defaultLongTradeFilter: LongTradeFilter = 'all',
    defaultWinningTradeFilter: WinningTradeFilter = 'all'
  ): TradeFilter {
    const validatedColumn = sortColumn && this.isValidSortColumn(sortColumn)
      ? sortColumn
      : defaultColumn;

    const validatedDirection = sortDirection && this.isValidSortDirection(sortDirection)
      ? sortDirection
      : defaultDirection;

    const validatedLongTradeFilter = longTradeFilter && this.isValidLongTradeFilter(longTradeFilter)
      ? longTradeFilter
      : defaultLongTradeFilter;

    const validatedWinningTradeFilter = winningTradeFilter && this.isValidWinningTradeFilter(winningTradeFilter)
      ? winningTradeFilter
      : defaultWinningTradeFilter;

    let validatedAccountId: number | null = null;
    if (accountId !== undefined && accountId !== null && accountId !== '') {
      const parsed = parseInt(accountId, 10);
      if (!isNaN(parsed) && parsed > 0) {
        validatedAccountId = parsed;
      }
    }

    let validatedBrokerId: number | null = null;
    if (brokerId !== undefined && brokerId !== null && brokerId !== '') {
      const parsed = parseInt(brokerId, 10);
      if (!isNaN(parsed) && parsed > 0) {
        validatedBrokerId = parsed;
      }
    }

    const validatedSymbol = this.sanitizeSymbol(symbol);

    let validatedTradeId: number | null = null;
    if (tradeId !== undefined && tradeId !== null && tradeId !== '') {
      const parsed = parseInt(tradeId, 10);
      if (!isNaN(parsed) && parsed > 0) {
        validatedTradeId = parsed;
      }
    }

    const validatedDateRange = dateRange || 'ALL';

    let validatedClosedState: ClosedStateFilter = 'all';
    if (closedState === 'open' || closedState === 'closed' || closedState === 'all') {
      validatedClosedState = closedState as ClosedStateFilter;
    }

    const validatedGroupBy = groupBy && this.isValidGroupByFilter(groupBy)
      ? groupBy
      : 'symbol';

    return new TradeFilter(
      validatedColumn,
      validatedDirection,
      validatedLongTradeFilter,
      validatedWinningTradeFilter,
      validatedAccountId,
      validatedBrokerId,
      validatedSymbol,
      validatedTradeId,
      validatedDateRange,
      validatedClosedState,
      validatedGroupBy
    );
  }

  getWhereClause(tableAlias: string = ''): string {
    const conditions: string[] = [];
    const prefix = tableAlias ? `${tableAlias}.` : '';

    if (this.accountId !== null) {
      conditions.push(`${prefix}AccountID = ${this.accountId}`);
    }

    if (this.brokerId !== null) {
      conditions.push(`a.BrokerID = ${this.brokerId}`);
    }

    if (this.symbols !== null && this.symbols.length > 0) {
      const quotedSymbols = this.symbols.map(s => `'${s}'`).join(',');
      conditions.push(`${prefix}Symbol IN (${quotedSymbols})`);
    } else if (this.symbol !== null) {
      conditions.push(`${prefix}Symbol = '${this.symbol}'`);
    }

    if (this.tradeId !== null) {
      conditions.push(`${prefix}TradeID = ${this.tradeId}`);
    }

    if (this.longTradeFilter === 'long') {
      conditions.push(`${prefix}LongTrade = 1`);
    } else if (this.longTradeFilter === 'short') {
      conditions.push(`${prefix}LongTrade = 0`);
    }

    if (this.winningTradeFilter === 'win') {
      conditions.push(`WinningTrade = 1`);
    } else if (this.winningTradeFilter === 'loss') {
      conditions.push(`WinningTrade = 0`);
    }

    // Date filtering:
    // - Always show ALL open trades (Closed = 0), regardless of date
    // - For closed trades (Closed = 1), apply the date range filter to CloseDate
    
    if (this.dateRange && this.dateRange !== 'ALL') {
      const dateRangeConditions: string[] = [];
      
      // Always include all open trades
      dateRangeConditions.push(`${prefix}Closed = 0`);
      
      // For closed trades, apply date filter to CloseDate
      const closedDateRange = DateFilter.getDateRangeFromString(this.dateRange);
      if (closedDateRange) {
        const startIso = closedDateRange.start.toISOString().slice(0, 19).replace('T', ' ');
        const endIso = closedDateRange.end.toISOString().slice(0, 19).replace('T', ' ');
        dateRangeConditions.push(`(${prefix}Closed = 1 AND ${prefix}CloseDate >= '${startIso}' AND ${prefix}CloseDate < '${endIso}')`);
      } else {
        // If date range is invalid (e.g., milestone), just include all closed trades
        dateRangeConditions.push(`${prefix}Closed = 1`);
      }
      
      conditions.push(`(${dateRangeConditions.join(' OR ')})`);
    }

    // Apply open/closed filter if requested (this is the open/closed/all button filter)
    if (this.closedState === 'open') {
      conditions.push(`${prefix}Closed = 0`);
    } else if (this.closedState === 'closed') {
      conditions.push(`${prefix}Closed = 1`);
    }

    return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  }
}
