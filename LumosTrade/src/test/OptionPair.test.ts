import { OptionPair } from '../interfaces/OptionPair';

describe('OptionPair.CalcAtmIV', () => {
  test('interpolates between nearest below and above 0.5', () => {
    const lower = new OptionPair(100, 0, 0, 0, 0.45, 0, 0.2, 'SYM', 'CALL');
    const upper = new OptionPair(100, 0, 0, 0, 0.55, 0, 0.3, 'SYM', 'CALL');
    const v = OptionPair.CalcAtmIV([lower, upper]);
    expect(v).toBeCloseTo(0.25, 6);
  });

  test('handles negative deltas (uses absolute)', () => {
    const lower = new OptionPair(100, 0, 0, 0, -0.45, 0, 0.2, 'SYM', 'PUT');
    const upper = new OptionPair(100, 0, 0, 0, -0.55, 0, 0.3, 'SYM', 'PUT');
    const v = OptionPair.CalcAtmIV([lower, upper]);
    expect(v).toBeCloseTo(0.25, 6);
  });

  test('returns single upper IV if only upper found', () => {
    const upper = new OptionPair(100, 0, 0, 0, 0.6, 0, 0.4, 'SYM', 'CALL');
    const v = OptionPair.CalcAtmIV([upper]);
    expect(v).toBeCloseTo(0.4, 6);
  });

  test('returns single lower IV if only lower found', () => {
    const lower = new OptionPair(100, 0, 0, 0, 0.4, 0, 0.15, 'SYM', 'CALL');
    const v = OptionPair.CalcAtmIV([lower]);
    expect(v).toBeCloseTo(0.15, 6);
  });

  test('equal deltas returns average IV', () => {
    const a = new OptionPair(100, 0, 0, 0, 0.5, 0, 0.2, 'SYM', 'CALL');
    const b = new OptionPair(100, 0, 0, 0, 0.5, 0, 0.4, 'SYM', 'PUT');
    const v = OptionPair.CalcAtmIV([a, b]);
    expect(v).toBeCloseTo(0.3, 6);
  });

  test('returns 0 for empty or invalid list', () => {
    expect(OptionPair.CalcAtmIV(null)).toBe(0);
    expect(OptionPair.CalcAtmIV([])).toBe(0);
  });
});
