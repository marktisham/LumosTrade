import { DataAccessBase } from '../database/DataAccessBase';

describe('DataAccessBase.mapRowToExpectedMove (ExpiryDate interpreted as Eastern midnight)', () => {
  test('parses expiry date string correctly (matches OptionExpirationDate.toDate)', () => {
    const row: any = {
      Symbol: 'TEST',
      ExpiryType: 'weekly',
      InitialValue: 1,
      ExpiryDate: '2025-12-21', // midnight ET = 05:00 UTC
      IV: 1,
      ClosingPrice: 100,
      Delta: 0.5,
      OneSigmaHigh: 101,
      OneSigmaLow: 99,
      TwoSigmaHigh: 102,
      TwoSigmaLow: 98,
      LastUpdated: '2025-01-01T00:00:00Z'
    };

    const em: any = (DataAccessBase as any).mapRowToExpectedMove(row);
    // Should match OptionExpirationDate.toDate() behavior: midnight ET = 05:00 UTC
    expect(em.ExpiryDate.toISOString()).toBe('2025-12-21T05:00:00.000Z');
  });

  test('parses expiry Date object correctly', () => {
    const row: any = {
      Symbol: 'TEST',
      ExpiryType: 'weekly',
      InitialValue: 1,
      ExpiryDate: new Date('2025-12-21T00:00:00Z'), // driver Date with date components in UTC
      IV: 1,
      ClosingPrice: 100,
      Delta: 0.5,
      OneSigmaHigh: 101,
      OneSigmaLow: 99,
      TwoSigmaHigh: 102,
      TwoSigmaLow: 98,
      LastUpdated: '2025-01-01T00:00:00Z'
    };

    const em: any = (DataAccessBase as any).mapRowToExpectedMove(row);
    expect(em.ExpiryDate.toISOString()).toBe('2025-12-21T05:00:00.000Z');
  });

  test('different date produces different UTC timestamp', () => {
    const row: any = {
      Symbol: 'TEST',
      ExpiryType: 'weekly',
      InitialValue: 1,
      ExpiryDate: '2025-07-15',
      IV: 1,
      ClosingPrice: 100,
      Delta: 0.5,
      OneSigmaHigh: 101,
      OneSigmaLow: 99,
      TwoSigmaHigh: 102,
      TwoSigmaLow: 98,
      LastUpdated: '2025-01-01T00:00:00Z'
    };

    const em: any = (DataAccessBase as any).mapRowToExpectedMove(row);
    expect(em.ExpiryDate.toISOString()).toBe('2025-07-15T05:00:00.000Z');
  });
});
