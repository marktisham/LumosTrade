export class Instrument {
  Symbol: string | null;
  Cusip: string | null;
  Description: string | null;

  constructor(symbol: string | null, cusip: string | null, description: string | null) {
    this.Symbol = symbol;
    this.Cusip = cusip;
    this.Description = description;
  }
}
