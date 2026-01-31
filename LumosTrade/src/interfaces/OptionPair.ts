export class OptionPair {
  StrikePrice: number;
  rho: number;
  vega: number;
  theta: number;
  delta: number;
  game: number;
  iv: number;
  displaySymbol: string;
  OptionType: 'PUT' | 'CALL';

  constructor(
    strikePrice: number,
    rho: number,
    vega: number,
    theta: number,
    delta: number,
    game: number,
    iv: number,
    displaySymbol: string,
    optionType: 'PUT' | 'CALL'
  ) {
    this.StrikePrice = strikePrice;
    this.rho = rho;
    this.vega = vega;
    this.theta = theta;
    this.delta = delta;
    this.game = game;
    this.iv = iv;
    this.displaySymbol = displaySymbol;
    this.OptionType = optionType;
  }

  public isCall(): boolean {
    return this.OptionType === 'CALL';
  }

  public isPut(): boolean {
    return this.OptionType === 'PUT';
  }

  /**
   * Calculate implied volatility at a 50-delta (ATM) by linear interpolation.
   *
   * Steps:
   *  - Find the OptionPair with abs(delta) closest at or below 0.5 ("lower").
   *  - Find the OptionPair with abs(delta) closest at or above 0.5 ("upper").
   *  - Linearly interpolate IV to abs(delta)=0.5 using those two points.
   *
   * If only one side is found, the function returns that side's IV. If no valid
   * IV values are found, returns 0.
   */
  public static CalcAtmIV(pairs: OptionPair[] | null | undefined): number {
    if (!pairs || pairs.length === 0) return 0;

    let lower: OptionPair | null = null; // abs(delta) <= 0.5, closest to 0.5 (max abs(delta))
    let upper: OptionPair | null = null; // abs(delta) >= 0.5, closest to 0.5 (min abs(delta))
    let minUpperDiff = Number.POSITIVE_INFINITY;
    let minLowerDiff = Number.POSITIVE_INFINITY;

    for (const p of pairs) {
      if (!p || typeof p.iv !== 'number' || typeof p.delta !== 'number') continue;
      const absDelta = Math.abs(p.delta);
      // candidate for upper (>= 0.5)
      if (absDelta >= 0.5) {
        const diff = absDelta - 0.5; // >= 0
        if (diff < minUpperDiff) {
          minUpperDiff = diff;
          upper = p;
        }
      }
      // candidate for lower (<= 0.5)
      if (absDelta <= 0.5) {
        const diff = 0.5 - absDelta; // >= 0
        if (diff < minLowerDiff) {
          minLowerDiff = diff;
          lower = p;
        }
      }
    }

    if (lower && upper) {
      // If both references ended up pointing to the same element (ties), try to
      // find a different element with the same abs(delta) so interpolation
      // can use two distinct points when available.
      if (lower === upper) {
        const sameDelta = Math.abs(lower.delta);
        const other = pairs!.find(p => p !== lower && typeof p.iv === 'number' && Math.abs(p.delta) === sameDelta);
        if (other) {
          // prefer setting upper to the other matching element
          upper = other;
        }
      }

      const deltaA = Math.abs(lower.delta);
      const deltaB = Math.abs(upper.delta);
      const ivA = lower.iv;
      const ivB = upper.iv;
      // Avoid divide-by-zero: if deltas equal, return average
      if (deltaB === deltaA) return (ivA + ivB) / 2;

      // Use linear interpolation to calculate IV at delta=0.5
      const iv50 = ivA + (0.5 - deltaA) * ((ivB - ivA) / (deltaB - deltaA));
      return iv50;
    }

    // If only one side found, return its IV
    if (upper) return upper.iv;
    if (lower) return lower.iv;

    return 0;
  }

}
