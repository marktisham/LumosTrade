export class Quote {
  public QuoteID: number;
  public AccountID: number;
  public Symbol: string;
  public Price: number;
  public LastUpdated: Date;

  // Non-persisted fields (not stored in DB). These are set after DB mapping.
  // Add future non-DB-only properties here so it's clear what comes from the DB vs derived/enriched data.
  public CompanyName: string | null = null;
  public Bid: number | null = null;
  public Ask: number | null = null;
  public DailyHigh: number | null = null;
  public DailyLow: number | null = null;
  public Open: number | null = null;
  public PreviousClose: number | null = null;
  public Beta: number | null = null;
  public ChangeFromClose: number | null = null;
  public ChangeFromClosePct: number | null = null;
  public Close: number | null = null;
  public NextEarningsDate: Date | null = null;
  public ExDividendDate: Date | null = null;

  constructor(quoteId: number, accountId: number, symbol: string, price: number, lastUpdated: Date) {
    this.QuoteID = quoteId;
    this.AccountID = accountId;
    this.Symbol = symbol;
    this.Price = price;
    this.LastUpdated = lastUpdated;
  }

  /**
   * Compare two Quote objects and log differences to console in a formatted way.
   * Useful for comparing quotes from different brokers.
   */
  static LogComparison(quote1: Quote | null, quote2: Quote | null, label1: string = "Quote 1", label2: string = "Quote 2"): void {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Quote Comparison: ${label1} vs ${label2}`);
    console.log('='.repeat(80));

    if (!quote1 && !quote2) {
      console.log('Both quotes are null');
      return;
    }

    if (!quote1) {
      console.log(`${label1} is null, ${label2} has data for ${quote2?.Symbol}`);
      return;
    }

    if (!quote2) {
      console.log(`${label2} is null, ${label1} has data for ${quote1?.Symbol}`);
      return;
    }

    console.log(`Symbol: ${quote1.Symbol}`);
    console.log('-'.repeat(80));

    const fields: Array<{ key: keyof Quote; format?: (val: any) => string }> = [
      { key: 'Price' },
      { key: 'CompanyName' },
      { key: 'Bid' },
      { key: 'Ask' },
      { key: 'DailyHigh' },
      { key: 'DailyLow' },
      { key: 'Open' },
      { key: 'PreviousClose' },
      { key: 'Beta' },
      { key: 'ChangeFromClose' },
      { key: 'ChangeFromClosePct' },
      { key: 'Close' },
      { key: 'NextEarningsDate', format: (val) => val ? new Date(val).toISOString() : 'null' },
      { key: 'ExDividendDate', format: (val) => val ? new Date(val).toISOString() : 'null' },
      { key: 'LastUpdated', format: (val) => val ? new Date(val).toISOString() : 'null' },
    ];

    let differences = 0;
    for (const field of fields) {
      const val1 = quote1[field.key];
      const val2 = quote2[field.key];
      
      const formatted1 = field.format ? field.format(val1) : String(val1);
      const formatted2 = field.format ? field.format(val2) : String(val2);

      // Compare values (handle null, undefined, dates)
      let areEqual = false;
      if (val1 instanceof Date && val2 instanceof Date) {
        areEqual = val1.getTime() === val2.getTime();
      } else if (val1 === val2) {
        areEqual = true;
      } else if (val1 == null && val2 == null) {
        areEqual = true;
      }

      const marker = areEqual ? '✓' : '✗';
      const color = areEqual ? '' : '⚠️  ';
      
      console.log(`${color}${marker} ${String(field.key).padEnd(20)} | ${label1}: ${formatted1.padEnd(25)} | ${label2}: ${formatted2}`);
      
      if (!areEqual) differences++;
    }

    console.log('-'.repeat(80));
    console.log(`Total differences: ${differences}`);
    console.log('='.repeat(80));
  }
}
