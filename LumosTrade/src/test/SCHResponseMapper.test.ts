import { SCHResponseMapper } from '../Brokers/Schwab/SCHResponseMapper';
import { Quote } from '../interfaces/Quote';

describe('SCHResponseMapper.mapQuotesResponse', () => {
  describe('Basic (non-detailed) quotes', () => {
    it('extracts basic fields from quote block', () => {
      const sample = {
        SPY: {
          assetMainType: "EQUITY",
          assetSubType: "ETF",
          quoteType: "NBBO",
          realtime: true,
          ssid: 1281357639,
          symbol: "SPY",
          quote: {
            "52WeekHigh": 696.09,
            "52WeekLow": 481.8,
            askMICId: "ARCX",
            askPrice: 691.42,
            askSize: 560,
            askTime: 1768611597951,
            bidMICId: "ARCX",
            bidPrice: 691.4,
            bidSize: 200,
            bidTime: 1768611582682,
            closePrice: 692.24,
            highPrice: 694.25,
            lastMICId: "ARCX",
            lastPrice: 691.4199,
            lastSize: 1,
            lowPrice: 690.1,
            mark: 691.66,
            markChange: -0.58,
            markPercentChange: -0.08378597,
            netChange: -0.8201,
            netPercentChange: -0.11847047,
            openPrice: 693.66,
            postMarketChange: -0.2401,
            postMarketPercentChange: -0.03471359,
            quoteTime: 1768611597951,
            securityStatus: "Normal",
            totalVolume: 79289200,
            tradeTime: 1768611599867,
          },
        },
      };

      const quotes: Quote[] = SCHResponseMapper.mapQuotesResponse(sample, false);
      expect(Array.isArray(quotes)).toBe(true);
      expect(quotes.length).toBe(1);
      const q = quotes[0];
      expect(q.Symbol).toBe('SPY');
      expect(q.Price).toBe(691.4199);
      expect(q.CompanyName).toBeNull(); // No reference block in basic response
      
      // Basic quotes populate all available fields from quote block
      expect(q.Bid).toBe(691.4);
      expect(q.Ask).toBe(691.42);
      expect(q.DailyHigh).toBe(694.25);
      expect(q.DailyLow).toBe(690.1);
      expect(q.Open).toBe(693.66);
      expect(q.PreviousClose).toBe(692.24);
      expect(q.Beta).toBeNull(); // Not available in Schwab responses
      expect(q.ChangeFromClose).toBe(-0.58);
      expect(q.ChangeFromClosePct).toBe(-0.08378597);
      expect(q.Close).toBe(691.66); // mark after 4pm ET (timestamp is ~7:59pm ET)
    });

    it('does not set Close when before 4pm ET', () => {
      const sample = {
        SPY: {
          symbol: "SPY",
          quote: {
            askPrice: 692.25,
            bidPrice: 691.75,
            closePrice: 692.0,
            highPrice: 694.0,
            lastPrice: 692.50,
            lowPrice: 690.5,
            mark: 692.48,
            markChange: -0.50,
            markPercentChange: -0.072,
            openPrice: 693.0,
            quoteTime: 1768648800000, // 10am ET
            securityStatus: "Open",
            tradeTime: 1768648810000,
          },
        },
      };

      const quotes: Quote[] = SCHResponseMapper.mapQuotesResponse(sample, false);
      expect(quotes.length).toBe(1);
      const q = quotes[0];
      expect(q.Symbol).toBe('SPY');
      expect(q.Price).toBe(692.50);
      
      // Close should NOT be set when before 4pm ET
      expect(q.Close).toBeNull();
    });
  });

  describe('Detailed quotes', () => {
    it('extracts detailed fields with extended block priority', () => {
      const sample = {
        SPY: {
          assetMainType: "EQUITY",
          assetSubType: "ETF",
          quoteType: "NBBO",
          realtime: true,
          ssid: 1281357639,
          symbol: "SPY",
          extended: {
            askPrice: 0,
            askSize: 0,
            bidPrice: 0,
            bidSize: 0,
            lastPrice: 694.12,
            lastSize: 110,
            mark: 0,
            quoteTime: 1768611597000,
            totalVolume: 0,
            tradeTime: 1768611599000,
          },
          fundamental: {
            avg10DaysVolume: 76141844,
            avg1YearVolume: 73335534,
            declarationDate: "2025-01-09T00:00:00Z",
            divAmount: 7.97347,
            divExDate: "2025-12-19T00:00:00Z",
            divFreq: 4,
            divPayAmount: 1.99337,
            divPayDate: "2026-01-30T00:00:00Z",
            divYield: 1.15497,
            eps: 99.72564,
            fundLeverageFactor: 0,
            lastEarningsDate: "2025-11-25T00:00:00Z",
            nextDivExDate: "2026-03-19T00:00:00Z",
            nextDivPayDate: "2026-04-30T00:00:00Z",
            peRatio: 6.94144,
            sharesOutstanding: 1036632116,
          },
          quote: {
            "52WeekHigh": 696.09,
            "52WeekLow": 481.8,
            askMICId: "ARCX",
            askPrice: 691.42,
            askSize: 560,
            askTime: 1768611597951,
            bidMICId: "ARCX",
            bidPrice: 691.4,
            bidSize: 200,
            bidTime: 1768611582682,
            closePrice: 692.24,
            highPrice: 694.25,
            lastMICId: "ARCX",
            lastPrice: 691.4199,
            lastSize: 1,
            lowPrice: 690.1,
            mark: 691.66,
            markChange: -0.58,
            markPercentChange: -0.08378597,
            netChange: -0.8201,
            netPercentChange: -0.11847047,
            openPrice: 693.66,
            postMarketChange: -0.2401,
            postMarketPercentChange: -0.03471359,
            quoteTime: 1768611597951,
            securityStatus: "Normal",
            totalVolume: 79289200,
            tradeTime: 1768611599867,
          },
          reference: {
            cusip: "78462F103",
            description: "SPDR S&P 500 ETF",
            exchange: "P",
            exchangeName: "NYSE Arca",
            isHardToBorrow: false,
            isShortable: true,
            htbRate: 0,
          },
          regular: {
            regularMarketLastPrice: 691.66,
            regularMarketLastSize: 87,
            regularMarketNetChange: -0.58,
            regularMarketPercentChange: -0.08378597,
            regularMarketTradeTime: 1768611600001,
          },
        },
      };

      const quotes: Quote[] = SCHResponseMapper.mapQuotesResponse(sample, true);
      expect(Array.isArray(quotes)).toBe(true);
      expect(quotes.length).toBe(1);
      const q = quotes[0];
      
      // Basic fields
      expect(q.Symbol).toBe('SPY');
      expect(q.Price).toBe(691.4199); // From quote.lastPrice
      expect(q.CompanyName).toBe('SPDR S&P 500 ETF');
      
      // Detailed fields
      expect(q.Bid).toBe(691.4); // From quote.bidPrice (extended was 0)
      expect(q.Ask).toBe(691.42); // From quote.askPrice (extended was 0)
      expect(q.DailyHigh).toBe(694.25); // From quote.highPrice
      expect(q.DailyLow).toBe(690.1); // From quote.lowPrice
      expect(q.Open).toBe(693.66); // From quote.openPrice
      expect(q.PreviousClose).toBe(692.24); // From quote.closePrice
      expect(q.Beta).toBeNull(); // Not available in Schwab responses
      expect(q.ChangeFromClose).toBe(-0.58); // From quote.markChange
      expect(q.ChangeFromClosePct).toBe(-0.08378597); // From quote.markPercentChange
      expect(q.Close).toBe(691.66); // From regular.regularMarketLastPrice when after 4pm ET
      expect(q.NextEarningsDate).toBeNull(); // lastEarningsDate is in the past (2025-11-25), so not set
      expect(q.ExDividendDate).toEqual(new Date("2026-03-19T00:00:00Z")); // From fundamental.nextDivExDate
    });

    it('falls back to quote fields when extended is missing or zero', () => {
      const sample = {
        TEST: {
          symbol: "TEST",
          extended: {
            askPrice: 0,
            askSize: 0,
            bidPrice: 0,
            bidSize: 0,
            lastPrice: 0,
            lastSize: 0,
            mark: 0,
            quoteTime: 1768611597000,
            totalVolume: 0,
            tradeTime: 1768611599000,
          },
          quote: {
            askPrice: 256.00,
            bidPrice: 255.50,
            closePrice: 259.0,
            highPrice: 260.0,
            lastPrice: 255.75,
            lowPrice: 253.0,
            openPrice: 258.0,
            markChange: -3.00,
            markPercentChange: -1.2,
            quoteTime: 1768611592818,
            securityStatus: "Normal",
            tradeTime: 1768611594549,
          },
          reference: {
            description: "TEST COMPANY",
          },
          regular: {
            regularMarketLastPrice: 255.80,
            regularMarketLastSize: 50,
            regularMarketNetChange: -3.20,
            regularMarketPercentChange: -1.23,
            regularMarketTradeTime: 1768611600001,
          },
        },
      };

      const quotes: Quote[] = SCHResponseMapper.mapQuotesResponse(sample, true);
      expect(quotes.length).toBe(1);
      const q = quotes[0];
      
      expect(q.Symbol).toBe('TEST');
      expect(q.Price).toBe(255.75); // From quote.lastPrice
      expect(q.Bid).toBe(255.50); // From quote.bidPrice (extended was 0)
      expect(q.Ask).toBe(256.00); // From quote.askPrice (extended was 0)
      expect(q.ChangeFromClose).toBe(-3.00); // From quote.markChange
      expect(q.ChangeFromClosePct).toBe(-1.2); // From quote.markPercentChange
      expect(q.Close).toBe(255.80); // From regular.regularMarketLastPrice when after 4pm ET
    });

    it('sets Close from regularMarketLastPrice in detailed quotes', () => {
      const sample = {
        SPY: {
          symbol: "SPY",
          quote: {
            lastPrice: 692.75,
            closePrice: 692.0,
            quoteTime: 1768648800000, // 10am ET
            securityStatus: "Open",
            tradeTime: 1768648810000,
          },
          reference: {
            description: "SPDR S&P 500 ETF",
          },
          regular: {
            regularMarketLastPrice: 692.50,
            regularMarketLastSize: 100,
            regularMarketNetChange: -0.50,
            regularMarketPercentChange: -0.072,
            regularMarketTradeTime: 1768648800000,
          },
        },
      };

      const quotes: Quote[] = SCHResponseMapper.mapQuotesResponse(sample, true);
      expect(quotes.length).toBe(1);
      const q = quotes[0];
      
      expect(q.Symbol).toBe('SPY');
      expect(q.Price).toBe(692.75);
      expect(q.Close).toBe(692.50); // From regular.regularMarketLastPrice
    });
  });
});
