export type MilestoneSortColumn = 'DayStart' | 'DayEnd' | 'Name' | 'AccountName';
export type SortDirection = 'asc' | 'desc';

export class MilestoneFilter {
  sortColumn: MilestoneSortColumn;
  sortDirection: SortDirection;

  constructor(
    sortColumn: MilestoneSortColumn = 'DayStart',
    sortDirection: SortDirection = 'desc'
  ) {
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
  }

  getOrderByClause(alias: string = 'm'): string {
    let col = this.sortColumn as string;
    if (col === 'AccountName') {
      col = 'a.Name';
    } else {
      col = `${alias}.${col}`;
    }
    return `${col} ${this.sortDirection.toUpperCase()}`;
  }
}
