import { OptionExpiryType } from './OptionExpirationDate';

export class ExpectedMove {
  public Symbol: string;
  public ExpiryType: OptionExpiryType | string;
  public InitialValue: boolean;
  public ExpiryDate: Date;
  public IV: number;
  public ClosingPrice: number;
  public Delta: number;
  public OneSigmaHigh: number;
  public OneSigmaLow: number;
  public TwoSigmaHigh: number;
  public TwoSigmaLow: number;
  public LastUpdated: Date;

  constructor(
    Symbol: string,
    ExpiryType: OptionExpiryType | string,
    InitialValue: boolean,
    ExpiryDate: Date,
    IV: number,
    ClosingPrice: number,
    Delta: number,
    OneSigmaHigh: number,
    OneSigmaLow: number,
    TwoSigmaHigh: number,
    TwoSigmaLow: number,
    LastUpdated: Date
  ) {
    this.Symbol = Symbol;
    this.ExpiryType = ExpiryType;
    this.InitialValue = InitialValue;
    this.ExpiryDate = ExpiryDate;
    this.IV = IV;
    this.ClosingPrice = ClosingPrice;
    this.Delta = Delta;
    this.OneSigmaHigh = OneSigmaHigh;
    this.OneSigmaLow = OneSigmaLow;
    this.TwoSigmaHigh = TwoSigmaHigh;
    this.TwoSigmaLow = TwoSigmaLow;
    this.LastUpdated = LastUpdated;
  }
}
