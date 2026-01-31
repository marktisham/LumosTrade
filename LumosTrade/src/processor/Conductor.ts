
import { DataAccess } from '../database/DataAccess';
import { BrokerManager } from './BrokerManager';
import { BrokerClient } from '../interfaces/BrokerClient';
import { Account } from '../interfaces/Account';
import { QuoteImport } from './Order/QuoteImport';
import { AccountRollup } from './Account/AccountRollup';
import { AccountRefresh } from './Account/AccountRefresh';
import { AccountImport } from './Account/AccountImport';
import { SimulationOrchestrator } from './Simulator/SimulationOrchestrator';
import { LumosStateHelper } from '../utils/LumosStateHelper';
import { ErrorHelper } from '../utils/ErrorHelper';

export enum AccountOperationType {
	ResyncBrokers = 'ResyncBrokers',
	RefreshQuotes = 'RefreshQuotes',
	RefreshAccountBalances = 'RefreshAccountBalances'
}

export class ConductorError {
	private failures: Array<{ account: Account; error: Error }> = [];

	constructor(failures: Array<{ account: Account; error: Error }>) {
		this.failures = failures;
	}

	public HasErrors(): boolean {
		return this.failures.length > 0;
	}

	public FormatFailures(): string | null {
		if (this.failures.length === 0) {
			return null;
		}

		const lines = [`${this.failures.length} account(s) failed during processing:`];
		for (const { account, error } of this.failures) {
			const accountInfo = `${account.Name || 'Unknown'} (ID: ${account.AccountID || 'N/A'})`;
			const errorMsg = error.message || String(error);
			lines.push(`  - ${accountInfo}: ${errorMsg}`);
		}
		return lines.join('\n');
	}
}

export class Conductor {
	// Execute an operation across all broker accounts
	// operationType: the type of operation to perform on each account
	// fastMode: when true, prioritizes a fast refresh/parallel processing. May not process less-critical operations.
	// Best for UI operations. When false, more comprehensive. Best for nightly cron jobs.
	// retryCount: number of times to retry failed accounts. If 0, no retries are performed. Succeeded accounts will not be retried.
	// Returns a ConductorError containing any failures that occurred during processing.
	private static async ExecuteOperation(
		operationType: AccountOperationType,
		fastMode: boolean,
		retryCount: number
	): Promise<ConductorError> {
		const start = Date.now();
		const timestamp = new Date(start).toISOString();
		console.log(`[${timestamp}] Executing ${operationType}... fastMode=${fastMode}, retryCount=${retryCount}`);

		const brokers = BrokerManager.GetBrokerClients();

		// Fetch accounts for all brokers up-front so we can report a global total and track completions
		const allAccountsPerBroker = await Promise.all(brokers.map(b => DataAccess.GetAccounts(b)));
		let currentAccountsPerBroker = allAccountsPerBroker; // may be filtered down for retries
		let totalGlobal = allAccountsPerBroker.reduce((acc, arr) => acc + (arr?.length ?? 0), 0);

		let failures: Array<{ account: Account; error: Error }> = [];
		let attempt = 0;
		const maxAttempts = retryCount + 1;

		while (attempt < maxAttempts) {
			attempt++;
			let completed = 0;

			failures = fastMode
				? await this.ExecuteOperationInParallel(operationType, brokers, currentAccountsPerBroker, totalGlobal, { value: completed }, fastMode)
				: await this.ExecuteOperationSerially(operationType, brokers, currentAccountsPerBroker, totalGlobal, { value: completed }, fastMode);

			// If no failures or this was the last attempt, we're done
			if (failures.length === 0 || attempt >= maxAttempts) {
				break;
			}

			// Log failures and prepare to retry. If we are going to retry, filter out accounts that succeeded
			const failureMessage = new ConductorError(failures).FormatFailures();
			if (failureMessage) {
				console.warn(`**** Attempt ${attempt} failed with errors: ****`);
				console.warn(failureMessage);
				// If there are more attempts left, reduce the list to only failed accounts
				if (attempt < maxAttempts) {
					const failedIds = new Set(failures.map(f => f.account.AccountID));
					const prevTotal = totalGlobal;
					currentAccountsPerBroker = currentAccountsPerBroker.map(arr => (arr || []).filter(a => failedIds.has(a.AccountID)));
					totalGlobal = currentAccountsPerBroker.reduce((acc, arr) => acc + (arr?.length ?? 0), 0);
					console.log(`**** Retrying only failed accounts: ${totalGlobal} remaining (removed ${prevTotal - totalGlobal} succeeded) — attempt ${attempt + 1} of ${maxAttempts}. ****`);
				}

				if (!fastMode) {
					console.log(`**** Sleeping 10 seconds before retry attempt ${attempt + 1} of ${maxAttempts}... ****`);
					await new Promise(resolve => setTimeout(resolve, 10000));
				} else {
					console.log(`**** Sleeping 2 seconds before retry attempt ${attempt + 1} of ${maxAttempts}... ****`);
					await new Promise(resolve => setTimeout(resolve, 2000));
					console.log(`**** Retrying attempt ${attempt + 1} of ${maxAttempts} immediately... ****`);
				}
			}
		}

		const elapsed = ((Date.now() - start) / 1000).toFixed(2);
		const conductorError = new ConductorError(failures);
		if (!conductorError.HasErrors()) {
			console.log(`**** ${operationType} completed successfully. Elapsed: ${elapsed}s ****`);
		} else {
			console.log(`**** ${operationType} completed with ${failures.length} failure(s). Elapsed: ${elapsed}s ****`);
			
			const errorMessage = `Conductor ${operationType}: ${conductorError.FormatFailures() || 'Unknown errors occurred'}`;
			const context = `operation=${operationType}, fastMode=${fastMode}, failureCount=${failures.length}`;
			const formattedError = ErrorHelper.formatForCloud(errorMessage, context);
			console.error(formattedError);
		}

		// Demo mode: Add brief delay to show UI progress spinner and simulate broker activity
		if (LumosStateHelper.IsDemoMode()) {
			await new Promise(resolve => setTimeout(resolve, 300));
		}

		return conductorError;
	}

	// Helper: process all accounts across all brokers in parallel. Uses a mutable ref for completed count.
	private static async ExecuteOperationInParallel(
		operationType: AccountOperationType,
		brokers: BrokerClient[],
		allAccountsPerBroker: (Account[] | undefined)[],
		totalGlobal: number,
		completedRef: { value: number },
		fastMode: boolean
	): Promise<Array<{ account: Account; error: Error }>> {
		const failures: Array<{ account: Account; error: Error }> = [];
		const allTasks: Promise<void>[] = [];
		brokers.forEach((broker, bIdx) => {
			const accounts = allAccountsPerBroker[bIdx] || [];
			accounts.forEach((account) => {
				allTasks.push((async () => {
					console.log(`${operationType} (parallel): Processing account: (${account.Name ?? ''}) (${account.AccountID})`);
					const error = await this.ExecuteAccountOperation(operationType, broker, account, fastMode);
					if (error) {
						failures.push({ account, error });
					}
					const done = ++completedRef.value;
					console.log(`${operationType} (parallel): Completed ${done} of ${totalGlobal}: (${account.Name ?? ''}) (${account.AccountID})`);
				})());
			});
		});
		await Promise.all(allTasks);
		return failures;
	}

	// Helper: process each broker's accounts serially (throttled). Uses a mutable ref for completed count.
	private static async ExecuteOperationSerially(
		operationType: AccountOperationType,
		brokers: BrokerClient[],
		allAccountsPerBroker: (Account[] | undefined)[],
		totalGlobal: number,
		completedRef: { value: number },
		fastMode: boolean
	): Promise<Array<{ account: Account; error: Error }>> {
		const failures: Array<{ account: Account; error: Error }> = [];
		const brokerTasks = brokers.map(async (broker, bIdx) => {
			const accounts = allAccountsPerBroker[bIdx] || [];
			console.log(`${operationType} (serial): Broker (${broker?.GetBrokerName() ?? ''}) - ${accounts.length} accounts`);
			for (let idx = 0; idx < accounts.length; idx++) {
				const account = accounts[idx];
				console.log(`${operationType} (serial): Processing account: (${account.Name ?? ''}) (${account.AccountID})`);
				const error = await this.ExecuteAccountOperation(operationType, broker, account, fastMode);
				if (error) {
					failures.push({ account, error });
				}
				const done = ++completedRef.value;
				console.log(`${operationType} (serial): Completed ${done} of ${totalGlobal}: (${account.Name ?? ''}) (${account.AccountID})`);
			}
		});
		await Promise.all(brokerTasks);
		return failures;
	}

	// Execute the appropriate operation for a single account based on the operation type
	// Returns an Error if the operation fails, or null if successful.
	private static async ExecuteAccountOperation(
		operationType: AccountOperationType,
		broker: BrokerClient,
		account: Account,
		fastMode: boolean
	): Promise<Error | null> {
		try {
			switch (operationType) {
				case AccountOperationType.ResyncBrokers:
					if (LumosStateHelper.IsDemoMode()) {
						await SimulationOrchestrator.SimulateHistoricalData(account);
					} else {
						await AccountRefresh.ProcessAccount(broker, account, fastMode);
					}
					break;
				case AccountOperationType.RefreshQuotes:
					await QuoteImport.Import(broker, account);
					break;
				case AccountOperationType.RefreshAccountBalances:
					await AccountRollup.Process(broker, account);
					break;
				default:
					throw new Error(`Unknown operation type: ${operationType}`);
			}
			return null;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.warn(`Error executing ${operationType} for account ${account.Name} (${account.AccountID}):`, errorMessage);
			return error instanceof Error ? error : new Error(errorMessage);
		}
	}

	// Single entry point to refresh all trades, balances, quotes, etc. from the brokers
	// to make sure we have the latest state. This function is designed to be re-runnable
	// and optimized for efficient re-calls.
	// fastMode: when true, prioritizes a fast, surface-level refresh by processing all brokers/accounts in parallel. Best for UI operations.
	//           when false, a more comprehensive, and slower paced refresh is done in serial to minimize rate limit risk. Best for nightly cron jobs.
	// retryCount: number of times to retry failed accounts. If 0, no retries are performed. Succeeded accounts will not be retried.
	// Returns a ConductorError containing any failures that occurred during processing.
	public static async RefreshTheWorld(fastMode: boolean = true, retryCount: number = 2): Promise<ConductorError> {
		// Always fast mode for demo mode. Where we're going we don't need roads...
		if (LumosStateHelper.IsDemoMode()) {
			console.log('Demo mode detected, forcing fastMode=true for RefreshTheWorld.');
			fastMode = true;
			await AccountImport.ImportAccounts();
		}

		if (!fastMode) {
			console.log('Importing latest account information from brokers...');
			await AccountImport.ImportAccounts();
		}
		return this.ExecuteOperation(AccountOperationType.ResyncBrokers, fastMode, retryCount);
	}

	// Refresh account balances for all brokers/accounts in parallel
	// retryCount: number of times to retry failed accounts (0 = no retries). (succeeded accounts will not retry)
	// Returns a ConductorError containing any failures that occurred during processing.
	public static async RefreshAccountBalances(retryCount: number = 2): Promise<ConductorError> {
		return this.ExecuteOperation(AccountOperationType.RefreshAccountBalances, true, retryCount);
	}

	// Refresh quotes for all brokers/accounts in parallel
	// retryCount: number of times to retry failed accounts (0 = no retries). (succeeded accounts will not retry)
	// Returns a ConductorError containing any failures that occurred during processing.
	public static async RefreshAllQuotes(retryCount: number = 2): Promise<ConductorError> {
		return this.ExecuteOperation(AccountOperationType.RefreshQuotes, true, retryCount);
	}
}

export default Conductor;