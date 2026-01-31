import { OptionExpectedMove } from '../processor/Options/OptionExpectedMove';
import { OptionExpirationDate, OptionExpiryType } from '../interfaces/OptionExpirationDate';
import { OptionPair } from '../interfaces/OptionPair';

describe('OptionExpectedMove.CalcExpectedMoveFor (rounding behavior)', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    // Align with other tests: 2025-12-21 12:00 UTC
    jest.setSystemTime(new Date(Date.UTC(2025, 11, 21, 12, 0, 0)));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('fractional days to expiry are rounded up to 1 day', async () => {
    const symbol = 'FOO';

    // Expiry is 2025-12-22 -> toDate() returns 2025-12-22 05:00 UTC (midnight Eastern assumed)
    const expiry = new OptionExpirationDate(2025, 12, 22, OptionExpiryType.DAILY);

    // Mock ET client with GetOptionsChain returning nearPrice and pairs with an IV of 0.2
    const mockEt: any = {
      GetOptionsChain: async (_sym: string, _d: any, _n: number) => {
        const pair = new OptionPair(100, 0, 0, 0, 0.5, 0, 0.2, '', 'PUT');
        return [100, [pair]] as [number, OptionPair[]];
      }
    };

    // Call the private static method by indexing (TypeScript allows this in tests)
    const result = await (OptionExpectedMove as any).CalcExpectedMoveFor(symbol, mockEt, expiry, OptionExpiryType.DAILY);

    expect(result).not.toBeNull();

    // trading days should be 1, so oneSigmaDelta = 100 * 0.2 * Math.sqrt(1/252)
    const expectedOneSigma = 100 * 0.2 * Math.sqrt(1 / 252);
    expect((result as any).Delta).toBeCloseTo(expectedOneSigma, 10);
  });
});