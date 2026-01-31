// BalanceFilter.ts
// Encapsulates sorting state for loading AccountHistory rows from the database

import { RollupPeriod } from 'lumostrade';

// Valid sortable columns to prevent SQL injection
const VALID_SORT_COLUMNS = [
  'Name',
  'Broker',
  'Balance',
  'BalanceChangeAmount',
  'BalanceChangePct',
  'InvestedAmount',
  'NetGain',
  'NetGainPct',
  'DrawdownFromATH',
  'TransferAmount',
  'OrdersExecuted',
  'BalanceUpdateTime'
] as const;

export type BalanceSortColumn = typeof VALID_SORT_COLUMNS[number];

export type SortDirection = 'asc' | 'desc';

export class BalanceFilter {
  // Which column is currently sorted
  sortColumn: BalanceSortColumn;
  // Sort direction: ascending or descending
  sortDirection: SortDirection;
  // Optional broker id to filter accounts by broker
  brokerId?: number | null;
  // Optional period end date (YYYY-MM-DD) to filter AccountHistory for a specific period
  periodEnd?: string;
  // Rollup period for the query
  rollupPeriod: RollupPeriod;

  constructor(
    sortColumn: BalanceSortColumn = 'Name',
    sortDirection: SortDirection = 'asc',
    brokerId?: number | null,
    periodEnd?: string,
    rollupPeriod: RollupPeriod = RollupPeriod.Daily
  ) {
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
    this.brokerId = brokerId ?? null;
    this.periodEnd = periodEnd;
    this.rollupPeriod = rollupPeriod;
  }

  /**
   * Returns the ORDER BY clause for SQL queries based on sortColumn and sortDirection.
   * Validates values at runtime as an additional safeguard against SQL injection.
   */
  getOrderByClause(): string {
    // Runtime validation as defensive programming
    if (!BalanceFilter.isValidSortColumn(this.sortColumn)) {
      throw new Error(`Invalid sort column: ${this.sortColumn}`);
    }
    if (!BalanceFilter.isValidSortDirection(this.sortDirection)) {
      throw new Error(`Invalid sort direction: ${this.sortDirection}`);
    }
    
    const direction = this.sortDirection.toUpperCase();
    
    // Map column names to their SQL equivalents
    switch (this.sortColumn) {
      case 'Name':
        return `a.Name ${direction}`;
      case 'Balance':
        return `ab.Balance ${direction}`;
      case 'BalanceChangeAmount':
        return `ab.BalanceChangeAmount ${direction}`;
      case 'BalanceChangePct':
        return `ab.BalanceChangePct ${direction}`;
      case 'InvestedAmount':
        return `ab.InvestedAmount ${direction}`;
      case 'NetGain':
        return `ab.NetGain ${direction}`;
      case 'NetGainPct':
        return `ab.NetGainPct ${direction}`;
      case 'DrawdownFromATH':
        // Order by computed drawdown for the selected period (AllTimeHigh - Balance)
        // Note: this expression relies on aliases used in the AccountHistory query (a and ab)
        return `CASE WHEN ab.Balance IS NULL OR a.AllTimeHigh IS NULL THEN NULL ELSE (a.AllTimeHigh - ab.Balance) END ${direction}`;
      case 'TransferAmount':
        return `ab.TransferAmount ${direction}`;
      case 'OrdersExecuted':
        return `ab.OrdersExecuted ${direction}`;
      case 'BalanceUpdateTime':
        return `ab.BalanceUpdateTime ${direction}`;
      case 'Broker':
        return `b.Name ${direction}, a.Name ${direction}`;
      default:
        return `a.Name ${direction}`;
    }
  }

  /**
   * Validates if a string is a valid BalanceSortColumn.
   */
  static isValidSortColumn(value: string): value is BalanceSortColumn {
    return VALID_SORT_COLUMNS.includes(value as BalanceSortColumn);
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
   * Creates a BalanceFilter from query parameters with validation.
   * Returns a BalanceFilter with validated values or defaults if invalid.
   * Converts date inputs to YYYY-MM-DD strings in America/New_York timezone.
   */
  static fromQueryParams(
    sortColumn?: string,
    sortDirection?: string,
    periodEnd?: string,
    rollupPeriod?: string,
    brokerId?: string | number,
    defaultColumn: BalanceSortColumn = 'Name',
    defaultDirection: SortDirection = 'asc'
  ): BalanceFilter {
    // Import DateUtils and RollupPeriod at top of file for this to work
    const { DateUtils, RollupPeriod: RP } = require('lumostrade');
    
    const validatedColumn = sortColumn && this.isValidSortColumn(sortColumn)
      ? sortColumn
      : defaultColumn;

    const validatedDirection = sortDirection && this.isValidSortDirection(sortDirection)
      ? sortDirection
      : defaultDirection;

    let dateStr: string | undefined = undefined;
    if (periodEnd) {
      const converted = DateUtils.ToDateStringInTimeZone(periodEnd);
      if (converted) {
        dateStr = converted;
      }
    }

    let validRollupPeriod = RP.Daily;
    if (rollupPeriod) {
      const parsed = parseInt(rollupPeriod, 10);
      if (this.isValidRollupPeriod(parsed)) {
        validRollupPeriod = parsed;
      }
    }

    let parsedBrokerId: number | null = null;
    if (brokerId !== undefined && brokerId !== null) {
      const asNum = typeof brokerId === 'string' ? parseInt(brokerId, 10) : Number(brokerId);
      if (!Number.isNaN(asNum)) parsedBrokerId = asNum;
    }

    return new BalanceFilter(validatedColumn, validatedDirection, parsedBrokerId, dateStr, validRollupPeriod);
  }
}
