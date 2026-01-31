import { BrokerClient } from '../../interfaces/BrokerClient';
import { Account } from '../../interfaces/Account';
import { OrderImport } from '../Order/OrderImport';
import { TransactionImport } from '../Order/TransactionImport';
import { TradeImport } from '../Trade/TradeImport';
import { QuoteImport } from '../Order/QuoteImport';
import { RepairConductor } from '../repair/RepairConductor';
import { TradeRollup } from '../Trade/TradeRollup';
import { AccountRollup } from './AccountRollup';
import { AccountRollupBackfill } from './AccountRollupBackfill';
import { SimulationContext } from '../Simulator/SimulationContext';

export class AccountRefresh {
	/**
	 * Process account data for the given account. Imports orders, transactions, trades, and quotes,
	 * then performs repairs and rollup calculations.
	 */
	public static async ProcessAccount(broker: BrokerClient, account: Account, fastMode: boolean, simContext?: SimulationContext): Promise<void> {
		console.log(`Refreshing account ${account.Name} (${account.AccountID}). Fast mode: ${fastMode}`);
		const firstImport = await OrderImport.Import(broker, account);
		let earliestTransactionDate: Date | null = null;
		if(!fastMode) {
			earliestTransactionDate = await TransactionImport.Import(broker, account);
		}
		await TradeImport.Import(broker, account);
		await QuoteImport.Import(broker, account);

		if(!fastMode) {
			if(await RepairConductor.Repair(broker, account)) {
				console.log(`Repairs made for account ${account.Name} (${account.AccountID}), re-importing trades.`);
				await TradeImport.Import(broker, account);
			}
		}

		await TradeRollup.Process(account, simContext);
		await AccountRollup.Process(broker, account, simContext);
		
		const backfillFromDate = firstImport ? null : earliestTransactionDate;
		if((backfillFromDate !== null || firstImport) && !simContext) {
			if(firstImport) {
				console.log(`First-time import detected for account ${account.Name} (${account.AccountID}), backfilling all historical rollups.`);
			} else if(backfillFromDate) {
				console.log(`Transaction processing detected for account ${account.Name} (${account.AccountID}), backfilling rollups from ${backfillFromDate.toISOString().substring(0, 10)}.`);
			}
			await AccountRollupBackfill.BackfillRollups(account, backfillFromDate);
		}

		console.log(`Completed trade refresh for account ${account.Name} (${account.AccountID}). fastMode=${fastMode}`);
	}
}
