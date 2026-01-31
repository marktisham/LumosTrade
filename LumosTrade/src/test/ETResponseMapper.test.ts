import { ETResponseMapper } from '../Brokers/ETrade/ETResponseMapper';
import { Quote } from '../interfaces/Quote';

describe('ETResponseMapper.mapQuotesResponse', () => {
  describe('Basic (non-detailed) quotes', () => {
    it('extracts basic fields from Fundamental block', () => {
      const sample = {
        QuoteResponse: {
          QuoteData: [
            {
              dateTime: "19:59:59 EST 01-15-2026",
              dateTimeUTC: 1768525199,
              quoteStatus: "CLOSING",
              ahFlag: "true",
              Fundamental: {
                companyName: "SPDR S&P 500 ETF TRUST",
                eps: 0,
                estEarnings: 0,
                high52: 0,
                lastTrade: 691.4199,
                low52: 0,
                symbolDescription: "SPDR S&P 500 ETF TRUST",
              },
              Product: {
                symbol: "SPY",
                securityType: "EQ",
                securitySubType: "ETF",
              },
            },
          ],
        },
      };

      const quotes: Quote[] = ETResponseMapper.mapQuotesResponse(sample, false);
      expect(Array.isArray(quotes)).toBe(true);
      expect(quotes.length).toBe(1);
      const q = quotes[0];
      expect(q.Symbol).toBe('SPY');
      expect(q.Price).toBe(691.4199);
      expect(q.CompanyName).toBe('SPDR S&P 500 ETF TRUST');
      
      // Close is always null for basic quotes
      expect(q.Close).toBeNull();
      
      // Basic quotes should not populate detailed fields
      expect(q.Bid).toBeNull();
      expect(q.Ask).toBeNull();
      expect(q.DailyHigh).toBeNull();
      expect(q.DailyLow).toBeNull();
      expect(q.Open).toBeNull();
      expect(q.PreviousClose).toBeNull();
      expect(q.Beta).toBeNull();
      expect(q.ChangeFromClose).toBeNull();
      expect(q.ChangeFromClosePct).toBeNull();
    });

    it('does not set Close when before 4pm ET', () => {
      const sample = {
        QuoteResponse: {
          QuoteData: [
            {
              dateTime: "10:30:00 EST 01-17-2026",
              dateTimeUTC: 1768650600,
              quoteStatus: "REALTIME",
              ahFlag: "false",
              Fundamental: {
                companyName: "SPDR S&P 500 ETF TRUST",
                lastTrade: 692.50,
                symbolDescription: "SPDR S&P 500 ETF TRUST",
              },
              Product: {
                symbol: "SPY",
                securityType: "EQ",
                securitySubType: "ETF",
              },
            },
          ],
        },
      };

      const quotes: Quote[] = ETResponseMapper.mapQuotesResponse(sample, false);
      expect(quotes.length).toBe(1);
      const q = quotes[0];
      expect(q.Symbol).toBe('SPY');
      expect(q.Price).toBe(692.50);
      expect(q.Close).toBeNull(); // Basic quotes always have null Close
    });
  });

  describe('Detailed quotes', () => {
    it('extracts detailed fields from All block with ExtendedHourQuoteDetail priority', () => {
      const sample = {
        QuoteResponse: {
          QuoteData: [
            {
              dateTime: "19:59:59 EST 01-15-2026",
              dateTimeUTC: 1768525199,
              quoteStatus: "CLOSING",
              ahFlag: "true",
              All: {
                adjustedFlag: false,
                ask: 691.42,
                askSize: 560,
                askTime: "19:59:59 EST 01-15-2026",
                bid: 691.4,
                bidExchange: "",
                bidSize: 200,
                bidTime: "19:59:59 EST 01-15-2026",
                changeClose: -0.58,
                changeClosePercentage: -0.08,
                companyName: "SPDR S&P 500 ETF TRUST",
                daysToExpiration: 0,
                dirLast: "2",
                dividend: 1.9933,
                eps: 6.83,
                estEarnings: 0,
                exDividendDate: 1766182519,
                high: 694.25,
                high52: 696.09,
                lastTrade: 691.66,
                low: 690.1,
                low52: 481.8,
                open: 693.66,
                openInterest: 0,
                optionStyle: "",
                optionUnderlier: "",
                previousClose: 692.24,
                previousDayVolume: 77825673,
                primaryExchange: "NYSE",
                symbolDescription: "SPDR S&P 500 ETF TRUST",
                totalVolume: 79289200,
                upc: 0,
                cashDeliverable: 0,
                marketCap: 719348533120,
                sharesOutstanding: 1040032000,
                nextEarningDate: "",
                beta: 0.98,
                yield: 1.0518,
                declaredDividend: 1.9933,
                dividendPayableDate: 1769811319,
                pe: 0,
                week52LowDate: 1744060519,
                week52HiDate: 1768342519,
                intrinsicValue: 0,
                timePremium: 0,
                optionMultiplier: 0,
                contractSize: 0,
                expirationDate: 0,
                timeOfLastTrade: 1768597800,
                averageVolume: 74611906,
                ExtendedHourQuoteDetail: {
                  lastPrice: 691.4199,
                  change: -0.58,
                  percentChange: -0.08,
                  bid: 691.4,
                  bidSize: 200,
                  ask: 691.42,
                  askSize: 560,
                  volume: 79289200,
                  timeOfLastTrade: 1768525199,
                  timeZone: "EST",
                  quoteStatus: "EH_CLOSED",
                },
              },
              Product: {
                symbol: "SPY",
                securityType: "EQ",
                securitySubType: "ETF",
              },
            },
          ],
        },
      };

      const quotes: Quote[] = ETResponseMapper.mapQuotesResponse(sample, true);
      expect(Array.isArray(quotes)).toBe(true);
      expect(quotes.length).toBe(1);
      const q = quotes[0];
      
      // Basic fields
      expect(q.Symbol).toBe('SPY');
      expect(q.Price).toBe(691.4199); // From ExtendedHourQuoteDetail.lastPrice
      expect(q.CompanyName).toBe('SPDR S&P 500 ETF TRUST');
      
      // Detailed fields
      expect(q.Bid).toBe(691.4); // From ExtendedHourQuoteDetail.bid
      expect(q.Ask).toBe(691.42); // From ExtendedHourQuoteDetail.ask
      expect(q.DailyHigh).toBe(694.25); // From All.high
      expect(q.DailyLow).toBe(690.1); // From All.low
      expect(q.Open).toBe(693.66); // From All.open
      expect(q.PreviousClose).toBe(692.24); // From All.previousClose
      expect(q.Beta).toBe(0.98); // From All.beta
      expect(q.ChangeFromClose).toBe(-0.58); // From ExtendedHourQuoteDetail.change
      expect(q.ChangeFromClosePct).toBe(-0.08); // From ExtendedHourQuoteDetail.percentChange
      expect(q.Close).toBe(691.66); // From All.lastTrade when after 4pm ET
      expect(q.NextEarningsDate).toBeNull(); // nextEarningDate is empty string in test data
      expect(q.ExDividendDate).toEqual(new Date(1766182519 * 1000)); // From All.exDividendDate
    });

    it('falls back to All fields when ExtendedHourQuoteDetail has no lastPrice', () => {
      const sample = {
        QuoteResponse: {
          QuoteData: [
            {
              dateTime: "19:59:54 EST 01-15-2026",
              dateTimeUTC: 1768525194,
              quoteStatus: "CLOSING",
              All: {
                ask: 256.00,
                bid: 255.50,
                changeClose: -3.00,
                changeClosePercentage: -1.2,
                companyName: "TEST COMPANY",
                high: 260.0,
                lastTrade: 255.75,
                low: 253.0,
                open: 258.0,
                previousClose: 259.0,
                beta: 1.1,
                ExtendedHourQuoteDetail: {
                  lastPrice: 255.80,
                  change: -3.20,
                  percentChange: -1.25,
                  bid: 255.50,
                  ask: 256.00,
                },
              },
              Product: {
                symbol: "TEST",
                securityType: "EQ",
              },
            },
          ],
        },
      };

      const quotes: Quote[] = ETResponseMapper.mapQuotesResponse(sample, true);
      expect(quotes.length).toBe(1);
      const q = quotes[0];
      
      expect(q.Symbol).toBe('TEST');
      expect(q.Price).toBe(255.80); // From ExtendedHourQuoteDetail.lastPrice
      expect(q.Bid).toBe(255.50); // From ExtendedHourQuoteDetail.bid
      expect(q.Ask).toBe(256.00); // From ExtendedHourQuoteDetail.ask
      expect(q.ChangeFromClose).toBe(-3.20); // From ExtendedHourQuoteDetail.change
      expect(q.ChangeFromClosePct).toBe(-1.25); // From ExtendedHourQuoteDetail.percentChange
      expect(q.Close).toBe(255.75); // From All.lastTrade when after 4pm ET
    });

    it('does not set Close when before 4pm ET in detailed quotes', () => {
      const sample = {
        QuoteResponse: {
          QuoteData: [
            {
              dateTime: "10:30:00 EST 01-17-2026",
              dateTimeUTC: 1768650600,
              quoteStatus: "REALTIME",
              All: {
                ask: 692.00,
                bid: 691.50,
                companyName: "SPDR S&P 500 ETF TRUST",
                lastTrade: 691.75,
                ExtendedHourQuoteDetail: {
                  lastPrice: 691.80,
                },
              },
              Product: {
                symbol: "SPY",
                securityType: "EQ",
                securitySubType: "ETF",
              },
            },
          ],
        },
      };

      const quotes: Quote[] = ETResponseMapper.mapQuotesResponse(sample, true);
      expect(quotes.length).toBe(1);
      const q = quotes[0];
      
      expect(q.Symbol).toBe('SPY');
      expect(q.Price).toBe(691.80);
      expect(q.Close).toBeNull(); // Should be null because time is before 4pm ET
    });

    it('falls back to All.lastTrade when ExtendedHourQuoteDetail is absent', () => {
      const sample = {
        QuoteResponse: {
          QuoteData: [
            {
              dateTime: "13:35:50 EST 01-21-2026",
              dateTimeUTC: 1769020550,
              quoteStatus: "REALTIME",
              ahFlag: "false",
              All: {
                lastTrade: 245.9399,
                high: 248.75,
                low: 245.18,
                companyName: "APPLE INC COM"
              },
              Product: {
                symbol: "AAPL",
                securityType: "EQ",
              },
            },
          ],
        },
      };

      const quotes: Quote[] = ETResponseMapper.mapQuotesResponse(sample, true);
      expect(quotes.length).toBe(1);
      const q = quotes[0];
      expect(q.Symbol).toBe('AAPL');
      expect(q.Price).toBe(245.9399);
      expect(q.CompanyName).toBe('APPLE INC COM');
    });

    it('parses full AAPL regular-hours payload without ExtendedHourQuoteDetail', () => {
      const sample = {
        QuoteResponse: {
          QuoteData: [
            {
              dateTime: "13:35:50 EST 01-21-2026",
              dateTimeUTC: 1769020550,
              quoteStatus: "REALTIME",
              ahFlag: "false",
              All: {
                adjustedFlag: false,
                ask: 245.94,
                askSize: 300,
                askTime: "13:35:50 EST 01-21-2026",
                bid: 245.91,
                bidExchange: "",
                bidSize: 200,
                bidTime: "13:35:50 EST 01-21-2026",
                changeClose: -0.7601,
                changeClosePercentage: -0.31,
                companyName: "APPLE INC COM",
                daysToExpiration: 0,
                dirLast: "1",
                dividend: 0.26,
                eps: 7.46,
                estEarnings: 8.25,
                exDividendDate: 1762799752,
                high: 248.75,
                high52: 288.62,
                lastTrade: 245.9399,
                low: 245.18,
                low52: 169.2101,
                open: 248.7,
                openInterest: 0,
                optionStyle: "",
                optionUnderlier: "",
                previousClose: 246.7,
                previousDayVolume: 80212591,
                primaryExchange: "NSDQ",
                symbolDescription: "APPLE INC COM",
                totalVolume: 23302949,
                upc: 0,
                cashDeliverable: 0,
                marketCap: 3614806450647.4,
                sharesOutstanding: 14697926000,
                nextEarningDate: "02/01/2026",
                beta: 0.9,
                yield: 0.4216,
                declaredDividend: 0.26,
                dividendPayableDate: 1763058952,
                pe: 33.2186,
                week52LowDate: 1744133752,
                week52HiDate: 1764786952,
                intrinsicValue: 0,
                timePremium: 0,
                optionMultiplier: 0,
                contractSize: 0,
                expirationDate: 0,
                timeOfLastTrade: 1769020550,
                averageVolume: 51389109,
              },
              Product: {
                symbol: "AAPL",
                securityType: "EQ",
              },
            },
          ],
        },
      };

      const quotes: Quote[] = ETResponseMapper.mapQuotesResponse(sample, true);
      expect(quotes.length).toBe(1);
      const q = quotes[0];

      expect(q.Symbol).toBe('AAPL');
      expect(q.Price).toBe(245.9399);
      expect(q.CompanyName).toBe('APPLE INC COM');
      expect(q.Bid).toBe(245.91);
      expect(q.Ask).toBe(245.94);
      expect(q.DailyHigh).toBe(248.75);
      expect(q.DailyLow).toBe(245.18);
      expect(q.Open).toBe(248.7);
      expect(q.PreviousClose).toBe(246.7);
      expect(q.Beta).toBe(0.9);
      expect(q.ChangeFromClose).toBe(-0.7601);
      expect(q.ChangeFromClosePct).toBe(-0.31);
      expect(q.ExDividendDate).toEqual(new Date(1762799752 * 1000));
      expect(q.NextEarningsDate).toBeNull(); // string date not parsed as numeric epoch
      expect(q.Close).toBeNull(); // before market close (13:35 ET)
      expect(q.LastUpdated.getTime()).toBe(new Date(1769020550 * 1000).getTime());
    });

    it('skips quote when no valid price available across sources', () => {
      const sample = {
        QuoteResponse: {
          QuoteData: [
            {
              dateTimeUTC: null,
              quoteStatus: "REALTIME",
              All: {
                lastTrade: null
              },
              Fundamental: {
                lastTrade: null
              },
              Product: { symbol: 'NOPRICE' },
            }
          ]
        }
      };

      const quotes: Quote[] = ETResponseMapper.mapQuotesResponse(sample, true);
      expect(quotes.length).toBe(0);
    });
  });
});
