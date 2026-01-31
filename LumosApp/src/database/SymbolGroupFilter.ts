// SymbolGroupFilter.ts
// Encapsulates sorting and filtering state for loading SymbolGroup rows from the database

// Valid sortable columns to prevent SQL injection
const VALID_SORT_COLUMNS = [
  'Name',
  'Symbols',
  'LastUpdated'
] as const;

export type SymbolGroupSortColumn = typeof VALID_SORT_COLUMNS[number];

export type SortDirection = 'asc' | 'desc';

export class SymbolGroupFilter {
  // Which column is currently sorted
  sortColumn: SymbolGroupSortColumn;
  // Sort direction: ascending or descending
  sortDirection: SortDirection;
  // Optional search text to filter by name or symbols
  searchText?: string;

  constructor(
    sortColumn: SymbolGroupSortColumn = 'Name',
    sortDirection: SortDirection = 'asc',
    searchText?: string
  ) {
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
    this.searchText = searchText;
  }

  /**
   * Returns the ORDER BY clause for SQL queries based on sortColumn and sortDirection.
   * Validates values at runtime as an additional safeguard against SQL injection.
   */
  getOrderByClause(): string {
    // Runtime validation as defensive programming
    if (!SymbolGroupFilter.isValidSortColumn(this.sortColumn)) {
      throw new Error(`Invalid sort column: ${this.sortColumn}`);
    }
    if (!SymbolGroupFilter.isValidSortDirection(this.sortDirection)) {
      throw new Error(`Invalid sort direction: ${this.sortDirection}`);
    }

    return `${this.sortColumn} ${this.sortDirection.toUpperCase()}`;
  }

  /**
   * Returns the WHERE clause for SQL queries based on searchText.
   * Returns an empty string if no search text is provided.
   * Note: The caller is responsible for providing the parameter value if using placeholders.
   * However, since we're building the query string here, we'll return the clause with placeholders.
   */
  getWhereClause(): string {
    if (!this.searchText || this.searchText.trim() === '') {
      return '';
    }

    // We'll use a simple LIKE search across Name and Symbols columns
    // The caller should supply the search term parameter 2 times
    return `WHERE (Name LIKE ? OR Symbols LIKE ?)`;
  }

  static isValidSortColumn(column: string): column is SymbolGroupSortColumn {
    return VALID_SORT_COLUMNS.includes(column as SymbolGroupSortColumn);
  }

  static isValidSortDirection(direction: string): direction is SortDirection {
    return ['asc', 'desc'].includes(direction);
  }
}
