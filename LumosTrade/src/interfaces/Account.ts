import { BrokerAccountBalance } from './AccountHistory';

export class Account {
  public BrokerAccountID: number;
  public BrokerAccountKey: string;
  public Description: string;
  public Name: string;
  public AccountID?: number | null;
  public LatestBrokerTransactionID?: number | null;
  public LatestBrokerTransactionDate?: Date | null;
  public Closed: boolean;

  constructor(
    BrokerAccountID: number,
    BrokerAccountKey: string,
    Description: string,
    Name: string,
    AccountID?: number | null,
    LatestBrokerTransactionID?: number | null,
    LatestBrokerTransactionDate?: Date | null,
    Closed: boolean = false
  ) {
    this.BrokerAccountID = BrokerAccountID;
    this.BrokerAccountKey = BrokerAccountKey;
    this.Description = Description;
    this.Name = Name;
    this.AccountID = AccountID ?? null;
    this.LatestBrokerTransactionID = LatestBrokerTransactionID ?? null;
    this.LatestBrokerTransactionDate = LatestBrokerTransactionDate ?? null;
    this.Closed = Closed ?? false;
  }
}
