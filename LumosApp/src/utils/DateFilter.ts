/**
 * Date filter helpers for the UI. Produces US Eastern Time date ranges (converted to UTC)
 * and SQL condition fragments used by queries across trades, orders, and reports.
 */

import { DateUtils } from 'lumostrade';

export type DateFilterValue = 'all' | 'today' | 'thisWeek' | 'thisMonth' | 'last3Months' | 'yearToDate' | 'lastYear';

export class DateFilter {
  static isValidDateFilter(value: string): value is DateFilterValue {
    return value === 'all' || 
           value === 'today' || 
           value === 'thisWeek' || 
           value === 'thisMonth' || 
           value === 'last3Months' || 
           value === 'yearToDate' || 
           value === 'lastYear';
  }

  static isValidSpecificDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value);
    return !isNaN(d.getTime());
  }

  /** 
   * Parse a DateRangeDropdown-style value into start/end UTC boundaries (ET semantics).
   * Returns null for 'ALL' or unsupported values.
   */
  static getDateRangeFromString(rangeValue: string): { start: Date; end: Date } | null {
    if (!rangeValue || rangeValue === 'ALL') {
      return null;
    }

    // Handle milestone format: "MILESTONE:123"
    if (rangeValue.startsWith('MILESTONE:')) {
      return null;
    }

    const todayStr = DateUtils.GetEasternToday();
    const [y, m, d] = todayStr.split('-').map(Number);
    
    const makeDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
    const todayDate = makeDate(y, m, d);
    
    let startEt: Date;
    let endEt: Date;

    switch (rangeValue) {
      case 'TODAY': {
        startEt = todayDate;
        endEt = new Date(todayDate);
        endEt.setUTCDate(endEt.getUTCDate() + 1);
        break;
      }
      case 'THIS_WEEK': {
        startEt = new Date(todayDate);
        startEt.setUTCDate(startEt.getUTCDate() - startEt.getUTCDay());
        endEt = new Date(startEt);
        endEt.setUTCDate(endEt.getUTCDate() + 7);
        break;
      }
      case 'THIS_MONTH': {
        startEt = new Date(Date.UTC(y, m - 1, 1));
        endEt = new Date(Date.UTC(y, m, 1));
        break;
      }
      case 'PRIOR_MONTH': {
        startEt = new Date(Date.UTC(y, m - 2, 1));
        endEt = new Date(Date.UTC(y, m - 1, 1));
        break;
      }
      case 'LAST_15_DAYS': {
        startEt = new Date(todayDate);
        startEt.setUTCDate(startEt.getUTCDate() - 15);
        endEt = new Date(todayDate);
        endEt.setUTCDate(endEt.getUTCDate() + 1);
        break;
      }
      case 'LAST_30_DAYS': {
        startEt = new Date(todayDate);
        startEt.setUTCDate(startEt.getUTCDate() - 30);
        endEt = new Date(todayDate);
        endEt.setUTCDate(endEt.getUTCDate() + 1);
        break;
      }
      case 'LAST_60_DAYS': {
        startEt = new Date(todayDate);
        startEt.setUTCDate(startEt.getUTCDate() - 60);
        endEt = new Date(todayDate);
        endEt.setUTCDate(endEt.getUTCDate() + 1);
        break;
      }
      case 'LAST_90_DAYS': {
        startEt = new Date(todayDate);
        startEt.setUTCDate(startEt.getUTCDate() - 90);
        endEt = new Date(todayDate);
        endEt.setUTCDate(endEt.getUTCDate() + 1);
        break;
      }
      case 'LAST_6_MONTHS': {
        startEt = new Date(Date.UTC(y, m - 1 - 6, d));
        endEt = new Date(todayDate);
        endEt.setUTCDate(endEt.getUTCDate() + 1);
        break;
      }
      case 'LAST_365_DAYS': {
        startEt = new Date(todayDate);
        startEt.setUTCDate(startEt.getUTCDate() - 365);
        endEt = new Date(todayDate);
        endEt.setUTCDate(endEt.getUTCDate() + 1);
        break;
      }
      case 'YTD': {
        startEt = new Date(Date.UTC(y, 0, 1));
        endEt = new Date(todayDate);
        endEt.setUTCDate(endEt.getUTCDate() + 1);
        break;
      }
      case 'LAST_YEAR': {
        startEt = new Date(Date.UTC(y - 1, 0, 1));
        endEt = new Date(Date.UTC(y, 0, 1));
        break;
      }
      default:
        return null;
    }

    const fmt = (date: Date) => date.toISOString().split('T')[0];
    return {
      start: DateUtils.GetEasternStartOfDayUTC(fmt(startEt)),
      end: DateUtils.GetEasternStartOfDayUTC(fmt(endEt))
    };
  }

  static getDateRange(filter: DateFilterValue): { start: Date; end: Date } | null {
    if (filter === 'all') {
      return null;
    }

    // Get today in ET
    const todayStr = DateUtils.GetEasternToday();
    const [y, m, d] = todayStr.split('-').map(Number);
    
    // Use UTC dates to perform date math without timezone interference,
    // treating them as "ET Date" holders.
    const makeDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
    const fmt = (date: Date) => date.toISOString().split('T')[0];
    
    const todayDate = makeDate(y, m, d);
    
    let startEt: Date;
    let endEt: Date; // Exclusive end date (start of next day)

    switch (filter) {
      case 'today': {
        startEt = todayDate;
        endEt = new Date(todayDate);
        endEt.setUTCDate(endEt.getUTCDate() + 1);
        break;
      }
      case 'thisWeek': {
        startEt = new Date(todayDate);
        startEt.setUTCDate(startEt.getUTCDate() - startEt.getUTCDay()); // Start of week (Sunday)
        endEt = new Date(startEt);
        endEt.setUTCDate(endEt.getUTCDate() + 7);
        break;
      }
      case 'thisMonth': {
        startEt = new Date(Date.UTC(y, m - 1, 1));
        endEt = new Date(Date.UTC(y, m, 1));
        break;
      }
      case 'last3Months': {
        // From 3 months ago 1st, up to end of today
        startEt = new Date(Date.UTC(y, m - 1 - 3, 1));
        endEt = new Date(todayDate);
        endEt.setUTCDate(endEt.getUTCDate() + 1);
        break;
      }
      case 'yearToDate': {
        startEt = new Date(Date.UTC(y, 0, 1));
        endEt = new Date(todayDate);
        endEt.setUTCDate(endEt.getUTCDate() + 1);
        break;
      }
      case 'lastYear': {
        startEt = new Date(Date.UTC(y - 1, 0, 1));
        endEt = new Date(Date.UTC(y, 0, 1));
        break;
      }
      default:
        return null;
    }

    // Convert ET boundaries to UTC timestamps
    return {
      start: DateUtils.GetEasternStartOfDayUTC(fmt(startEt)),
      end: DateUtils.GetEasternStartOfDayUTC(fmt(endEt))
    };
  }

  /** Parse a query param into a DateFilterValue (defaults to 'all'). */
  static fromQueryParam(value?: string | null): DateFilterValue {
    if (!value) return 'all';
    if (this.isValidDateFilter(value)) return value as DateFilterValue;
    return 'all';
  }

  /**
   * Returns an SQL condition fragment (no leading WHERE) for the given column and filter.
   * Returns an empty string for 'all'.
   */
  static getSqlCondition(columnName: string, filter: DateFilterValue, tableAlias: string = ''): string {
    const alias = tableAlias ? `${tableAlias}.` : '';
    const range = this.getDateRange(filter);
    if (!range) return '';

    const startIso = range.start.toISOString().slice(0, 19).replace('T', ' ');
    const endIso = range.end.toISOString().slice(0, 19).replace('T', ' ');

    return `${alias}${columnName} >= '${startIso}' AND ${alias}${columnName} < '${endIso}'`;
  }

  /**
   * Returns an SQL condition fragment for filtering by a specific date (YYYY-MM-DD).
   * Returns an empty string if date is invalid.
   * The input date is assumed to be in US Eastern Time.
   */
  static getSqlConditionForSpecificDate(columnName: string, dateStr: string, tableAlias: string = ''): string {
    if (!this.isValidSpecificDate(dateStr)) return '';
    const alias = tableAlias ? `${tableAlias}.` : '';
    
    // Get UTC boundaries for this ET date
    const start = DateUtils.GetEasternStartOfDayUTC(dateStr);
    const end = new Date(start.getTime() + 86400000); // +1 day
    
    const startIso = start.toISOString().slice(0, 19).replace('T', ' ');
    const endIso = end.toISOString().slice(0, 19).replace('T', ' ');
    
    return `${alias}${columnName} >= '${startIso}' AND ${alias}${columnName} < '${endIso}'`;
  }

  /**
   * Returns an SQL condition fragment for filtering by a dateRange string (used by DateRangeDropdown).
   * Supports values like 'TODAY', 'PRIOR_MONTH', 'LAST_15_DAYS', 'YTD', etc.
   * Returns an empty string for 'ALL' or invalid values.
   */
  static getSqlConditionForDateRange(columnName: string, rangeValue: string, tableAlias: string = ''): string {
    const alias = tableAlias ? `${tableAlias}.` : '';
    const range = this.getDateRangeFromString(rangeValue);
    if (!range) return '';

    const startIso = range.start.toISOString().slice(0, 19).replace('T', ' ');
    const endIso = range.end.toISOString().slice(0, 19).replace('T', ' ');

    return `${alias}${columnName} >= '${startIso}' AND ${alias}${columnName} < '${endIso}'`;
  }
}
