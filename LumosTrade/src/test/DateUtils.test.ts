import { DateUtils } from '../utils/DateUtils';

describe('DateUtils.GetTradingDaysBetween', () => {
  test('same day later returns 1 on weekday', () => {
    const start = new Date(2025, 11, 22, 8, 0, 0); // 2025-12-22 08:00 (Mon)
    const end = new Date(2025, 11, 22, 17, 0, 0);   // same day later
    expect(DateUtils.GetTradingDaysBetween(start, end)).toBe(1);
  });

  test('same day earlier returns 0', () => {
    const start = new Date(2025, 11, 22, 17, 0, 0); // later
    const end = new Date(2025, 11, 22, 8, 0, 0);    // earlier
    expect(DateUtils.GetTradingDaysBetween(start, end)).toBe(0);
  });

  test('Thu -> next Mon spans weekend and counts Fri and Mon', () => {
    const start = new Date(2025, 11, 18, 10, 0, 0); // Thu 2025-12-18
    const end = new Date(2025, 11, 22, 15, 0, 0);   // Mon 2025-12-22
    // Fri and Mon => 2 trading days
    expect(DateUtils.GetTradingDaysBetween(start, end)).toBe(2);
  });

  test('Fri -> next Mon counts only Monday (exclude start)', () => {
    const start = new Date(2025, 11, 26, 10, 0, 0); // Fri 2025-12-26
    const end = new Date(2025, 11, 29, 16, 0, 0);   // Mon 2025-12-29
    expect(DateUtils.GetTradingDaysBetween(start, end)).toBe(1);
  });

  test('Saturday -> Sunday (weekend only) returns 0', () => {
    const start = new Date(2025, 11, 20, 0, 0, 0); // Sat 2025-12-20
    const end = new Date(2025, 11, 21, 23, 59, 59); // Sun 2025-12-21
    expect(DateUtils.GetTradingDaysBetween(start, end)).toBe(0);
  });

  test('long range (multiple weeks) counts correctly', () => {
    const start = new Date(2025, 11, 1, 9, 0, 0); // Mon 2025-12-01
    const end = new Date(2025, 11, 15, 17, 0, 0); // Mon 2025-12-15
    // From Dec 1 exclusive to Dec 15 inclusive: 2 full weeks => 10 trading days
    expect(DateUtils.GetTradingDaysBetween(start, end)).toBe(10);
  });

  test('multi-month range counts correctly', () => {
    const start = new Date(2025, 11, 1, 9, 0, 0); // Mon 2025-12-01
    const end = new Date(2026, 0, 15, 17, 0, 0);  // Thu 2026-01-15
    // From Dec 1 exclusive to Jan 15 inclusive: 45 days => 6 full weeks + 3 days; 6*5 + 3 = 33 trading days
    expect(DateUtils.GetTradingDaysBetween(start, end)).toBe(33);
  });

});
