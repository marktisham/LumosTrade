import { Account } from './Account';
import { BrokerAccountBalance } from './AccountHistory';
import { Order } from './Order';
import { Quote } from './Quote';
import { PlaceOrderDetail } from './PlaceOrderDetail';
import { PreviewOrderResponse } from './PreviewOrderResponse';
import { PlaceOrderResponse } from './PlaceOrderResponse';
import { Transaction } from './Transaction';
import { Position } from './Position';

export interface BrokerClient {
  GetBrokerID(): number;
  GetBrokerName(): string;
  ImportAccounts(): Promise<Account[]>;

  GetAccounts(): Promise<Account[]>;
  GetAccountBalance(account: Account): Promise<BrokerAccountBalance>;
  GetOrders(account: Account, fromDateUTC?: Date, filledOrdersOnly?: boolean): Promise<Order[]>;  // When true (default) return only filled/executed orders; set to false to return all broker orders (including zero-quantity/other statuses).
  PreviewOrder(account: Account, order: PlaceOrderDetail): Promise<PreviewOrderResponse | null>;
  PlaceOrder(account: Account, order: PlaceOrderDetail, preview?: PreviewOrderResponse): Promise<PlaceOrderResponse | null>;
  CancelOrder(account: Account, order: Order): Promise<boolean>;
  GetQuotes(symbols: string[], detailedQuote?: boolean): Promise<Quote[]>;
  GetTransactions(account: Account, fromDateUTC?: Date): Promise<Transaction[]>;
  GetPositions(account: Account): Promise<Position[]>;
}
