import { RollupUtils, RollupPeriod } from '../utils/RollupUtils';

describe('RollupUtils.GetRollupPeriod', () => {
  
  describe('Daily rollup', () => {
    it('should return same day for Monday', () => {
      // Monday, December 8, 2025, 8:00 AM ET
      const date = new Date('2025-12-08T13:00:00Z'); // 8 AM ET in December (EST)
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-08');
      expect(end).toBe('2025-12-08');
    });

    it('should return same day for Monday late in day', () => {
      // Monday, December 8, 2025, 11:59 PM ET
      const date = new Date('2025-12-09T04:59:00Z'); // 11:59 PM ET
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-08');
      expect(end).toBe('2025-12-08');
    });

    it('should return same day for Friday', () => {
      // Friday, December 12, 2025, 8:00 AM ET
      const date = new Date('2025-12-12T13:00:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-12');
      expect(end).toBe('2025-12-12');
    });

    it('should return same day for Friday late in day', () => {
      // Friday, December 12, 2025, 11:59 PM ET
      const date = new Date('2025-12-13T04:59:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-12');
      expect(end).toBe('2025-12-12');
    });

    it('should return previous Friday for Saturday', () => {
      // Saturday, December 13, 2025, 8:00 AM ET
      const date = new Date('2025-12-13T13:00:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-12'); // Previous Friday
      expect(end).toBe('2025-12-12');
    });

    it('should return previous Friday for Saturday late in day', () => {
      // Saturday, December 13, 2025, 11:59 PM ET
      const date = new Date('2025-12-14T04:59:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-12'); // Maps to previous Friday
      expect(end).toBe('2025-12-12');
    });

    it('should return previous Friday for Sunday', () => {
      // Sunday, December 14, 2025, 8:00 AM ET
      const date = new Date('2025-12-14T13:00:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-12'); // Previous Friday
      expect(end).toBe('2025-12-12');
    });

    it('should return previous Friday for Sunday late in day', () => {
      // Sunday, December 14, 2025, 11:59 PM ET
      const date = new Date('2025-12-15T04:59:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-12'); // Previous Friday
      expect(end).toBe('2025-12-12');
    });
  });

  describe('Weekly rollup', () => {
    it('should return Monday-Friday for Monday early', () => {
      // Monday, December 8, 2025, 8:00 AM ET
      const date = new Date('2025-12-08T13:00:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-08'); // Monday
      expect(end).toBe('2025-12-12'); // Friday
    });

    it('should return Monday-Friday for Monday late', () => {
      // Monday, December 8, 2025, 11:59 PM ET
      const date = new Date('2025-12-09T04:59:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-08'); // Monday
      expect(end).toBe('2025-12-12'); // Friday
    });

    it('should return Monday-Friday for Friday early', () => {
      // Friday, December 12, 2025, 8:00 AM ET
      const date = new Date('2025-12-12T13:00:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-08'); // Monday
      expect(end).toBe('2025-12-12'); // Friday
    });

    it('should return Monday-Friday for Friday late', () => {
      // Friday, December 12, 2025, 11:59 PM ET
      const date = new Date('2025-12-13T04:59:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-08'); // Monday
      expect(end).toBe('2025-12-12'); // Friday
    });

    it('should return Monday-Friday for Saturday early', () => {
      // Saturday, December 13, 2025, 8:00 AM ET
      const date = new Date('2025-12-13T13:00:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-08'); // Previous Monday
      expect(end).toBe('2025-12-12'); // Previous Friday
    });

    it('should return Monday-Friday for Saturday late', () => {
      // Saturday, December 13, 2025, 11:59 PM ET
      const date = new Date('2025-12-14T04:59:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-08'); // Previous Monday
      expect(end).toBe('2025-12-12'); // Previous Friday
    });

    it('should return Monday-Friday for Sunday early', () => {
      // Sunday, December 14, 2025, 8:00 AM ET
      const date = new Date('2025-12-14T13:00:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-08'); // Previous Monday
      expect(end).toBe('2025-12-12'); // Previous Friday
    });

    it('should return Monday-Friday for Sunday late', () => {
      // Sunday, December 14, 2025, 11:59 PM ET
      const date = new Date('2025-12-15T04:59:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-08'); // Previous Monday
      expect(end).toBe('2025-12-12'); // Previous Friday
    });

    it('should return correct week for Wednesday mid-week', () => {
      // Wednesday, December 10, 2025, 2:00 PM ET
      const date = new Date('2025-12-10T19:00:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-08'); // Monday
      expect(end).toBe('2025-12-12'); // Friday
    });
  });

  describe('Monthly rollup', () => {
    it('should return first and last business days for Monday in December', () => {
      // Monday, December 8, 2025, 8:00 AM ET
      const date = new Date('2025-12-08T13:00:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2025-12-01'); // December 1 is a Monday
      expect(end).toBe('2025-12-31'); // December 31 is a Wednesday
    });

    it('should return first and last business days for Monday late in December', () => {
      // Monday, December 8, 2025, 11:59 PM ET
      const date = new Date('2025-12-09T04:59:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2025-12-01');
      expect(end).toBe('2025-12-31');
    });

    it('should return first and last business days for Friday in December', () => {
      // Friday, December 12, 2025, 8:00 AM ET
      const date = new Date('2025-12-12T13:00:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2025-12-01');
      expect(end).toBe('2025-12-31');
    });

    it('should return first and last business days for Friday late in December', () => {
      // Friday, December 12, 2025, 11:59 PM ET
      const date = new Date('2025-12-13T04:59:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2025-12-01');
      expect(end).toBe('2025-12-31');
    });

    it('should return first and last business days for Saturday in December', () => {
      // Saturday, December 13, 2025, 8:00 AM ET
      const date = new Date('2025-12-13T13:00:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2025-12-01');
      expect(end).toBe('2025-12-31');
    });

    it('should return first and last business days for Saturday late in December', () => {
      // Saturday, December 13, 2025, 11:59 PM ET
      const date = new Date('2025-12-14T04:59:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2025-12-01');
      expect(end).toBe('2025-12-31');
    });

    it('should return first and last business days for Sunday in December', () => {
      // Sunday, December 14, 2025, 8:00 AM ET
      const date = new Date('2025-12-14T13:00:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2025-12-01');
      expect(end).toBe('2025-12-31');
    });

    it('should return first and last business days for Sunday late in December', () => {
      // Sunday, December 14, 2025, 11:59 PM ET
      const date = new Date('2025-12-15T04:59:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2025-12-01');
      expect(end).toBe('2025-12-31');
    });

    it('should handle month starting on weekend (March 2025)', () => {
      // Saturday, March 1, 2025
      const date = new Date('2025-03-01T13:00:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2025-03-03'); // First Monday
      expect(end).toBe('2025-03-31'); // Last day is Monday
    });

    it('should handle month ending on weekend (November 2025)', () => {
      // November 2025 ends on Sunday, November 30
      const date = new Date('2025-11-15T13:00:00Z');
      const [start, end] = RollupUtils.GetRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2025-11-03'); // November 1 is Saturday, so first business day is Nov 3 (Monday)
      expect(end).toBe('2025-11-28'); // Last Friday before Nov 30 (Sunday)
    });
  });
});

describe('RollupUtils.GetNextRollupPeriod', () => {
  
  describe('Daily rollup', () => {
    it('should return next business day for Monday', () => {
      // Monday, December 8, 2025
      const date = new Date('2025-12-08T13:00:00Z');
      const [start, end] = RollupUtils.GetNextRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-09'); // Tuesday
      expect(end).toBe('2025-12-09');
    });

    it('should return next business day for Monday late', () => {
      // Monday, December 8, 2025, 11:59 PM
      const date = new Date('2025-12-09T04:59:00Z');
      const [start, end] = RollupUtils.GetNextRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-09'); // Tuesday
      expect(end).toBe('2025-12-09');
    });

    it('should skip weekend when next day is Saturday', () => {
      // Friday, December 12, 2025
      const date = new Date('2025-12-12T13:00:00Z');
      const [start, end] = RollupUtils.GetNextRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-15'); // Monday (skips weekend)
      expect(end).toBe('2025-12-15');
    });

    it('should return next Monday for Saturday', () => {
      // Saturday, December 13, 2025
      const date = new Date('2025-12-13T13:00:00Z');
      const [start, end] = RollupUtils.GetNextRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-15'); // Monday
      expect(end).toBe('2025-12-15');
    });

    it('should return next Monday for Sunday', () => {
      // Sunday, December 14, 2025
      const date = new Date('2025-12-14T13:00:00Z');
      const [start, end] = RollupUtils.GetNextRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-15'); // Monday
      expect(end).toBe('2025-12-15');
    });
  });

  describe('Weekly rollup', () => {
    it('should return next week for Monday', () => {
      // Monday, December 8, 2025
      const date = new Date('2025-12-08T13:00:00Z');
      const [start, end] = RollupUtils.GetNextRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-15'); // Next Monday
      expect(end).toBe('2025-12-19'); // Next Friday
    });

    it('should return next week for Friday', () => {
      // Friday, December 12, 2025
      const date = new Date('2025-12-12T13:00:00Z');
      const [start, end] = RollupUtils.GetNextRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-15'); // Next Monday
      expect(end).toBe('2025-12-19'); // Next Friday
    });

    it('should return next week for Saturday', () => {
      // Saturday, December 13, 2025
      const date = new Date('2025-12-13T13:00:00Z');
      const [start, end] = RollupUtils.GetNextRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-15'); // Next Monday
      expect(end).toBe('2025-12-19'); // Next Friday
    });

    it('should return next week for Sunday', () => {
      // Sunday, December 14, 2025
      const date = new Date('2025-12-14T13:00:00Z');
      const [start, end] = RollupUtils.GetNextRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-15'); // Next Monday
      expect(end).toBe('2025-12-19'); // Next Friday
    });
  });

  describe('Monthly rollup', () => {
    it('should return next month for date in December', () => {
      // December 8, 2025
      const date = new Date('2025-12-08T13:00:00Z');
      const [start, end] = RollupUtils.GetNextRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2026-01-01'); // January 1, 2026 is Thursday
      expect(end).toBe('2026-01-30'); // January 31 is Saturday, so last business day is Jan 30 (Friday)
    });

    it('should return next month for Friday in December', () => {
      // Friday, December 12, 2025
      const date = new Date('2025-12-12T13:00:00Z');
      const [start, end] = RollupUtils.GetNextRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2026-01-01');
      expect(end).toBe('2026-01-30');
    });

    it('should return next month for Saturday in December', () => {
      // Saturday, December 13, 2025
      const date = new Date('2025-12-13T13:00:00Z');
      const [start, end] = RollupUtils.GetNextRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2026-01-01');
      expect(end).toBe('2026-01-30');
    });

    it('should return next month for Sunday in December', () => {
      // Sunday, December 14, 2025
      const date = new Date('2025-12-14T13:00:00Z');
      const [start, end] = RollupUtils.GetNextRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2026-01-01');
      expect(end).toBe('2026-01-30');
    });
  });
});

describe('RollupUtils.GetPreviousRollupPeriod', () => {
  
  describe('Daily rollup', () => {
    it('should return previous business day for Monday', () => {
      // Monday, December 8, 2025
      const date = new Date('2025-12-08T13:00:00Z');
      const [start, end] = RollupUtils.GetPreviousRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-05'); // Previous Friday
      expect(end).toBe('2025-12-05');
    });

    it('should return previous business day for Tuesday', () => {
      // Tuesday, December 9, 2025
      const date = new Date('2025-12-09T13:00:00Z');
      const [start, end] = RollupUtils.GetPreviousRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-08'); // Monday
      expect(end).toBe('2025-12-08');
    });

    it('should return previous business day for Friday', () => {
      // Friday, December 12, 2025
      const date = new Date('2025-12-12T13:00:00Z');
      const [start, end] = RollupUtils.GetPreviousRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-11'); // Thursday
      expect(end).toBe('2025-12-11');
    });

    it('should return previous Friday for Saturday', () => {
      // Saturday, December 13, 2025 (maps to Friday Dec 12)
      const date = new Date('2025-12-13T13:00:00Z');
      const [start, end] = RollupUtils.GetPreviousRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-11'); // Thursday (day before Friday)
      expect(end).toBe('2025-12-11');
    });

    it('should return previous Friday for Sunday', () => {
      // Sunday, December 14, 2025 (maps to Friday Dec 12)
      const date = new Date('2025-12-14T13:00:00Z');
      const [start, end] = RollupUtils.GetPreviousRollupPeriod(RollupPeriod.Daily, date);
      
      expect(start).toBe('2025-12-11'); // Thursday (day before Friday)
      expect(end).toBe('2025-12-11');
    });
  });

  describe('Weekly rollup', () => {
    it('should return previous week for Monday', () => {
      // Monday, December 8, 2025
      const date = new Date('2025-12-08T13:00:00Z');
      const [start, end] = RollupUtils.GetPreviousRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-01'); // Previous Monday
      expect(end).toBe('2025-12-05'); // Previous Friday
    });

    it('should return previous week for Friday', () => {
      // Friday, December 12, 2025
      const date = new Date('2025-12-12T13:00:00Z');
      const [start, end] = RollupUtils.GetPreviousRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-01'); // Previous Monday
      expect(end).toBe('2025-12-05'); // Previous Friday
    });

    it('should return previous week for Saturday', () => {
      // Saturday, December 13, 2025
      const date = new Date('2025-12-13T13:00:00Z');
      const [start, end] = RollupUtils.GetPreviousRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-01'); // Previous Monday
      expect(end).toBe('2025-12-05'); // Previous Friday
    });

    it('should return previous week for Sunday', () => {
      // Sunday, December 14, 2025
      const date = new Date('2025-12-14T13:00:00Z');
      const [start, end] = RollupUtils.GetPreviousRollupPeriod(RollupPeriod.Weekly, date);
      
      expect(start).toBe('2025-12-01'); // Previous Monday
      expect(end).toBe('2025-12-05'); // Previous Friday
    });
  });

  describe('Monthly rollup', () => {
    it('should return previous month for date in December', () => {
      // December 8, 2025
      const date = new Date('2025-12-08T13:00:00Z');
      const [start, end] = RollupUtils.GetPreviousRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2025-11-03'); // November 1 is Saturday, first business day is Nov 3
      expect(end).toBe('2025-11-28'); // November 30 is Sunday, last business day is Nov 28
    });

    it('should return previous month for Friday in December', () => {
      // Friday, December 12, 2025
      const date = new Date('2025-12-12T13:00:00Z');
      const [start, end] = RollupUtils.GetPreviousRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2025-11-03');
      expect(end).toBe('2025-11-28');
    });

    it('should return previous month for Saturday in December', () => {
      // Saturday, December 13, 2025
      const date = new Date('2025-12-13T13:00:00Z');
      const [start, end] = RollupUtils.GetPreviousRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2025-11-03');
      expect(end).toBe('2025-11-28');
    });

    it('should return previous month for Sunday in December', () => {
      // Sunday, December 14, 2025
      const date = new Date('2025-12-14T13:00:00Z');
      const [start, end] = RollupUtils.GetPreviousRollupPeriod(RollupPeriod.Monthly, date);
      
      expect(start).toBe('2025-11-03');
      expect(end).toBe('2025-11-28');
    });
  });
});
