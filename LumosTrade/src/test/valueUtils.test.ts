import { pickNumber, pickNumberWithOptions, pickUnixSecondsDate, pickString } from '../utils/ValueUtils';

describe('ValueUtils', () => {
  test('pickNumber returns first positive number', () => {
    expect(pickNumber(null, undefined, '0', 'NaN', '2.5', 5)).toBe(2.5);
  });

  test('pickNumber returns null for non-positive numbers', () => {
    expect(pickNumber(0, -1, '0')).toBeNull();
  });

  test('pickNumberWithOptions respects negative and zero options', () => {
    expect(pickNumberWithOptions([0, -2, '3'], { allowZero: true })).toBe(0);
    expect(pickNumberWithOptions([0, -2, '3'], { allowNegative: true })).toBe(-2);
    expect(pickNumberWithOptions([0, -2, '3'], { allowNegative: true, allowZero: true })).toBe(0);
  });

  test('pickUnixSecondsDate handles seconds and milliseconds', () => {
    const d1 = pickUnixSecondsDate(1600000000); // seconds
    expect(d1).toBeInstanceOf(Date);
    expect(Math.floor(d1!.getTime() / 1000)).toBe(1600000000);

    const ms = 1600000000000; // ms
    const d2 = pickUnixSecondsDate(ms);
    expect(d2).toBeInstanceOf(Date);
    expect(d2!.getTime()).toBe(ms);
  });

  test('pickString returns first non-empty trimmed string', () => {
    expect(pickString(null, '   ', 'hello', '')).toBe('hello');
  });
});
