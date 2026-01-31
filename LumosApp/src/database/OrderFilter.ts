/**
 * Order filter used by the UI to list and query orders. Provides sort/filter fields and
 * helpers to validate and sanitize query parameters.
 */

import { DateFilter, DateFilterValue } from '../utils/DateFilter';
import { SortDirection } from './TradeFilter';

// Valid sortable columns to prevent SQL injection
const VALID_SORT_COLUMNS = [
  'OrderID',
  'AccountID',
  'BrokerID',
  'BrokerOrderID',
  'BrokerOrderStep',
  'TradeID',
  'Symbol',
  'Action',
  'Quantity',
  'Price',
  'TotalFees',
  'OrderAmount',
  'ExecutedTime',
  'IncompleteTrade'
] as const;

export type OrderSortColumn = typeof VALID_SORT_COLUMNS[number];

export type ActionFilter = 'all' | 'buy' | 'sell' | 'buyToOpen' | 'sellToClose' | 'sellToOpen' | 'buyToClose' | 'sellShort' | 'buyToCover';
export type TradeStatusFilter = 'all' | 'open' | 'closed' | 'incomplete';

export class OrderFilter {
  // Which column is currently sorted
  sortColumn: OrderSortColumn;
  // Sort direction: ascending or descending
  sortDirection: SortDirection;
  // Filter for Action field
  actionFilter: ActionFilter;
  // Filter for trade status (open/closed/incomplete)
  tradeStatusFilter: TradeStatusFilter;
  // Filter for specific AccountID (null means all accounts)
  accountId: number | null;
  // Filter for specific BrokerID (null means all brokers)
  brokerId: number | null;
  // Filter for specific Symbol (null means all symbols)
  symbol: string | null;
  // Filter for multiple symbols (null means use symbol property or no filter)
  symbols: string[] | null = null;
  // Filter for specific TradeID (null means all trades)
  tradeId: number | null;
  // Filter for specific BrokerOrderID (null means all orders)
  brokerOrderId: number | null;
  // Filter for specific OrderID (null means all orders)
  orderId: number | null;

  // Date filter for ExecutedTime column (using dateRange format like 'ALL', 'TODAY', 'PRIOR_MONTH', etc.)
  dateRange: string;
  // Specific date filter for ExecutedTime (YYYY-MM-DD format, takes precedence over dateRange)
  executedDate: string | null;

  constructor(
    sortColumn: OrderSortColumn = 'OrderID',
    sortDirection: SortDirection = 'desc',
    actionFilter: ActionFilter = 'all',
    tradeStatusFilter: TradeStatusFilter = 'all',
    accountId: number | null = null,
    brokerId: number | null = null,
    symbol: string | null = null,
    tradeId: number | null = null,
    brokerOrderId: number | null = null,
    orderId: number | null = null,
    dateRange: string = 'ALL',
    executedDate: string | null = null
  ) {
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
    this.actionFilter = actionFilter;
    this.tradeStatusFilter = tradeStatusFilter;
    this.accountId = accountId;
    this.brokerId = brokerId;
    this.symbol = symbol;
    this.tradeId = tradeId;
    this.brokerOrderId = brokerOrderId;
    this.orderId = orderId;
    this.dateRange = dateRange;
    this.executedDate = executedDate;
  }

  /** Return an ORDER BY clause for SQL with validated column/direction. */
  getOrderByClause(): string {
    // Runtime validation as defensive programming, even though types should prevent invalid values
    if (!OrderFilter.isValidSortColumn(this.sortColumn)) {
      throw new Error(`Invalid sort column: ${this.sortColumn}`);
    }
    if (!OrderFilter.isValidSortDirection(this.sortDirection)) {
      throw new Error(`Invalid sort direction: ${this.sortDirection}`);
    }
    const direction = this.sortDirection.toUpperCase();
    
    // When sorting by BrokerID, add secondary sort on AccountID in same direction
    if (this.sortColumn === 'BrokerID') {
      return `${this.sortColumn} ${direction}, AccountID ${direction}`;
    }
    
    return `${this.sortColumn} ${direction}`;
  }

  /** Return true if value is a valid OrderSortColumn. */
  static isValidSortColumn(value: string): value is OrderSortColumn {
    return VALID_SORT_COLUMNS.includes(value as OrderSortColumn);
  }

  /** Return true if value is 'asc' or 'desc'. */
  static isValidSortDirection(value: string): value is SortDirection {
    return value === 'asc' || value === 'desc';
  }

  /**
   * Validates if a string is a valid ActionFilter.
   */
  static isValidActionFilter(value: string): value is ActionFilter {
    return value === 'all' || value === 'buy' || value === 'sell' || 
           value === 'buyToOpen' || value === 'sellToClose' || 
           value === 'sellToOpen' || value === 'buyToClose' ||
           value === 'sellShort' || value === 'buyToCover';
  }

  /**
   * Validates if a string is a valid TradeStatusFilter.
   */
  static isValidTradeStatusFilter(value: string): value is TradeStatusFilter {
    return value === 'all' || value === 'open' || value === 'closed' || value === 'incomplete';
  }

  /**
   * Sanitizes a symbol, allowing simple stock-symbol characters; returns null when invalid.
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

  /**
   * Creates an OrderFilter from query parameters with validation.
   * Returns an OrderFilter with validated values or defaults if invalid.
   */
  static fromQueryParams(
    sortColumn?: string,
    sortDirection?: string,
    actionFilter?: string,
    tradeStatusFilter?: string,
    accountId?: string,
    brokerId?: string,
    symbol?: string,
    tradeId?: string,
    brokerOrderId?: string,
    orderId?: string,
    dateRange?: string,
    executedDate?: string,
    defaultColumn: OrderSortColumn = 'OrderID',
    defaultDirection: SortDirection = 'desc',
    defaultActionFilter: ActionFilter = 'all',
    defaultTradeStatusFilter: TradeStatusFilter = 'all'
  ): OrderFilter {
    const validatedColumn = sortColumn && this.isValidSortColumn(sortColumn)
      ? sortColumn
      : defaultColumn;

    const validatedDirection = sortDirection && this.isValidSortDirection(sortDirection)
      ? sortDirection
      : defaultDirection;

    const validatedActionFilter = actionFilter && this.isValidActionFilter(actionFilter)
      ? actionFilter
      : defaultActionFilter;

    const validatedTradeStatusFilter = tradeStatusFilter && this.isValidTradeStatusFilter(tradeStatusFilter)
      ? tradeStatusFilter
      : defaultTradeStatusFilter;

    // Validate accountId - must be a positive integer or null
    let validatedAccountId: number | null = null;
    if (accountId !== undefined && accountId !== null && accountId !== '') {
      const parsed = parseInt(accountId, 10);
      if (!isNaN(parsed) && parsed > 0) {
        validatedAccountId = parsed;
      }
    }

    // Validate brokerId - must be a positive integer or null
    let validatedBrokerId: number | null = null;
    if (brokerId !== undefined && brokerId !== null && brokerId !== '') {
      const parsed = parseInt(brokerId, 10);
      if (!isNaN(parsed) && parsed > 0) {
        validatedBrokerId = parsed;
      }
    }

    // Validate tradeId - must be a positive integer or null
    let validatedTradeId: number | null = null;
    if (tradeId !== undefined && tradeId !== null && tradeId !== '') {
      const parsed = parseInt(tradeId, 10);
      if (!isNaN(parsed) && parsed > 0) {
        validatedTradeId = parsed;
      }
    }

    // Validate brokerOrderId - must be a positive integer or null
    let validatedBrokerOrderId: number | null = null;
    if (brokerOrderId !== undefined && brokerOrderId !== null && brokerOrderId !== '') {
      const parsed = parseInt(brokerOrderId, 10);
      if (!isNaN(parsed) && parsed > 0) {
        validatedBrokerOrderId = parsed;
      }
    }

    // Validate orderId - must be a positive integer or null
    let validatedOrderId: number | null = null;
    if (orderId !== undefined && orderId !== null && orderId !== '') {
      const parsed = parseInt(orderId, 10);
      if (!isNaN(parsed) && parsed > 0) {
        validatedOrderId = parsed;
      }
    }

    // Validate and sanitize symbol
    const validatedSymbol = this.sanitizeSymbol(symbol);

    // Validate dateRange - default to 'ALL' if not provided or invalid
    const validatedDateRange = (dateRange && typeof dateRange === 'string' && dateRange.trim() !== '') ? dateRange.trim() : 'ALL';

    // Validate executedDate (YYYY-MM-DD format)
    let validatedExecutedDate: string | null = null;
    if (executedDate !== undefined && executedDate !== null && executedDate !== '') {
      if (DateFilter.isValidSpecificDate(executedDate)) {
        validatedExecutedDate = executedDate;
      }
    }

    return new OrderFilter(
      validatedColumn, 
      validatedDirection, 
      validatedActionFilter, 
      validatedTradeStatusFilter, 
      validatedAccountId, 
      validatedBrokerId,
      validatedSymbol,
      validatedTradeId,
      validatedBrokerOrderId,
      validatedOrderId,
      validatedDateRange,
      validatedExecutedDate
    );
  }

  /**
   * Returns the WHERE clause for SQL queries based on filter settings.
   * Returns empty string if no filters are active.
   * @param tableAlias Optional table alias prefix (e.g., 'o.' for 'o.AccountID')
   */
  getWhereClause(tableAlias: string = ''): string {
    const conditions: string[] = [];
    const prefix = tableAlias ? `${tableAlias}.` : '';

    if (this.accountId !== null) {
      conditions.push(`${prefix}AccountID = ${this.accountId}`);
    }

    if (this.brokerId !== null) {
      // BrokerID is in the Accounts table, not Orders table
      conditions.push(`a.BrokerID = ${this.brokerId}`);
    }

    if (this.symbols !== null && this.symbols.length > 0) {
      // Multiple symbols filter
      const quotedSymbols = this.symbols.map(s => `'${s}'`).join(',');
      conditions.push(`${prefix}Symbol IN (${quotedSymbols})`);
    } else if (this.symbol !== null) {
      // Symbol has been pre-validated and sanitized, safe to interpolate
      conditions.push(`${prefix}Symbol = '${this.symbol}'`);
    }

    if (this.tradeId !== null) {
      conditions.push(`${prefix}TradeID = ${this.tradeId}`);
    }

    if (this.brokerOrderId !== null) {
      conditions.push(`${prefix}BrokerOrderID = ${this.brokerOrderId}`);
    }

    if (this.orderId !== null) {
      conditions.push(`${prefix}OrderID = ${this.orderId}`);
    }

    if (this.actionFilter !== 'all') {
      // Map filter values to database action strings
      const actionMap: Record<string, string> = {
        'buy': 'BUY',
        'sell': 'SELL',
        'buyToOpen': 'BUY_TO_OPEN',
        'sellToClose': 'SELL_TO_CLOSE',
        'sellToOpen': 'SELL_TO_OPEN',
        'buyToClose': 'BUY_TO_CLOSE',
        'sellShort': 'SELL_SHORT',
        'buyToCover': 'BUY_TO_COVER'
      };
      const actionValue = actionMap[this.actionFilter];
      if (actionValue) {
        conditions.push(`${prefix}Action = '${actionValue}'`);
      }
    }

    if (this.tradeStatusFilter === 'open') {
      // Open trades: either no TradeID, or joined Trade exists but CloseDate IS NULL. Exclude incomplete trades.
      // Use t.CloseDate from joined Trades table when available.
      conditions.push(`(${prefix}TradeID IS NULL OR t.CloseDate IS NULL)`);
      conditions.push(`${prefix}IncompleteTrade = 0`);
    } else if (this.tradeStatusFilter === 'closed') {
      // Closed trades: TradeID is not null and joined Trade CloseDate is not null
      conditions.push(`${prefix}TradeID IS NOT NULL`);
      conditions.push(`t.CloseDate IS NOT NULL`);
    } else if (this.tradeStatusFilter === 'incomplete') {
      // Incomplete trades: IncompleteTrade is true
      conditions.push(`${prefix}IncompleteTrade = 1`);
    }

    // Add date filter condition using DateFilter utility
    // executedDate takes precedence over dateRange
    if (this.executedDate !== null) {
      const specificDateCondition = DateFilter.getSqlConditionForSpecificDate('ExecutedTime', this.executedDate, tableAlias);
      if (specificDateCondition) {
        conditions.push(specificDateCondition);
      }
    } else if (this.dateRange && this.dateRange !== 'ALL') {
      const dateRangeCondition = DateFilter.getSqlConditionForDateRange('ExecutedTime', this.dateRange, tableAlias);
      if (dateRangeCondition) {
        conditions.push(dateRangeCondition);
      }
    }

    return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  }
}
