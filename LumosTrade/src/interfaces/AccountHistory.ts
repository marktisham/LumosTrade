
import { Account } from './Account';
import { DateUtils } from '../utils/DateUtils';
import { RollupPeriod } from '../utils/RollupUtils';

// For fetching balances from the broker
export class BrokerAccountBalance {
  totalAccountValue: number | null;
  account: Account;

  constructor(account: Account, totalAccountValue: number | null = null) {
    this.account = account;
    this.totalAccountValue = totalAccountValue;
  }
}

// (Maps the DB table)
export class AccountHistory {
  AccountHistoryID: number | null;
  AccountID: number | null;
  RollupPeriod: RollupPeriod;
  PeriodEnd: Date;
  Balance: number | null;
  BalanceUpdateTime: Date | null;
  BalanceChangeAmount: number | null;
  BalanceChangePct: number | null;
  TransferAmount: number | null;
  TransferDescription: string | null;
  InvestedAmount: number | null;
  NetGain: number | null;
  NetGainPct: number | null;
  Comment: string | null;
  OrdersExecuted: number | null;

  constructor(
    AccountID: number | null,
    rollupPeriod: RollupPeriod,
    PeriodEnd: Date,
    Balance: number | null,
    TransferAmount: number | null,
    TransferDescription: string | null
  ) {
    this.AccountHistoryID = null;
    this.AccountID = AccountID;
    this.RollupPeriod = rollupPeriod;
    this.PeriodEnd = PeriodEnd;
    this.Balance = Balance;
    this.TransferAmount = TransferAmount;
    this.TransferDescription = TransferDescription;
    this.OrdersExecuted = null;
    this.BalanceUpdateTime = null;
    this.BalanceChangeAmount = null;
    this.BalanceChangePct = null;
    this.InvestedAmount = null;
    this.NetGain = null;
    this.NetGainPct = null;
    this.Comment = null;
  }

  public static CreateFromPrevious(account: Account, previous: AccountHistory | null, forDate: Date | null): AccountHistory {

    const dateToUse : Date | null = DateUtils.GetDateOnly(forDate ?? new Date());
    if(dateToUse==null) {
      throw new Error('Invalid date provided for CreateFromPrevious');
    }

    let newHistory = new AccountHistory(
      account.AccountID!,
      RollupPeriod.Daily, // Default to Daily for now
      dateToUse,
      previous?.Balance ?? null,
      null,
      null
    );

    if(previous!=null) {
      newHistory.RollupPeriod = previous.RollupPeriod; // Inherit rollup period
      newHistory.BalanceUpdateTime = previous.BalanceUpdateTime;
      newHistory.BalanceChangeAmount = previous.BalanceChangeAmount;
      newHistory.BalanceChangePct = previous.BalanceChangePct;
      newHistory.InvestedAmount = previous.InvestedAmount;
      newHistory.NetGain = previous.NetGain;
      newHistory.NetGainPct = previous.NetGainPct;
    }

    return newHistory;
  }

  /**
   * Add a transfer amount and description to this record.
   * This only updates transfer-related fields. All other calculations (balance change, 
   * invested amount, net gain) are handled by AccountRollupCalculator.
   */
  public AddTransferAmount(previousHistory : AccountHistory | null, transferAmt: number | null, transferDesc: string | null): void {
    if(transferAmt==null) {
      return;
    }

    // Transfers are cumulative for a specific day so add in as needed.
    if(this.TransferAmount==null) {
      this.TransferAmount = transferAmt;
    } else {
      this.TransferAmount += transferAmt;
    }

    if(transferDesc!=null) {  
        if(this.TransferDescription==null || this.TransferDescription.trim()=='') {
          this.TransferDescription = transferDesc;
        } else {
          this.TransferDescription += ". " + transferDesc;   
        }
    }
  }

  /**
   * Returns true if `PeriodEnd` represents the current day (UTC), otherwise false.
   */
  public IsToday(): boolean {
    return DateUtils.IsSameDay(this.PeriodEnd, new Date());
  }
}
