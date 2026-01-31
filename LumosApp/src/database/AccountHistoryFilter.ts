// AccountHistoryFilter.ts
// Encapsulates sorting state for loading historical AccountHistory rows from the database

import { RollupPeriod } from 'lumostrade';

// Valid sortable columns to prevent SQL injection
const VALID_SORT_COLUMNS = [
  'PeriodEnd',
  'Balance',
  'BalanceChangeAmount',
  'BalanceChangePct',
  'InvestedAmount',
  'NetGain',
  'NetGainPct',
  'TransferAmount',
  'OrdersExecuted',
  
] as const;

export type AccountHistorySortColumn = typeof VALID_SORT_COLUMNS[number];

export type SortDirection = 'asc' | 'desc';

export class AccountHistoryFilter {
  // Which column is currently sorted
  sortColumn: AccountHistorySortColumn;
  // Sort direction: ascending or descending
  sortDirection: SortDirection;
  // Optional account ID to filter by specific account (null means all accounts)
  accountId?: number | null;
  // Optional broker id to filter accounts (null = all brokers)
  brokerId?: number | null;
  // Optional date window for filtering (inclusive). If null, no date filtering applied (all time).
  startDate?: string | null; // YYYY-MM-DD
  endDate?: string | null;   // YYYY-MM-DD
  // Rollup period for grouping balances
  rollupPeriod: RollupPeriod;

  constructor(
    sortColumn: AccountHistorySortColumn = 'PeriodEnd',
    sortDirection: SortDirection = 'desc',
    accountId?: number | null,
    startDate?: string | null,
    endDate?: string | null,
    rollupPeriod: RollupPeriod = RollupPeriod.Daily,
    brokerId?: number | null
  ) {
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
    this.accountId = accountId;
    this.startDate = startDate ?? null;
    this.endDate = endDate ?? null;
    this.rollupPeriod = rollupPeriod;
    this.brokerId = typeof brokerId !== 'undefined' ? brokerId : null;
  }

  /**
   * Returns the ORDER BY clause for SQL queries based on sortColumn and sortDirection.
   * Validates values at runtime as an additional safeguard against SQL injection.
   */
  getOrderByClause(): string {
    // Runtime validation as defensive programming
    if (!AccountHistoryFilter.isValidSortColumn(this.sortColumn)) {
      throw new Error(`Invalid sort column: ${this.sortColumn}`);
    }
    if (!AccountHistoryFilter.isValidSortDirection(this.sortDirection)) {
      throw new Error(`Invalid sort direction: ${this.sortDirection}`);
    }
    
    const direction = this.sortDirection.toUpperCase();
    
    // Map column names to their SQL equivalents
    switch (this.sortColumn) {
      case 'PeriodEnd':
        return `PeriodEnd ${direction}`;
      case 'Balance':
        return `Balance ${direction}`;
      case 'BalanceChangeAmount':
        return `BalanceChangeAmount ${direction}`;
      case 'BalanceChangePct':
        return `BalanceChangePct ${direction}`;
      case 'InvestedAmount':
        return `InvestedAmount ${direction}`;
      case 'NetGain':
        return `NetGain ${direction}`;
      case 'NetGainPct':
        return `NetGainPct ${direction}`;
      case 'TransferAmount':
        return `TransferAmount ${direction}`;
      case 'OrdersExecuted':
        return `OrdersExecuted ${direction}`;
      default:
        return `PeriodEnd ${direction}`;
    }
  }

  /**
   * Validates if a string is a valid AccountHistorySortColumn.
   */
  static isValidSortColumn(value: string): value is AccountHistorySortColumn {
    return VALID_SORT_COLUMNS.includes(value as AccountHistorySortColumn);
  }

  /**
   * Validates if a string is a valid SortDirection.
   */
  static isValidSortDirection(value: string): value is SortDirection {
    return value === 'asc' || value === 'desc';
  }

  /**
   * Validates if a string is a valid RollupPeriod.
   */
  static isValidRollupPeriod(value: any): value is RollupPeriod {
    return Object.values(RollupPeriod).includes(Number(value));
  }

  /**
   * Creates a AccountHistoryFilter from query parameters with validation.
   * Returns a AccountHistoryFilter with validated values or defaults if invalid.
   */
  static fromQueryParams(
    sortColumn?: string,
    sortDirection?: string,
    accountId?: string | null,
    dateRange?: string | null,
    rollupPeriod?: string | null,
    brokerId?: string | null
  ): AccountHistoryFilter {
    const validColumn = sortColumn && this.isValidSortColumn(sortColumn)
      ? sortColumn
      : 'PeriodEnd';
    
    const validDirection = sortDirection && this.isValidSortDirection(sortDirection)
      ? sortDirection
      : 'desc';
    
    const validAccountId = accountId && accountId !== 'null' && accountId !== '' 
      ? parseInt(accountId, 10) 
      : null;
    
    let validRollupPeriod = RollupPeriod.Daily;
    if (rollupPeriod) {
      const parsed = parseInt(rollupPeriod, 10);
      if (this.isValidRollupPeriod(parsed)) {
        validRollupPeriod = parsed;
      }
    }
    const validBrokerId = brokerId && brokerId !== 'null' && brokerId !== '' ? parseInt(brokerId, 10) : null;
    
    // Determine date window from dateRange key
    const rangeKey = dateRange && dateRange !== 'null' && dateRange !== '' ? dateRange : 'YTD';
    const { startDate, endDate } = this.getDateWindowForKey(rangeKey);

    return new AccountHistoryFilter(validColumn, validDirection, validAccountId, startDate, endDate, validRollupPeriod, validBrokerId);
  }

  /**
  * Maps the date range key from the client to an inclusive start/end YYYY-MM-DD.
  * Recognized keys: 'TODAY', 'YTD', 'THIS_WEEK', 'PRIOR_WEEK', 'THIS_MONTH',
  * 'LAST_15_DAYS', 'LAST_30_DAYS', 'LAST_60_DAYS', 'LAST_90_DAYS', 'LAST_6_MONTHS', 'LAST_365_DAYS', 'LAST_YEAR', 'ALL'. Defaults to YTD when unknown.
  */
  static getDateWindowForKey(key: string): { startDate: string | null; endDate: string | null } {
    // Use America/New_York as the canonical date zone for PeriodEnd logic
    const TZ = 'America/New_York';
    const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
    // Get y/m/d in the target timezone
    const parts = dtf.formatToParts(new Date());
    let y = 0, m = 0, d = 0;
    for (const p of parts) {
      if (p.type === 'year') y = parseInt(p.value, 10);
      if (p.type === 'month') m = parseInt(p.value, 10) - 1; // month is 0-indexed
      if (p.type === 'day') d = parseInt(p.value, 10);
    }
    const today = new Date(y, m, d);

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const toYMD = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

    switch ((key || 'YTD').toUpperCase()) {
      case 'TODAY': {
        // Single-day range for today (inclusive)
        return { startDate: toYMD(today), endDate: toYMD(today) };
      }
      case 'THIS_WEEK': {
        // ISO week start Monday, no end date (includes current day)
        const day = today.getDay(); // 0 Sun .. 6 Sat
        const diff = (day === 0 ? -6 : 1) - day; // Monday
        const start = new Date(today);
        start.setDate(d + diff);
        return { startDate: toYMD(start), endDate: null };
      }
      case 'PRIOR_WEEK': {
        // previous calendar week Monday..Sunday
        const day = today.getDay();
        const thisMondayOffset = (day === 0 ? -6 : 1) - day;
        const lastMonday = new Date(today);
        lastMonday.setDate(d + thisMondayOffset - 7);
        const lastSunday = new Date(lastMonday);
        lastSunday.setDate(lastMonday.getDate() + 6);
        return { startDate: toYMD(lastMonday), endDate: toYMD(lastSunday) };
      }
      case 'THIS_MONTH': {
        const start = new Date(y, m, 1);
        return { startDate: toYMD(start), endDate: null };
      }
      case 'PRIOR_MONTH': {
        // Previous calendar month: first day to last day
        const prevMonthStart = new Date(y, m - 1, 1);
        const prevMonthEnd = new Date(y, m, 0); // day 0 of current month = last day of previous month
        return { startDate: toYMD(prevMonthStart), endDate: toYMD(prevMonthEnd) };
      }
      case 'LAST_30_DAYS': {
        // Use last 30 days (inclusive of current day)
        const start = new Date(today);
        start.setDate(start.getDate() - 29);
        return { startDate: toYMD(start), endDate: null };
      }
      case 'LAST_15_DAYS': {
        // Use last 15 days (inclusive of current day)
        const start15 = new Date(today);
        start15.setDate(start15.getDate() - 14);
        return { startDate: toYMD(start15), endDate: null };
      }
      case 'LAST_60_DAYS': {
        // Use last 60 days (inclusive of current day)
        const start60 = new Date(today);
        start60.setDate(start60.getDate() - 59);
        return { startDate: toYMD(start60), endDate: null };
      }
      case 'LAST_90_DAYS': {
        // Use last 90 days (inclusive of current day)
        const start = new Date(today);
        start.setDate(start.getDate() - 89);
        return { startDate: toYMD(start), endDate: null };
      }
      case 'LAST_6_MONTHS': {
        // Use last 6 months (inclusive of current day)
        const start = new Date(today);
        // subtract 6 months (keeps day-of-month where possible)
        start.setMonth(start.getMonth() - 6);
        return { startDate: toYMD(start), endDate: null };
      }
      case 'LAST_365_DAYS': {
        // Use last 365 days (inclusive of current day)
        const start = new Date(today);
        start.setDate(start.getDate() - 364);
        return { startDate: toYMD(start), endDate: null };
      }
      case 'LAST_YEAR': {
        const start = new Date(y - 1, 0, 1);
        const end = new Date(y - 1, 11, 31);
        return { startDate: toYMD(start), endDate: toYMD(end) };
      }
      case 'ALL': {
        return { startDate: null, endDate: null };
      }
      case 'YTD':
      default: {
        const start = new Date(y, 0, 1);
        return { startDate: toYMD(start), endDate: null };
      }
    }
  }
}
