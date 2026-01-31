export class DateUtils {
  /**
   * Format a Date or string as a date-only string (YYYY-MM-DD).
   * - If `value` is a Date, returns the UTC date string `YYYY-MM-DD`.
   * - If `value` is a string, returns the date portion (splits at 'T') or the string unchanged.
   * - If `value` is null/undefined, returns null.
   * 
   * Note: This operates on UTC values. For timezone-aware formatting (e.g. "What is the date in NY?"),
   * use `ToDateStringInTimeZone`.
   */
  public static formatDateOnly(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }
    const s = value as string;
    return s.includes('T') ? s.split('T')[0] : s;
  }

  /**
   * Returns true if both values represent the same calendar day (YYYY-MM-DD) in UTC.
   * Uses `formatDateOnly` to compare. If either value is null/undefined, returns false.
   */
  public static IsSameDay(a: Date | string | null | undefined, b: Date | string | null | undefined): boolean {
    if (a == null || b == null) return false;
    const da = DateUtils.formatDateOnly(a);
    const db = DateUtils.formatDateOnly(b);
    if (da == null || db == null) return false;
    return da === db;
  }

  /**
   * Return a Date representing only the calendar date (time set to 00:00:00 UTC)
   * for the provided value. If `value` is null/undefined, returns null.
   */
  public static GetDateOnly(value: Date | string | null | undefined): Date | null {
    if (value == null) return null;
    const s = DateUtils.formatDateOnly(value);
    if (s == null) return null;
    return new Date(s + 'T00:00:00.000Z');
  }

  /**
   * Convert any date input to a YYYY-MM-DD date string in the specified IANA timezone.
   * Defaults to `America/New_York`. If no value is provided, uses current time.
   *
   * This function is timezone-aware and will return the correct calendar date for the
   * specified timezone regardless of the server's local timezone or UTC offset.
   *
   * Example: if it's 2025-12-05 21:00 in America/New_York (which is 2025-12-06 02:00 UTC),
   * `ToDateStringInTimeZone()` will return '2025-12-05'.
   *
   * Returns `null` when a provided `value` cannot be parsed.
   */
  public static ToDateStringInTimeZone(value?: Date | string | null, timeZone: string = 'America/New_York'): string | null {
    // Determine base Date to use for formatting
    let base: Date;
    if (value == null) {
      base = new Date();
    } else if (value instanceof Date) {
      base = value;
    } else if (typeof value === 'string') {
      // If already looks like YYYY-MM-DD, just return it
      if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        return value.trim();
      }
      base = new Date(value);
    } else {
      return null;
    }
    if (isNaN(base.getTime())) {
      return null;
    }

    // Use Intl.DateTimeFormat to get the date in the target timezone
    const dtf = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    return dtf.format(base); // yields YYYY-MM-DD
  }

  /**
   * Convert any date input to a YYYY-MM-DD HH:mm:ss string in the specified IANA timezone.
   * Defaults to `America/New_York`. If no value is provided, uses current time.
   *
   * This function is timezone-aware and will return the date and time components in the
   * specified timezone regardless of the server's local timezone or UTC offset.
   *
   * Returns `null` when a provided `value` cannot be parsed.
   */
  public static ToDateTimeStringInTimeZone(value?: Date | string | null, timeZone: string = 'America/New_York'): string | null {
    let base: Date;
    if (value == null) {
      base = new Date();
    } else if (value instanceof Date) {
      base = value;
    } else if (typeof value === 'string') {
      base = new Date(value);
    } else {
      return null;
    }
    if (isNaN(base.getTime())) {
      return null;
    }

    const dtf = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // dtf.format returns e.g. "2025-12-23 14:05:07" for en-CA
    return dtf.format(base);
  }

  /**
   * Returns the current date in US Eastern Time as a YYYY-MM-DD string.
   */
  public static GetEasternToday(): string {
    return this.ToDateStringInTimeZone(new Date(), 'America/New_York')!;
  }

  /**
   * Returns a Date object representing the start of the day in US Eastern Time for the given date.
   * The returned Date object will have UTC components that match the Eastern Time components of the input.
   * This is useful for "AtDayEnd" comparisons where the DB stores a date-only string.
   */
  public static GetEasternDate(value?: Date | string | null): Date | null {
      const s = this.ToDateStringInTimeZone(value, 'America/New_York');
      if (!s) return null;
      return new Date(s + 'T00:00:00.000Z');
  }

  /**
   * Returns the start of the day in UTC for a given Eastern Time date string (YYYY-MM-DD).
   * E.g. "2025-12-05" -> 2025-12-05 05:00:00 UTC (assuming EST)
   */
  public static GetEasternStartOfDayUTC(dateString: string): Date {
    // Try EST (5 hours offset)
    const d1 = new Date(dateString + 'T05:00:00Z');
    const s1 = DateUtils.ToDateStringInTimeZone(d1, 'America/New_York');
    if (s1 === dateString) return d1; 
    
    // Try EDT (4 hours offset)
    const d2 = new Date(dateString + 'T04:00:00Z');
    const s2 = DateUtils.ToDateStringInTimeZone(d2, 'America/New_York');
    if (s2 === dateString) return d2; 
    
    // Fallback to d1 if something is weird
    return d1;
  }

  /**
   * Returns the end of the day in UTC for a given Eastern Time date string (YYYY-MM-DD).
   * This is effectively StartOfDay + 23:59:59.999
   */
  public static GetEasternEndOfDayUTC(dateString: string): Date {
      const start = this.GetEasternStartOfDayUTC(dateString);
      return new Date(start.getTime() + 86400000 - 1);
  }

  /**
   * Format a Date as a YYYY-MM-DD string based on its local date components.
   * This is different from formatDateOnly which uses UTC components.
   */
  public static FormatDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get the day of the week for a date.
   * @returns 0 = Sunday, 1 = Monday, ..., 6 = Saturday
   */
  public static GetDayOfWeek(date: Date): number {
    return date.getDay();
  }

  /**
   * Check if a date falls on a weekend (Saturday or Sunday).
   */
  public static IsWeekend(date: Date): boolean {
    const day = this.GetDayOfWeek(date);
    return day === 0 || day === 6;
  }

  /**
   * Get the most recent business day (Monday-Friday) for a given date.
   * If the date is already a business day, returns it.
   * If it's a weekend, returns the previous Friday.
   * @returns YYYY-MM-DD string
   */
  public static GetMostRecentBusinessDay(date: Date): string {
    const dayOfWeek = this.GetDayOfWeek(date);
    const workingDate = new Date(date);
    
    if (dayOfWeek === 0) { // Sunday -> previous Friday
      workingDate.setDate(workingDate.getDate() - 2);
    } else if (dayOfWeek === 6) { // Saturday -> previous Friday
      workingDate.setDate(workingDate.getDate() - 1);
    }
    
    return this.FormatDateString(workingDate);
  }

  /**
   * Get the next business day (Monday-Friday) after a given date.
   * Skips weekends.
   * @returns YYYY-MM-DD string
   */
  public static GetNextBusinessDay(date: Date): string {
    const dayOfWeek = this.GetDayOfWeek(date);
    const workingDate = new Date(date);
    
    if (dayOfWeek === 5) { // Friday -> next Monday
      workingDate.setDate(workingDate.getDate() + 3);
    } else if (dayOfWeek === 6) { // Saturday -> next Monday
      workingDate.setDate(workingDate.getDate() + 2);
    } else if (dayOfWeek === 0) { // Sunday -> next Monday
      workingDate.setDate(workingDate.getDate() + 1);
    } else { // Weekday -> next day
      workingDate.setDate(workingDate.getDate() + 1);
    }
    
    return this.FormatDateString(workingDate);
  }

  /**
   * Returns the number of trading days (Monday-Friday) between two Date objects,
   * excluding the start date and including the end date.
   * If the end is the same calendar day as the start but later in time, this returns 1 for weekdays.
   * If end <= start, returns 0.
   */
  public static GetTradingDaysBetween(start: Date, end: Date): number {
    if (!start || !end) return 0;
    if (end.getTime() <= start.getTime()) return 0;

    const msPerDay = 24 * 60 * 60 * 1000;

    // Normalize to local date-only (midnight) so we count calendar days correctly
    const startMid = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endMid = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    // If same calendar day (but end > start), count it as a single trading day when it's a weekday
    if (startMid.getTime() === endMid.getTime()) {
      return this.IsWeekend(endMid) ? 0 : 1;
    }

    let diffDays = Math.floor((endMid.getTime() - startMid.getTime()) / msPerDay);
    if (diffDays <= 0) return 0;

    const fullWeeks = Math.floor(diffDays / 7);
    let count = fullWeeks * 5;

    const remainder = diffDays % 7;
    const startDow = startMid.getDay(); // 0=Sun ... 6=Sat

    // Count weekdays in the remainder days after the full weeks
    for (let i = 1; i <= remainder; i++) {
      const dow = (startDow + i) % 7;
      if (dow !== 0 && dow !== 6) count++;
    }

    return count;
  }

  /**
   * Returns true if the given timestamp is at or after 4:00 PM US Eastern Time.
   * Used to determine if market close pricing should be applied.
   * @param timestamp - Date or Unix timestamp (seconds or milliseconds) to check
   * @returns true if time is >= 16:00:00 ET, false otherwise
   */
  public static IsAfterMarketClose(timestamp: Date | number): boolean {
    // Convert to Date if needed
    let date: Date;
    if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      // Handle both seconds and milliseconds timestamps
      const num = Number(timestamp);
      date = num > 1e12 ? new Date(num) : new Date(num * 1000);
    }

    if (isNaN(date.getTime())) {
      return false;
    }

    // Format time in ET timezone to get the hour
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    });
    
    const hourStr = formatter.format(date);
    const hour = parseInt(hourStr, 10);
    
    // Market closes at 4pm ET (16:00)
    return hour >= 16;
  }

}
