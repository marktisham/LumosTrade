import { OptionExpirationDate, OptionExpiryType } from '../interfaces/OptionExpirationDate';

describe('OptionExpirationDate.GetNextExpirationDateOfType', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    // Set current time to 2025-12-21 UTC
    jest.setSystemTime(new Date(Date.UTC(2025, 11, 21, 12, 0, 0)));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('daily: returns next DAILY or WEEKLY after today and excludes today', () => {
    const list = [
      new OptionExpirationDate(2025, 12, 21, OptionExpiryType.DAILY),
      new OptionExpirationDate(2025, 12, 22, OptionExpiryType.WEEKLY),
      new OptionExpirationDate(2025, 12, 23, OptionExpiryType.DAILY),
    ];

    const next = OptionExpirationDate.GetNextExpirationDateOfType(list, OptionExpiryType.DAILY);
    expect(next).not.toBeNull();
    expect(next?.year).toBe(2025);
    expect(next?.month).toBe(12);
    expect(next?.day).toBe(22);
  });

  test('weekly: returns first weekly that is Friday', () => {
    const list = [
      new OptionExpirationDate(2025, 12, 22, OptionExpiryType.WEEKLY), // Monday
      new OptionExpirationDate(2025, 12, 26, OptionExpiryType.WEEKLY), // Friday
      new OptionExpirationDate(2025, 12, 23, OptionExpiryType.WEEKLY), // Tuesday
    ];

    const next = OptionExpirationDate.GetNextExpirationDateOfType(list, OptionExpiryType.WEEKLY);
    expect(next).not.toBeNull();
    expect(next?.year).toBe(2025);
    expect(next?.month).toBe(12);
    expect(next?.day).toBe(26);
  });

  test('weekly: returns null if no friday weekly after today', () => {
    const list = [
      new OptionExpirationDate(2025, 12, 22, OptionExpiryType.WEEKLY), // Monday
      new OptionExpirationDate(2025, 12, 23, OptionExpiryType.WEEKLY), // Tuesday
      new OptionExpirationDate(2025, 12, 25, OptionExpiryType.WEEKLY), // Thursday
    ];

    const next = OptionExpirationDate.GetNextExpirationDateOfType(list, OptionExpiryType.WEEKLY);
    expect(next).toBeNull();
  });

  test('monthly: returns first monthly after today', () => {
    const list = [
      new OptionExpirationDate(2025, 12, 31, OptionExpiryType.MONTHEND),
      new OptionExpirationDate(2026, 1, 16, OptionExpiryType.MONTHLY),
      new OptionExpirationDate(2026, 2, 20, OptionExpiryType.MONTHLY),
    ];

    const next = OptionExpirationDate.GetNextExpirationDateOfType(list, OptionExpiryType.MONTHLY);
    expect(next).not.toBeNull();
    expect(next?.year).toBe(2026);
    expect(next?.month).toBe(1);
    expect(next?.day).toBe(16);
  });

  test('does not return current day even if present', () => {
    const list = [
      new OptionExpirationDate(2025, 12, 21, OptionExpiryType.MONTHLY),
      new OptionExpirationDate(2025, 12, 22, OptionExpiryType.MONTHLY),
    ];

    const next = OptionExpirationDate.GetNextExpirationDateOfType(list, OptionExpiryType.MONTHLY);
    expect(next).not.toBeNull();
    expect(next?.day).toBe(22);
  });

  test('11pm Eastern edge: current Eastern day should still be considered today and excluded', () => {
    // Set system time to 2025-12-21 23:00 ET -> UTC 2025-12-22 04:00
    jest.setSystemTime(new Date(Date.UTC(2025, 11, 22, 4, 0, 0)));

    const list = [
      new OptionExpirationDate(2025, 12, 21, OptionExpiryType.DAILY),
      new OptionExpirationDate(2025, 12, 22, OptionExpiryType.DAILY),
    ];

    const next = OptionExpirationDate.GetNextExpirationDateOfType(list, OptionExpiryType.DAILY);
    expect(next).not.toBeNull();
    expect(next?.year).toBe(2025);
    expect(next?.month).toBe(12);
    expect(next?.day).toBe(22);

    // Reset system time to previous default for other tests
    jest.setSystemTime(new Date(Date.UTC(2025, 11, 21, 12, 0, 0)));
  });

  test('daily: when current Eastern day is Monday returns next daily after today', () => {
    // Set system time to 2025-12-22 12:00 ET -> UTC 2025-12-22 17:00
    jest.setSystemTime(new Date(Date.UTC(2025, 11, 22, 17, 0, 0)));

    const list = [
      new OptionExpirationDate(2025, 12, 22, OptionExpiryType.DAILY),
      new OptionExpirationDate(2025, 12, 23, OptionExpiryType.DAILY),
      new OptionExpirationDate(2025, 12, 26, OptionExpiryType.WEEKLY),
    ];

    const next = OptionExpirationDate.GetNextExpirationDateOfType(list, OptionExpiryType.DAILY);
    expect(next).not.toBeNull();
    expect(next?.year).toBe(2025);
    expect(next?.month).toBe(12);
    expect(next?.day).toBe(23);

    // Reset system time
    jest.setSystemTime(new Date(Date.UTC(2025, 11, 21, 12, 0, 0)));
  });

  test('daily: when current Eastern day is Friday returns next daily after today', () => {
    // Set system time to 2025-12-26 12:00 ET -> UTC 2025-12-26 17:00
    jest.setSystemTime(new Date(Date.UTC(2025, 11, 26, 17, 0, 0)));

    const list = [
      new OptionExpirationDate(2025, 12, 26, OptionExpiryType.DAILY),
      new OptionExpirationDate(2025, 12, 29, OptionExpiryType.DAILY),
    ];

    const next = OptionExpirationDate.GetNextExpirationDateOfType(list, OptionExpiryType.DAILY);
    expect(next).not.toBeNull();
    expect(next?.year).toBe(2025);
    expect(next?.month).toBe(12);
    expect(next?.day).toBe(29);

    // Reset system time
    jest.setSystemTime(new Date(Date.UTC(2025, 11, 21, 12, 0, 0)));
  });

  test('returns null for empty list', () => {
    expect(OptionExpirationDate.GetNextExpirationDateOfType([], OptionExpiryType.MONTHLY)).toBeNull();
  });

});

describe('OptionExpirationDate.toDate (midnight Eastern)', () => {
  test('Jan 15 2025 (standard time) -> should be 05:00 UTC', () => {
    const d = new OptionExpirationDate(2025, 1, 15, OptionExpiryType.MONTHLY);
    const iso = d.toDate().toISOString();
    expect(iso).toBe(new Date(Date.UTC(2025, 0, 15, 5, 0, 0)).toISOString());
  });

  test('Jul 01 2025 -> should be 05:00 UTC (assume ET=UTC-5)', () => {
    const d = new OptionExpirationDate(2025, 7, 1, OptionExpiryType.MONTHLY);
    const iso = d.toDate().toISOString();
    expect(iso).toBe(new Date(Date.UTC(2025, 6, 1, 5, 0, 0)).toISOString());
  });

  test('DST transition day (Mar 9 2025) midnight should be 05:00 UTC (pre-jump)', () => {
    const d = new OptionExpirationDate(2025, 3, 9, OptionExpiryType.MONTHLY);
    const iso = d.toDate().toISOString();
    expect(iso).toBe(new Date(Date.UTC(2025, 2, 9, 5, 0, 0)).toISOString());
  });
});
