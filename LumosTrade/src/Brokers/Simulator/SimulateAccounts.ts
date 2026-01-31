import { Account } from '../../interfaces/Account';
import { BrokerAccountBalance } from '../../interfaces/AccountHistory';
import { SimulationContext } from '../../processor/Simulator/SimulationContext';
import { SimulationOrchestrator } from '../../processor/Simulator/SimulationOrchestrator';
import { DataAccess } from '../../database/DataAccess';

// Forward declaration to avoid circular dependency
interface ISimulatorClient {
  GetBrokerID(): number;
  GetEffectiveDate(): Date;
  simulationContext?: SimulationContext;
}

// Account configuration for simulator
interface AccountConfig {
  brokerId: number;
  brokerAccountId: number;
  accountName: string;
  initialBalance: number;
  dayHasGainChancePercent: number;
  maxDailyLossPercent: number;
  maxDailyGainPercent: number;
}

// Simulated account registry - compact format for easy editing
const SIMULATOR_ACCOUNTS: AccountConfig[] = [
  { brokerId: 1, brokerAccountId: 1, accountName: 'Trading Account', initialBalance: 2500, dayHasGainChancePercent: 45, maxDailyLossPercent: 1.2, maxDailyGainPercent: 1.8 },
  { brokerId: 1, brokerAccountId: 2, accountName: 'Investments', initialBalance: 10000, dayHasGainChancePercent: 50, maxDailyLossPercent: 0.9, maxDailyGainPercent: 1.1 },
  { brokerId: 2, brokerAccountId: 1, accountName: 'Work IRA', initialBalance: 7500, dayHasGainChancePercent: 55, maxDailyLossPercent: 0.5, maxDailyGainPercent: 0.7 },
];

/**
 * Configuration for a simulated broker account.
 * Contains all properties needed to generate realistic simulation responses.
 */
export class SimulateAccounts {
  constructor(
    public readonly brokerId: number,
    public readonly brokerAccountId: number,
    public readonly accountName: string,
    public readonly initialBalance: number,
    public readonly dayHasGainChancePercent: number,
    public readonly maxDailyLossPercent: number,
    public readonly maxDailyGainPercent: number
  ) {}

  /**
   * Create an Account interface object from this configuration.
   * Uses sensible defaults for description and accountType.
   */
  toAccount(): Account {
    return new Account(
      this.brokerAccountId,
      this.accountName, // BrokerAccountKey
      this.accountName, // Description (defaulted)
      this.accountName, // Name
      null,
      null,
      null,
      false
    );
  }

  /**
   * Lookup a simulator account configuration by broker ID and broker account ID.
   * Returns null if no matching configuration exists.
   */
  static Lookup(brokerId: number, brokerAccountId: number): AccountConfig | null {
    return SIMULATOR_ACCOUNTS.find(
      c => c.brokerId === brokerId && c.brokerAccountId === brokerAccountId
    ) ?? null;
  }

  /**
   * Get all simulator accounts for a specific broker.
   */
  static GetAccountsForBroker(brokerId: number): AccountConfig[] {
    return SIMULATOR_ACCOUNTS.filter(acc => acc.brokerId === brokerId);
  }

  /**
   * Simulate a balance for a specific account using random price generation.
   * Updates the simulation context with the new balance.
   */
  static async SimulateBalance(
    simulatorClient: ISimulatorClient,
    account: Account
  ): Promise<BrokerAccountBalance> {

    const config = SimulateAccounts.Lookup(simulatorClient.GetBrokerID(), account.BrokerAccountID!);
    if (!config) {
      throw new Error(`No simulator configuration found for broker ${simulatorClient.GetBrokerID()}, account ${account.BrokerAccountID}`);
    }

    // Get the latest balance from the DB (if found) and adjust it. Else use initial balance from config.
    let startBalance: number;
    const latestHistory = await DataAccess.GetLatestAccountHistory(account.AccountID!);
    if (latestHistory && latestHistory.Balance != null) {
      startBalance = latestHistory.Balance;
    } else {
      startBalance = config.initialBalance;
    }

    const balance = SimulationOrchestrator.GenerateRandomPrice(
      startBalance,
      config.maxDailyLossPercent,
      config.maxDailyGainPercent,
      config.dayHasGainChancePercent
    );

    return new BrokerAccountBalance(account, balance);
  }

}
