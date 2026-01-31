export class ConsoleLogger {
	private logs: string[] = [];
	private capturing: boolean = false;
	private originalConsoleLog: typeof console.log;
	private originalConsoleWarn: typeof console.warn;
	private originalConsoleError: typeof console.error;

	constructor() {
		this.originalConsoleLog = console.log;
		this.originalConsoleWarn = console.warn;
		this.originalConsoleError = console.error;
	}

	public StartCapture(): void {
		if (this.capturing) {
			return;
		}

		this.capturing = true;
		this.logs = [];

		console.log = (...args: any[]) => {
			const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
			this.logs.push(`[LOG] ${message}`);
			this.originalConsoleLog.apply(console, args);
		};

		console.warn = (...args: any[]) => {
			const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
			this.logs.push(`[WARN] ${message}`);
			this.originalConsoleWarn.apply(console, args);
		};

		console.error = (...args: any[]) => {
			const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
			this.logs.push(`[ERROR] ${message}`);
			this.originalConsoleError.apply(console, args);
		};
	}

	public StopCapture(): void {
		if (!this.capturing) {
			return;
		}

		console.log = this.originalConsoleLog;
		console.warn = this.originalConsoleWarn;
		console.error = this.originalConsoleError;
		this.capturing = false;
	}

	public GetLogs(): string[] {
		return [...this.logs];
	}

	public GetLogsAsText(): string {
		return this.logs.join('\n');
	}

	public Clear(): void {
		this.logs = [];
	}
}
