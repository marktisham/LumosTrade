export class SymbolGroup {
  public ID?: number | null;
  public Symbols: string;
  public Name: string;
  public LastUpdated: Date;
  public RollupGroup: boolean;

  constructor(
    Symbols: string,
    Name: string,
    LastUpdated: Date,
    ID?: number | null,
    RollupGroup?: boolean
  ) {
    this.Symbols = Symbols;
    this.Name = Name;
    this.LastUpdated = LastUpdated;
    this.ID = ID ?? null;
    this.RollupGroup = RollupGroup ?? false;
  }
}