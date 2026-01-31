// ExpectedMovesFilter.ts
// Encapsulates sorting and filter state for loading ExpectedMoves rows from the database

const VALID_SORT_COLUMNS = [
  'Symbol',
  'ExpiryType',
  'ExpiryDate',
  'CurrentPrice',
  'IV',
  'ClosingPrice',
  'Delta',
  'OneSigmaHigh',
  'OneSigmaLow',
  'TwoSigmaHigh',
  'TwoSigmaLow',
  'LastUpdated'
] as const;

export type ExpectedMovesSortColumn = typeof VALID_SORT_COLUMNS[number];
export type SortDirection = 'asc' | 'desc';
export type InitialValueFilter = 'initial' | 'latest';

export class ExpectedMovesFilter {
  sortColumn: ExpectedMovesSortColumn;
  sortDirection: SortDirection;
  initialValue: InitialValueFilter;
  expiryTypes: string[] | null;
  symbol: string | null;

  constructor(
    sortColumn: ExpectedMovesSortColumn = 'Symbol',
    sortDirection: SortDirection = 'asc',
    initialValue: InitialValueFilter = 'initial',
    expiryTypes: string[] | null = null,
    symbol: string | null = null
  ) {
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
    this.initialValue = initialValue;
    this.expiryTypes = expiryTypes;
    this.symbol = symbol;
  }

  getOrderByClause(tableAlias: string = 'em'): string {
    if (!ExpectedMovesFilter.isValidSortColumn(this.sortColumn)) {
      throw new Error(`Invalid sort column: ${this.sortColumn}`);
    }
    if (!ExpectedMovesFilter.isValidSortDirection(this.sortDirection)) {
      throw new Error(`Invalid sort direction: ${this.sortDirection}`);
    }
    const direction = this.sortDirection.toUpperCase();
    // Special-case sort columns that come from joined tables
    if (this.sortColumn === 'CurrentPrice') {
      // Order by the latest quote price for the symbol (correlated subquery)
      return `(SELECT q2.Price FROM Quotes q2 WHERE q2.Symbol = ${tableAlias}.Symbol ORDER BY q2.LastUpdated DESC LIMIT 1) ${direction}`;
    }

    const prefix = tableAlias ? `${tableAlias}.` : '';
    return `${prefix}${this.sortColumn} ${direction}`;
  }

  getWhereClause(tableAlias: string = 'em'): string {
    const conditions: string[] = [];
    const prefix = tableAlias ? `${tableAlias}.` : '';

    // Filter by InitialValue
    if (this.initialValue === 'initial') {
      conditions.push(`${prefix}InitialValue = b'1'`);
    } else if (this.initialValue === 'latest') {
      conditions.push(`${prefix}InitialValue = b'0'`);
    }

    // Filter by ExpiryType
    if (this.expiryTypes && this.expiryTypes.length > 0) {
      const quotedTypes = this.expiryTypes.map(t => `'${t}'`).join(',');
      conditions.push(`${prefix}ExpiryType IN (${quotedTypes})`);
    }

    return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  }

  static isValidSortColumn(column: string): column is ExpectedMovesSortColumn {
    return VALID_SORT_COLUMNS.includes(column as ExpectedMovesSortColumn);
  }

  static isValidSortDirection(direction: string): direction is SortDirection {
    return direction === 'asc' || direction === 'desc';
  }

  static fromQueryParams(
    sortKey?: string,
    sortDirection?: string,
    initialValue?: string,
    expiryTypes?: string,
    symbol?: string
  ): ExpectedMovesFilter {
    const sortCol: ExpectedMovesSortColumn = 
      sortKey && ExpectedMovesFilter.isValidSortColumn(sortKey) 
        ? sortKey 
        : 'Symbol';
    
    const sortDir: SortDirection = 
      sortDirection && ExpectedMovesFilter.isValidSortDirection(sortDirection) 
        ? sortDirection 
        : 'asc';
    
    const initialVal: InitialValueFilter = 
      initialValue === 'latest' ? 'latest' : 'initial';
    
    const expiryTypeList = expiryTypes ? expiryTypes.split(',').filter(t => t.length > 0) : null;
    const symbolVal = symbol && symbol.trim().length > 0 ? symbol.trim().toUpperCase() : null;
    
    return new ExpectedMovesFilter(sortCol, sortDir, initialVal, expiryTypeList, symbolVal);
  }
}
