export class RoundUtil {
  /**
   * Returns true if two numbers are within 0.01 of each other, else false.
   */
  public static EqualWithinPrecision(a: number, b: number, precision: number = 0.01): boolean {
    return Math.abs(a - b) <= precision;
  }

  /**
   * Round a numeric value to 4 decimal places for storing in the DB.
   * Throws if value is null/undefined to avoid silent errors.
   */
  public static RoundForDB(value: number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return Math.round(value * 10000) / 10000;
  }

  /**
   * If the absolute value is smaller than `threshold` treat it as zero.
   * Returns either 0 or the original value.
   */
  public static RoundNearZero(value: number, threshold: number = 0.0001): number {
    if (Math.abs(value) < threshold) return 0;
    return value;
  }
}
