import { DateUtils } from './DateUtils';
import { SimulationContext } from '../processor/Simulator/SimulationContext';

export enum RollupPeriod {
  Daily = 1,
  Weekly = 2,
  Monthly = 3
}

export interface RollupPeriodCache {
  current: [string, string];
  previous: [string, string];
}

export class RollupUtils {
  
  /**
   * Get the rollup period (start and end dates) for a given date and rollup period type.
   * Returns dates as YYYY-MM-DD strings in US Eastern Time.
   * Start and end dates are always business days (Monday-Friday).
   * 
   * @param rollupPeriod - The type of rollup period (Daily, Weekly, Monthly)
   * @param date - The date to find the period for (defaults to current date)
   * @returns Tuple of [startDate, endDate] as YYYY-MM-DD strings in Eastern Time
   */
  public static GetRollupPeriod(
    rollupPeriod: RollupPeriod,
    date: Date = new Date()
  ): [string, string] {
    // Convert input date to Eastern Time date string
    const etDateStr = DateUtils.ToDateStringInTimeZone(date, 'America/New_York')!;
    const etDate = new Date(etDateStr + 'T12:00:00'); // Use noon to avoid DST edge cases
    
    switch (rollupPeriod) {
      case RollupPeriod.Daily:
        return this.getDailyPeriod(etDate);
      case RollupPeriod.Weekly:
        return this.getWeeklyPeriod(etDate);
      case RollupPeriod.Monthly:
        return this.getMonthlyPeriod(etDate);
      default:
        throw new Error(`Unknown rollup period: ${rollupPeriod}`);
    }
  }

  /**
   * Get the next rollup period after the given date.
   * 
   * @param rollupPeriod - The type of rollup period
   * @param date - The reference date (defaults to current date)
   * @returns Tuple of [startDate, endDate] for the next period
   */
  public static GetNextRollupPeriod(
    rollupPeriod: RollupPeriod,
    date: Date = new Date()
  ): [string, string] {
    const etDateStr = DateUtils.ToDateStringInTimeZone(date, 'America/New_York')!;
    const etDate = new Date(etDateStr + 'T12:00:00');
    
    switch (rollupPeriod) {
      case RollupPeriod.Daily: {
        // Get the current period to know what business day we're on
        const [currentBusinessDay] = this.getDailyPeriod(etDate);
        const currentBizDate = new Date(currentBusinessDay + 'T12:00:00');
        
        // Move to next business day from the current business day
        const dayOfWeek = DateUtils.GetDayOfWeek(currentBizDate);
        const nextDay = new Date(currentBizDate);
        
        if (dayOfWeek === 5) { // Friday -> Monday
          nextDay.setDate(nextDay.getDate() + 3);
        } else { // Any other weekday -> next day
          nextDay.setDate(nextDay.getDate() + 1);
        }
        
        const nextBusinessDay = DateUtils.FormatDateString(nextDay);
        return [nextBusinessDay, nextBusinessDay];
      }
      case RollupPeriod.Weekly: {
        // Move to next Monday
        const dayOfWeek = DateUtils.GetDayOfWeek(etDate);
        const nextMonday = new Date(etDate);
        let daysToAdd = 0;
        
        if (dayOfWeek === 0) { // Sunday -> next day is Monday
          daysToAdd = 1;
        } else if (dayOfWeek === 6) { // Saturday -> 2 days to Monday
          daysToAdd = 2;
        } else { // Weekday -> days until next Monday
          daysToAdd = 8 - dayOfWeek; // e.g., Monday(1) -> 7 days, Friday(5) -> 3 days
        }
        nextMonday.setDate(nextMonday.getDate() + daysToAdd);
        return this.getWeeklyPeriod(nextMonday);
      }
      case RollupPeriod.Monthly: {
        // Move to first day of next month
        const nextMonth = new Date(etDate.getFullYear(), etDate.getMonth() + 1, 1);
        return this.getMonthlyPeriod(nextMonth);
      }
      default:
        throw new Error(`Unknown rollup period: ${rollupPeriod}`);
    }
  }

  /**
   * Get the previous rollup period before the given date.
   * 
   * @param rollupPeriod - The type of rollup period
   * @param date - The reference date (defaults to current date)
   * @returns Tuple of [startDate, endDate] for the previous period
   */
  public static GetPreviousRollupPeriod(
    rollupPeriod: RollupPeriod,
    date: Date = new Date()
  ): [string, string] {
    const etDateStr = DateUtils.ToDateStringInTimeZone(date, 'America/New_York')!;
    const etDate = new Date(etDateStr + 'T12:00:00');
    
    switch (rollupPeriod) {
      case RollupPeriod.Daily: {
        // Get the current period to know what business day we're on
        const [currentBusinessDay] = this.getDailyPeriod(etDate);
        const currentBizDate = new Date(currentBusinessDay + 'T12:00:00');
        
        // Move to previous business day from the current business day
        const dayOfWeek = DateUtils.GetDayOfWeek(currentBizDate);
        const prevDay = new Date(currentBizDate);
        
        if (dayOfWeek === 1) { // Monday -> Friday
          prevDay.setDate(prevDay.getDate() - 3);
        } else { // Any other weekday -> previous day
          prevDay.setDate(prevDay.getDate() - 1);
        }
        
        const prevBusinessDay = DateUtils.FormatDateString(prevDay);
        return [prevBusinessDay, prevBusinessDay];
      }
      case RollupPeriod.Weekly: {
        // Move to previous Monday
        const dayOfWeek = DateUtils.GetDayOfWeek(etDate);
        const prevMonday = new Date(etDate);
        let daysToSubtract = 0;
        
        if (dayOfWeek === 0) { // Sunday -> go back 13 days (6 to prev Monday + 7 more)
          daysToSubtract = 13;
        } else if (dayOfWeek === 6) { // Saturday -> go back 12 days (5 to this week's Monday + 7 more)
          daysToSubtract = 12;
        } else { // Weekday -> go back to previous Monday (7 days + days from this Monday)
          daysToSubtract = dayOfWeek + 6; // e.g., Monday(1) -> 7, Friday(5) -> 11
        }
        prevMonday.setDate(prevMonday.getDate() - daysToSubtract);
        return this.getWeeklyPeriod(prevMonday);
      }
      case RollupPeriod.Monthly: {
        // Move to first day of previous month
        const prevMonth = new Date(etDate.getFullYear(), etDate.getMonth() - 1, 1);
        return this.getMonthlyPeriod(prevMonth);
      }
      default:
        throw new Error(`Unknown rollup period: ${rollupPeriod}`);
    }
  }

  /**
   * Build a cache of current and previous rollup periods for all rollup period types.
   * 
   * @param simContext - Optional simulation context to use simulated date
   * @returns Map of RollupPeriod to RollupPeriodCache objects containing current and previous period tuples
   */
  public static BuildPeriodCache(simContext?: SimulationContext): Map<RollupPeriod, RollupPeriodCache> {
    const date = simContext?.simulatedDate ?? new Date();
    const cache = new Map<RollupPeriod, RollupPeriodCache>();
    
    for (const period of [RollupPeriod.Daily, RollupPeriod.Weekly, RollupPeriod.Monthly]) {
      const current = this.GetRollupPeriod(period, date);
      const previous = this.GetPreviousRollupPeriod(period, date);
      cache.set(period, { current, previous });
    }
    
    return cache;
  }

  // Private helper methods

  private static getDailyPeriod(date: Date): [string, string] {
    const businessDay = DateUtils.GetMostRecentBusinessDay(new Date(date));
    return [businessDay, businessDay];
  }

  private static getWeeklyPeriod(date: Date): [string, string] {
    const dayOfWeek = DateUtils.GetDayOfWeek(date);
    const workingDate = new Date(date);
    
    // Find Monday of the week
    let daysToMonday = dayOfWeek - 1; // Monday is day 1
    if (dayOfWeek === 0) { // Sunday belongs to previous week
      daysToMonday = 6; // Go back 6 days to previous Monday
    } else if (dayOfWeek === 6) { // Saturday belongs to the week that just ended
      daysToMonday = 5; // Go back 5 days to Monday
    }
    workingDate.setDate(workingDate.getDate() - daysToMonday);
    const monday = DateUtils.FormatDateString(workingDate);
    
    // Find Friday of the same week
    workingDate.setDate(workingDate.getDate() + 4); // Monday + 4 days = Friday
    const friday = DateUtils.FormatDateString(workingDate);
    
    return [monday, friday];
  }

  private static getMonthlyPeriod(date: Date): [string, string] {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    // First day of month
    const firstDay = new Date(year, month, 1);
    let startDate = DateUtils.FormatDateString(firstDay);
    
    // If first day is weekend, move to next Monday
    if (DateUtils.IsWeekend(firstDay)) {
      startDate = DateUtils.GetNextBusinessDay(new Date(firstDay));
    }
    
    // Last day of month
    const lastDay = new Date(year, month + 1, 0); // Day 0 of next month = last day of current month
    let endDate = DateUtils.FormatDateString(lastDay);
    
    // If last day is weekend, move to previous Friday
    if (DateUtils.IsWeekend(lastDay)) {
      endDate = DateUtils.GetMostRecentBusinessDay(new Date(lastDay));
    }
    
    return [startDate, endDate];
  }
}
