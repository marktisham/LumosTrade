/**
 * Options for number picking helpers.
 * - allowZero: when true, zero is considered a valid value
 * - allowNegative: when true, negative numbers are allowed
 */
export interface PickNumberOptions {
  allowZero?: boolean;
  allowNegative?: boolean;
}

/**
 * Pick the first usable numeric value from the provided candidates.
 *
 * Behavior:
 * - Iterates candidates in order and returns the first value that can be coerced
 *   to a finite Number and is strictly greater than zero.
 * - Returns `null` if no valid positive number is found.
 *
 * Examples:
 * ```ts
 * pickNumber(null, undefined, '0', 'NaN', '2.5', 5) // => 2.5
 * pickNumber(0, -1, '0') // => null
 * ```
 */
export function pickNumber(...cands: any[]): number | null {
  for (const c of cands) {
    if (c === undefined || c === null) continue;
    const n = Number(c);
    if (!isNaN(n) && isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Pick the first numeric value that satisfies the provided options.
 *
 * Behavior:
 * - Iterates `values` in order and returns the first value that can be coerced
 *   to a finite Number and meets the `allowZero` / `allowNegative` constraints.
 * - Returns `null` if nothing matches.
 *
 * Examples:
 * ```ts
 * pickNumberWithOptions([0, -2, '3'], { allowZero: true }) // => 0
 * pickNumberWithOptions([0, -2, '3'], { allowNegative: true }) // => -2
 * pickNumberWithOptions([0, -2, '3'], { allowNegative: true, allowZero: true }) // => 0
 * ```
 */
export function pickNumberWithOptions(values: any[], opts?: PickNumberOptions): number | null {
  const allowZero = opts?.allowZero ?? false;
  const allowNegative = opts?.allowNegative ?? false;

  for (const c of values) {
    if (c === undefined || c === null) continue;
    const n = Number(c);
    if (isNaN(n) || !isFinite(n)) continue;
    if (!allowNegative && n < 0) continue;
    if (!allowZero && n === 0) continue;
    return n;
  }
  return null;
}

/**
 * Pick the first value that can be interpreted as a Unix timestamp and return a Date.
 *
 * Behavior:
 * - Accepts timestamps in seconds or milliseconds (detects ms when value > 1e12).
 * - Iterates candidates in order and returns a Date for the first valid timestamp.
 * - Returns `null` if none of the candidates represent a valid timestamp.
 *
 * Examples:
 * ```ts
 * pickUnixSecondsDate(1600000000) // => Date corresponding to seconds
 * pickUnixSecondsDate(1600000000000) // => Date corresponding to milliseconds
 * pickUnixSecondsDate(null, 'non-numeric', 1600000000) // => Date
 * ```
 */
export function pickUnixSecondsDate(...cands: any[]): Date | null {
  for (const c of cands) {
    if (c === undefined || c === null) continue;
    const n = Number(c);
    if (isNaN(n) || !isFinite(n)) continue;
    // If looks like ms (greater than 1e12), treat as ms, otherwise seconds
    const date = n > 1e12 ? new Date(n) : new Date(n * 1000);
    if (!isNaN(date.getTime())) return date;
  }
  return null;
}

/**
 * Pick the first non-empty trimmed string from candidates.
 *
 * Behavior:
 * - Iterates candidates in order, coerces to string, trims whitespace and returns
 *   the first non-empty result. Returns `null` if none found.
 *
 * Examples:
 * ```ts
 * pickString(null, '   ', 'hello', '') // => 'hello'
 * pickString(undefined, null) // => null
 * ```
 */
export function pickString(...cands: any[]): string | null {
  for (const c of cands) {
    if (c === undefined || c === null) continue;
    const s = String(c).trim();
    if (s.length > 0) return s;
  }
  return null;
}
