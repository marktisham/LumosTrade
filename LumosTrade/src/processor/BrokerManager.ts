
import { BrokerClient } from '../interfaces/BrokerClient';
import { ETClient } from '../Brokers/ETrade/ETClient';
import { SCHClient } from '../Brokers/Schwab/SCHClient';
import { SimulatorClientET, SimulatorClientSCH } from '../Brokers/Simulator/SimulatorClient';
import { DataAccess } from '../database/DataAccess';
import { Account } from '../interfaces/Account';
import { LumosStateHelper } from '../utils/LumosStateHelper';

export class BrokerManager {
  // Cached mapping of AccountID => BrokerClient
  private static accountBrokerMap: Map<number, BrokerClient> | null = null;

  public static GetBrokerClients(): BrokerClient[] {

    // Broker clients are instantiated here to keep a small, static registry.

    if (LumosStateHelper.IsDemoMode()) {
      const etrade = new SimulatorClientET();
      const schwab = new SimulatorClientSCH();
      return [etrade, schwab];
    }

    const etrade = new ETClient();
    const schwab = new SCHClient(); 
    return [etrade, schwab];
  }

  /**
   * Map an AccountID to the appropriate BrokerClient instance.
   * Builds a static cache on first call by querying the Accounts table and
   * matching each account's BrokerID to a BrokerClient via GetBrokerClients().
   */
  public static async MapAccountToBroker(accountId: number): Promise<BrokerClient | null> {
    if (accountId == null) throw new Error('accountId is required');

    if (!this.accountBrokerMap || this.accountBrokerMap.size === 0) {
      this.accountBrokerMap = new Map<number, BrokerClient>();

      // Fetch all accounts and build mapping
      const accounts: Account[] = await DataAccess.GetAccounts();
      const clients = this.GetBrokerClients();

      for (const acct of accounts) {
        const acctId = acct.AccountID ?? null;
        if (acctId == null) continue;
        const brokerId = (acct as any).BrokerID ?? null;
        if (brokerId == null) continue;
        const client = clients.find(c => c.GetBrokerID() === brokerId) ?? null;
        if (client) {
          this.accountBrokerMap.set(acctId, client);
        }
      }
    }

    return this.accountBrokerMap.get(accountId) ?? null;
  }
}
