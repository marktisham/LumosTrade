import { Account } from '../../interfaces/Account';
import { DataAccess } from '../../database/DataAccess';
import { SimulationContext } from './SimulationContext';
import { SimulatorClient, SimulatorClientET, SimulatorClientSCH } from '../../Brokers/Simulator/SimulatorClient';
import { AccountRefresh } from '../Account/AccountRefresh';
import { loadModuleConfig } from '../../utils/moduleConfig';

export class SimulationOrchestrator {
	/**
	 * Simulates historical account data from the last simulated date to the present.
	 * Loops through each trading day and processes all brokers and accounts serially
	 * to preserve simulated quote values across accounts. (otherwise different quotes may 
	 * see massively different prices for the same symbols on the same days)
	 */
	public static async SimulateHistoricalData(account: Account): Promise<void> {
		const accountId = account.AccountID;
		if (!accountId) {
			throw new Error('Account.AccountID is required for simulation processing');
		}

		console.log(`Starting simulated data import for account ${account.Name} (${accountId})...`);

		const broker = this.CreateSimulatorClientForAccount(account);

		const startDate = await this.DetermineStartDateForAccount(account);
		const endDate = new Date();
		console.log(`Simulating from ${startDate.toISOString().substring(0, 10)} to ${endDate.toISOString().substring(0, 10)} for account ${account.Name}`);
		const tradingDays = this.GenerateTradingDays(startDate, endDate);

		const simContext = new SimulationContext(startDate);
		broker.SetSimulationContext(simContext);

		for (const tradingDay of tradingDays) {
			simContext.simulatedDate = tradingDay;
			console.log("\n************************************************************************");
			console.log(`Simulating account refresh. Account: ${account.Name}: trading day: ${tradingDay.toISOString().substring(0, 10)}`);
			// Always passing fastMode=false to allow full imports in parallel since they are fast for simulator.
			await AccountRefresh.ProcessAccount(broker, account, false, simContext);
		}

		console.log(`*** Simulated account refresh complete for account ${account.Name} (${accountId})`);
	}

	private static CreateSimulatorClientForAccount(account: Account): SimulatorClient {
		const brokerId = (account as any).BrokerID as number | undefined;
		if (brokerId == null) {
			throw new Error('Account.BrokerID is required to select a simulator client');
		}

		switch (brokerId) {
			case 1:
				return new SimulatorClientET();
			case 2:
				return new SimulatorClientSCH();
			default:
				throw new Error(`Unsupported BrokerID for simulation: ${brokerId}`);
		}
	}

	/**
	 * Determines the starting date for simulation based on the most recent data in the database.
	 * Falls back based on MAX_IMPORT_DAYS environment variable or January 1 of the previous year if not configured.
	 */
	private static async DetermineStartDateForAccount(account: Account): Promise<Date> {
		const accountId = account.AccountID;
		if (accountId == null) {
			throw new Error('Account.AccountID is required for simulation');
		}

		const dataAccess = new DataAccess();
		
		const maxOrderDate = await dataAccess.GetMaxOrderExecutedTime(accountId);
		const maxBalanceDate = await DataAccess.GetMaxAccountHistoryDate(accountId);

		let startDate: Date;
		if (!maxOrderDate && !maxBalanceDate) {
			const maxImportDays = process.env.MAX_IMPORT_DAYS ? parseInt(process.env.MAX_IMPORT_DAYS, 10) : Number(loadModuleConfig().get('LumosTrade.simulatorMaxImportDays'));
			if (!maxImportDays || maxImportDays <= 0) {
				throw new Error(`maxImportDays must be a positive number. Got: ${maxImportDays}`);
			}
			const maxImportMs = maxImportDays * 24 * 60 * 60 * 1000;
			startDate = new Date(Date.now() - maxImportMs);
			startDate.setHours(0, 0, 0, 0);
		} else {
			const dates = [maxOrderDate, maxBalanceDate].filter(d => d !== null) as Date[];
			startDate = new Date(Math.max(...dates.map(d => d.getTime())));
			startDate.setDate(startDate.getDate() + 1);
			startDate.setHours(0, 0, 0, 0);
		}

		return startDate;
	}

	/**
	 * Generates an array of trading days (Monday-Friday) between start and end dates.
	 */
	public static GenerateTradingDays(startDate: Date, endDate: Date): Date[] {
		const tradingDays: Date[] = [];
		const current = new Date(startDate);
		current.setHours(0, 0, 0, 0);

		while (current <= endDate) {
			const dayOfWeek = current.getDay();
			if (dayOfWeek >= 1 && dayOfWeek <= 5) {
				tradingDays.push(new Date(current));
			}
			current.setDate(current.getDate() + 1);
		}

		return tradingDays;
	}

	/**
	 * Generates a random price change based on win/loss probability and magnitude ranges.
	 * @param initialValue The starting value
	 * @param maxLossPercent The maximum loss percentage (positive number, e.g., 2 for 2%)
	 * @param maxGainPercent The maximum gain percentage (positive number, e.g., 1.5 for 1.5%)
	 * @param winChancePercent The probability of a winning trade (0-100)
	 * @returns The new value after applying the random change
	 */
	public static GenerateRandomPrice(
		initialValue: number,
		maxLossPercent: number,
		maxGainPercent: number,
		winChancePercent: number
	): number {
		const isWin = Math.random() * 100 < winChancePercent;
		
		let changePercent: number;
		if (isWin) {
			changePercent = Math.random() * maxGainPercent;
		} else {
			changePercent = -Math.random() * maxLossPercent;
		}
		
		const changeAmount = initialValue * (changePercent / 100);
		return initialValue + changeAmount;
	}
}
