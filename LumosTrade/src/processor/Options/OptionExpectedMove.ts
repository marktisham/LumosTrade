import { ETClientExtended } from '../../Brokers/ETrade/ETClientExtended';
import { OptionPair } from '../../interfaces/OptionPair';
import { OptionExpirationDate, OptionExpiryType } from '../../interfaces/OptionExpirationDate';
import { ExpectedMove } from '../../interfaces/ExpectedMove';
import { DataAccess } from '../../database/DataAccess';
import { DateUtils } from '../../utils/DateUtils';

export class OptionExpectedMove {

  public static async UpdateExpectedMoves(): Promise<void> {
    console.log('Updating expected moves for all registered symbols...');
    const symbols = await DataAccess.GetExpectedMoveSymbols();
    for (const s of symbols) {
      await OptionExpectedMove.processSymbol(s);
    }

    console.log(`Updated expected moves for ${symbols.length} symbols`);
  }

  /**
   * Process a single symbol: calculate expected moves and upsert into DB.
   */
  private static async processSymbol(symbol: string): Promise<void> {

    // Get the most recent expected moves for all expiry types for this symbol
    const expectedMoves = await OptionExpectedMove.calcExpectedMoves(symbol);

    for (const em of expectedMoves) {
      // Get current initial expected move from DB (InitialValue = 1)
      const currentInitial = await DataAccess.GetInitialExpectedMove(em.Symbol, String(em.ExpiryType));

      // If no initial exists, or the stored expiry is less than the newly calculated expiry, upsert as InitialValue = 1
      if (!currentInitial || currentInitial.ExpiryDate < em.ExpiryDate) {
        await DataAccess.UpsertExpectedMove(em, true);
      }

      // Always upsert a non-initial (InitialValue = 0) record for the current calculation
      await DataAccess.UpsertExpectedMove(em, false);
    }
  }


  private static async calcExpectedMoves(symbol: string): Promise<ExpectedMove[]> {
    const et = new ETClientExtended();
    const results: ExpectedMove[] = [];

    // 1) Get option expiration dates
    const dates = await et.GetOptionsDates(symbol);
    if (!dates || dates.length === 0) {
      throw new Error(`No option expiration dates returned for symbol ${symbol}`);
    }

    // 2) Iterate over all expiry types and compute expected move for the next matching date
    for (const t of Object.values(OptionExpiryType) as OptionExpiryType[]) {
      const nextDate = OptionExpirationDate.GetNextExpirationDateOfType(dates, t);
      if (nextDate) {
        // Execute the remainder of the logic for this expiry/type
        const em = await OptionExpectedMove.CalcExpectedMoveFor(symbol, et, nextDate, t);
        if (em) results.push(em);
      }
    }

    return results;
  }

  /**
   * Helper that performs the existing calculation for a specific expiration date and expiry type.
   * Returns an ExpectedMove object or null if insufficient data.
   */
  private static async CalcExpectedMoveFor(symbol: string, et: ETClientExtended, optionExpiryDate: OptionExpirationDate, expiryType: OptionExpiryType): Promise<ExpectedMove | null> {
    // Get options chain for the expiration date
    const [closingPrice, pairs] = await et.GetOptionsChain(symbol, optionExpiryDate, 5);
    if (closingPrice == null) {
      console.warn(`No closing price returned for symbol ${symbol}. Skipping expected move calculation.`);
      return null;
    }

    // Compute the Implied volatility at the 50-delta point
    const fiftyDeltaIV = OptionPair.CalcAtmIV(pairs);

    // Calculate one-sigma expected move amount using the number of trading days (Mon-Fri) until expiry
    const now = new Date();
    const expiryDate = optionExpiryDate.toDate();

    // Count trading days excluding today and including the expiry day
    const tradingDays = DateUtils.GetTradingDaysBetween(now, expiryDate);

    // If expiry is in the past or occurs right now, skip this expiry
    if (tradingDays <= 0) {
      return null;
    }

    // Formula for expected move from Gemini...
    const tradingDaysInYear = 252; // standard assumption
    const oneSigmaDelta = closingPrice * fiftyDeltaIV * Math.sqrt(tradingDays / tradingDaysInYear);

    // Calculate bounds
    const upper = closingPrice + oneSigmaDelta;
    const lower = closingPrice - oneSigmaDelta;

    // Calculate two-sigma bounds
    const twoSigmaDelta = 2 * oneSigmaDelta;
    const upper2 = closingPrice + twoSigmaDelta;
    const lower2 = closingPrice - twoSigmaDelta;

    // Construct ExpectedMove (InitialValue set to true for new calculation)
    const expected = new ExpectedMove(
      symbol,
      expiryType as any,
      true,
      optionExpiryDate.toDate(),
      fiftyDeltaIV,
      closingPrice,
      oneSigmaDelta,
      upper,
      lower,
      upper2,
      lower2,
      new Date()
    );

    return expected;
  }
}
