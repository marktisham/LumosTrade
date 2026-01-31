
import { RollupPeriod } from '../utils/RollupUtils';

export class TradeHistory {
  TradeHistoryID: number | null;
  AccountID: number;
  TradeID: number;
  RollupPeriod: RollupPeriod;
  PeriodEnd: Date;
  PeriodGain: number | null;
  PeriodGainPct: number | null;
  TotalGain: number | null;
  TotalGainPct: number | null;
  CurrentValue: number | null;
  CurrentCost: number | null;
  CurrentPriceAtPeriodEnd: number | null;
  OpenQuantityAtPeriodEnd: number | null;
  BreakevenPriceAtPeriodEnd: number | null;
  RealizedGainAtPeriodEnd: number | null;
  UnrealizedGainAtPeriodEnd: number | null;

  constructor(
    TradeHistoryID: number | null = null,
    AccountID: number,
    TradeID: number,
    RollupPeriod: RollupPeriod,
    PeriodEnd: Date,
    PeriodGain: number | null = null,
    PeriodGainPct: number | null = null,
    TotalGain: number | null = null,
    TotalGainPct: number | null = null,
    CurrentValue: number | null = null,
    CurrentCost: number | null = null,
    CurrentPriceAtPeriodEnd: number | null = null,
    OpenQuantityAtPeriodEnd: number | null = null,
    BreakevenPriceAtPeriodEnd: number | null = null,
    RealizedGainAtPeriodEnd: number | null = null,
    UnrealizedGainAtPeriodEnd: number | null = null
  ) {
    this.TradeHistoryID = TradeHistoryID;
    this.AccountID = AccountID;
    this.TradeID = TradeID;
    this.RollupPeriod = RollupPeriod;
    this.PeriodEnd = PeriodEnd;
    this.PeriodGain = PeriodGain;
    this.PeriodGainPct = PeriodGainPct;
    this.TotalGain = TotalGain;
    this.TotalGainPct = TotalGainPct;
    this.CurrentValue = CurrentValue;
    this.CurrentCost = CurrentCost;
    this.CurrentPriceAtPeriodEnd = CurrentPriceAtPeriodEnd;
    this.OpenQuantityAtPeriodEnd = OpenQuantityAtPeriodEnd;
    this.BreakevenPriceAtPeriodEnd = BreakevenPriceAtPeriodEnd;
    this.RealizedGainAtPeriodEnd = RealizedGainAtPeriodEnd;
    this.UnrealizedGainAtPeriodEnd = UnrealizedGainAtPeriodEnd;
  }
}
