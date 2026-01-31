import { Account } from '../../interfaces/Account';
import { Transaction } from '../../interfaces/Transaction';
import { SimulationContext } from '../../processor/Simulator/SimulationContext';
import { DataAccess } from '../../database/DataAccess';

// Forward declaration to avoid circular dependency
interface ISimulatorClient {
  GetBrokerID(): number;
  GetEffectiveDate(): Date;
  simulationContext?: SimulationContext;
}

/**
 * Handles transaction simulation for simulated broker accounts.
 */
// Account configuration for transaction simulation
interface TransferConfig {
  brokerID: number;
  brokerAccountID: number;
  initialDeposit: number;
  recurringTransferAmt?: number;
  recurringTransferDays?: number;
}

// Simulated transfer registry - compact format for easy editing
const SIMULATED_TRANSFERS: TransferConfig[] = [
  { brokerID: 1, brokerAccountID: 1, initialDeposit: 2500 },
  { brokerID: 1, brokerAccountID: 2, initialDeposit: 10000, recurringTransferAmt: -100, recurringTransferDays: 30 },
  { brokerID: 2, brokerAccountID: 1, initialDeposit: 7500, recurringTransferAmt: 250, recurringTransferDays: 15 },
];

export class SimulateTransactions {
  /**
   * Simulate transactions for a specific account.
   * Returns an initial deposit transaction if not already made.
   */
  static async SimulateTransactions(
    simulatorClient: ISimulatorClient,
    account: Account,
  ): Promise<Transaction[]> {
    const currentDate = simulatorClient.GetEffectiveDate();
    const currentDateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Check if we've already created a transaction for this date (ignoring time)
    if (simulatorClient.simulationContext) {
      if (simulatorClient.simulationContext.lastTransactionDate === currentDateStr) {
        return []; // Already created transaction for this date
      }
    }

    const config = this.getTransferConfig(simulatorClient.GetBrokerID(), account);
    if (!config || config.initialDeposit == null) {
      throw new Error(`No initial deposit configured for broker ${simulatorClient.GetBrokerID()}, account ${account.BrokerAccountID ?? account.AccountID}`);
    }

    const lastTransfer = await DataAccess.GetLastTransfer(account, currentDate);
    let transactions: Transaction[] = [];

    if (!lastTransfer) {
      const transaction = new Transaction(
        null,
        currentDate.getTime(),  // unique sequential transaction ID
        currentDate,
        'Initial Deposit',
        'Transfer' as any,
        null,
        null,
        null,
        config.initialDeposit
      );

      transactions = [transaction];
    } else if (config.recurringTransferAmt != null && config.recurringTransferDays != null) {
      const lastDate = lastTransfer.PeriodEnd;
      const diffMs = currentDate.getTime() - lastDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays >= config.recurringTransferDays) {
        const description = config.recurringTransferAmt > 0 ? 'Direct Deposit' : 'Automated withdrawal';
        const transaction = new Transaction(
          null,
          currentDate.getTime(),  // unique sequential transaction ID
          currentDate,
          description,
          'Transfer' as any,
          null,
          null,
          null,
          config.recurringTransferAmt
        );

        transactions = [transaction];
      }
    }

    // Store the date if we created a transaction
    if (transactions.length > 0 && simulatorClient.simulationContext) {
      simulatorClient.simulationContext.lastTransactionDate = currentDateStr;
    }

    return transactions;
  }

  private static getTransferConfig(brokerID: number, account: Account): TransferConfig | null {
    const brokerAccountID = account.BrokerAccountID ?? account.AccountID ?? null;
    if (brokerAccountID == null) {
      return null;
    }
    return SIMULATED_TRANSFERS.find(
      c => c.brokerID === brokerID && c.brokerAccountID === brokerAccountID
    ) ?? null;
  }
}
