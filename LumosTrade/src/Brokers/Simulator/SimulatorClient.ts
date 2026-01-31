import { BrokerClient } from '../../interfaces/BrokerClient';
import { Account } from '../../interfaces/Account';
import { BrokerAccountBalance } from '../../interfaces/AccountHistory';
import { Order } from '../../interfaces/Order';
import { Quote } from '../../interfaces/Quote';
import { PlaceOrderDetail } from '../../interfaces/PlaceOrderDetail';
import { PreviewOrderResponse } from '../../interfaces/PreviewOrderResponse';
import { PlaceOrderResponse } from '../../interfaces/PlaceOrderResponse';
import { Transaction } from '../../interfaces/Transaction';
import { Position } from '../../interfaces/Position';
import { DataAccess } from '../../database/DataAccess';
import { LumosStateHelper } from '../../utils/LumosStateHelper';
import { SimulationContext } from '../../processor/Simulator/SimulationContext';
import { SimulateAccounts } from './SimulateAccounts';
import { SimulateOrders } from './SimulateOrders';
import { SimulateQuotes } from './SimulateQuotes';
import { SimulateTransactions } from './SimulateTransactions';
import { SimulationOrchestrator } from '../../processor/Simulator/SimulationOrchestrator';


export abstract class SimulatorClient implements BrokerClient {
  public simulationContext?: SimulationContext;
  
  abstract GetBrokerID(): number;
  abstract GetBrokerName(): string;

  public SetSimulationContext(context: SimulationContext): void {
    this.simulationContext = context;
  }

  public GetEffectiveDate(): Date {
    return this.simulationContext?.simulatedDate ?? new Date();
  }

  protected validate(): void {
    if (!LumosStateHelper.IsDemoMode()) {
      throw new Error('SimulatorClient can only be used in demo mode. Set DEMO_MODE=True in your environment configuration.');
    }
  }

  async ImportAccounts(): Promise<Account[]> {
    this.validate();
    const accounts = await this.GetAccounts();
    for (const account of accounts) {
      await DataAccess.AccountRefresh(this, account);
    }
    return accounts;
  }

  async GetAccounts(): Promise<Account[]> {
    this.validate();
    return SimulateAccounts.GetAccountsForBroker(this.GetBrokerID()).map(acc => 
      new Account(
        acc.brokerAccountId,
        acc.accountName,
        acc.accountName,
        acc.accountName,
        null,
        null,
        null,
        false
      )
    );
  }

  async GetAccountBalance(account: Account): Promise<BrokerAccountBalance> {
    this.validate();
    return await SimulateAccounts.SimulateBalance(this, account);
  }

  async GetOrders(account: Account, fromDateUTC?: Date, filledOrdersOnly?: boolean): Promise<Order[]> {
    this.validate();
    return await SimulateOrders.SimulateOrders(this, account);
  }

  async PreviewOrder(account: Account, order: PlaceOrderDetail): Promise<PreviewOrderResponse | null> {
    this.validate();
    return null;
  }

  async PlaceOrder(account: Account, order: PlaceOrderDetail, preview?: PreviewOrderResponse): Promise<PlaceOrderResponse | null> {
    this.validate();
    return null;
  }

  async CancelOrder(account: Account, order: Order): Promise<boolean> {
    this.validate();
    return false;
  }

  async GetQuotes(symbols: string[], detailedQuote?: boolean): Promise<Quote[]> {
    this.validate();
    return await SimulateQuotes.GetQuotes(this, symbols, detailedQuote);
  }

  async GetTransactions(account: Account, fromDateUTC?: Date): Promise<Transaction[]> {
    this.validate();

    return SimulateTransactions.SimulateTransactions(this, account);
  }

  async GetPositions(account: Account): Promise<Position[]> {
    this.validate();
    return [];
  }
}

// ============================================================
// E*TRADE Simulator Client
// ============================================================

const ETRADE_BROKER_ID = 1;    // same as ETClient

export class SimulatorClientET extends SimulatorClient {
  GetBrokerID(): number {
    this.validate();
    return ETRADE_BROKER_ID;
  }

  GetBrokerName(): string {
    this.validate();
    return "E*TRADE";
  }
}

// ============================================================
// Charles Schwab Simulator Client
// ============================================================

const SCHWAB_BROKER_ID = 2;    // same as SCHClient

export class SimulatorClientSCH extends SimulatorClient {
  GetBrokerID(): number {
    this.validate();
    return SCHWAB_BROKER_ID;
  }

  GetBrokerName(): string {
    this.validate();
    return "Charles Schwab";
  }
}
