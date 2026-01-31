export class Milestone {
  public ID?: number | null;
  public AccountID?: number | null;
  public DayStart: Date;
  public DayEnd?: Date | null;
  public Name: string;

  constructor(
    DayStart: Date,
    Name: string,
    AccountID?: number | null,
    DayEnd?: Date | null,
    ID?: number | null
  ) {
    this.DayStart = DayStart;
    this.Name = Name;
    this.AccountID = AccountID ?? null;
    this.DayEnd = DayEnd ?? null;
    this.ID = ID ?? null;
  }
}
