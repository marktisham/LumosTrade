

export enum TransactionType {
  Transfer = 'Transfer',
  Dividend = 'Dividend'
}

export class Transaction {
  TransactionID: number | null;
  BrokerTransactionID: number;
  TransactionDate: Date;
  Description: string;
  Type: TransactionType;
  Quantity: number | null;
  Symbol: string | null;
  Price: number | null;
  Amount: number | null;

  constructor(
    TransactionID: number | null = null,
    BrokerTransactionID: number,
    TransactionDate: Date,
    Description: string,
    Type: TransactionType,
    Quantity: number | null = null,
    Symbol: string | null = null,
    Price: number | null = null,
    Amount: number | null = null
  ) {
    this.TransactionID = TransactionID;
    this.BrokerTransactionID = BrokerTransactionID;
    this.TransactionDate = TransactionDate;
    this.Description = Description;
    this.Type = Type;
    this.Quantity = Quantity;
    this.Symbol = Symbol;
    this.Price = Price;
    this.Amount = Amount;
  }
}
