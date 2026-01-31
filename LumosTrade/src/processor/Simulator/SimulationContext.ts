export class SimulationContext {
	private _simulatedDate: Date;
	private _initialDepositMade: boolean = false;
	private _lastTransactionDate?: string;

	constructor(simulatedDate: Date) {
		this._simulatedDate = simulatedDate;
	}

	public get simulatedDate(): Date {
		return this._simulatedDate;
	}

	public set simulatedDate(value: Date) {
		this._simulatedDate = value;
	}

	public get initialDepositMade(): boolean {
		return this._initialDepositMade;
	}

	public set initialDepositMade(value: boolean) {
		this._initialDepositMade = value;
	}

	public get lastTransactionDate(): string | undefined {
		return this._lastTransactionDate;
	}

	public set lastTransactionDate(value: string | undefined) {
		this._lastTransactionDate = value;
	}
}
