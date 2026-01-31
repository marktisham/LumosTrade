export enum OptionExpiryType {
  DAILY = 'DAILY',          // next trading day (note: etrade returns WEEKLY for daily expires currently)
  WEEKLY = 'WEEKLY',        // daily or weekly in etrade
  MONTHLY = 'MONTHLY',      // third friday of the month
  QUARTERLY = 'QUARTERLY',  // last trading day of the quarter
  MONTHEND = 'MONTHEND',    // last trading day of the month
}

export class OptionExpirationDate {
  year: number;
  month: number;
  day: number;
  expiryType: OptionExpiryType;

  constructor(year: number, month: number, day: number, expiryType: OptionExpiryType) {
    this.year = year;
    this.month = month;
    this.day = day;
    this.expiryType = expiryType;
  }

  /**
   * Helper to convert to a JavaScript Date representing midnight in America/New_York for this date.
   * For simplicity we assume Eastern Time is always UTC-5 (i.e., ignore DST) so midnight ET maps to 05:00 UTC.
   */
  public toDate(): Date {
    // Midnight in Eastern (UTC-5) corresponds to 05:00 UTC
    return new Date(Date.UTC(this.year, this.month - 1, this.day, 5, 0, 0));
  }

  /**
   * Return the next expiration date of the given type from a list of dates.
   * - Compares against the current date (UTC) and returns the first date AFTER today.
   * - For DAILY requests, considers both DAILY and WEEKLY expiry types (E*TRADE may return WEEKLY for daily expiries).
   * - For WEEKLY requests, only returns WEEKLY entries that fall on a Friday.
   */
  public static GetNextExpirationDateOfType(dates: OptionExpirationDate[], type: OptionExpiryType): OptionExpirationDate | null {
    if (!dates || dates.length === 0) return null;

    // Helper to get Eastern (America/New_York) y/m/d numeric key
    const toEasternKey = (dt: Date) => {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(dt);
      const y = Number(parts.find(p => p.type === 'year')?.value ?? 0);
      const m = Number(parts.find(p => p.type === 'month')?.value ?? 0);
      const d = Number(parts.find(p => p.type === 'day')?.value ?? 0);
      return y * 10000 + m * 100 + d;
    };

    const todayKey = toEasternKey(new Date());

    const candidates = dates.filter(d => {
      const candidateKey = d.year * 10000 + d.month * 100 + d.day;
      if (candidateKey <= todayKey) return false; // exclude today and past dates in Eastern

      if (type === OptionExpiryType.DAILY) {
        // consider DAILY and WEEKLY (E*TRADE uses WEEKLY for some daily expiries)
        return d.expiryType === OptionExpiryType.DAILY || d.expiryType === OptionExpiryType.WEEKLY;
      }

      if (type === OptionExpiryType.WEEKLY) {
        // only WEEKLY and must be Friday in Eastern timezone
        if (d.expiryType !== OptionExpiryType.WEEKLY) return false;
        // Use noon UTC to avoid timezone shifts; formatting with America/New_York gives the weekday in Eastern
        const candidateInstant = new Date(Date.UTC(d.year, d.month - 1, d.day, 12, 0, 0));
        const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(candidateInstant);
        return weekday === 'Fri';
      }

      // other types: exact match
      return d.expiryType === type;
    });

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => (a.year * 10000 + a.month * 100 + a.day) - (b.year * 10000 + b.month * 100 + b.day));
    return candidates[0];
  }
}
