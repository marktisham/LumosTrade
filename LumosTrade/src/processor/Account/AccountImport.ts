import { BrokerManager } from '../BrokerManager';
import { Account } from '../../interfaces/Account';
import { AccountHistory } from '../../interfaces/AccountHistory';
import { DataAccess } from '../../database/DataAccess';
import { Transaction, TransactionType } from '../../interfaces/Transaction';
import { DateUtils } from '../../utils/DateUtils';
import { AccountRollup } from './AccountRollup';

export class AccountImport {

  //
  // Account Refesh Logic
  //


  // Imports latest account information from all the brokers. 
  // Does not delete existing accounts. 
  public static async ImportAccounts(): Promise<void> {
    const brokers = BrokerManager.GetBrokerClients();
    for (const broker of brokers) {
      await broker.ImportAccounts();
    }
  }

  //
  // Account Transfer Logic
  //

  public static async AddAccountTransfer(account: Account, tx: Transaction): Promise<void> {
    if(tx==null || tx.Type!=TransactionType.Transfer || tx.Amount==null || tx.TransactionDate==null) {
      throw new Error('Invalid transfer transaction for AccountID='+account.AccountID);
    }

    let { latest, previous} = await DataAccess.GetRecentDailyAccountHistory(account, tx.TransactionDate);
    let balanceToUpsert = this.ConfigureTransferRecord(account, tx, latest, previous);
    if(balanceToUpsert==null) {
      return;
    }

    // Update the transfer record
    await DataAccess.UpsertAccountHistory(account, balanceToUpsert);
    
    // Note: Subsequent records will be recalculated by next AccountRollup processing run.
  }

  // Break out this core logic with no DB dependencies to allow for unit testing.
  public static ConfigureTransferRecord(account: Account,
            transaction: Transaction, 
            latest: AccountHistory | null, 
            previous: AccountHistory | null
    )
            
    : AccountHistory | null {

    if(account==null) {
      throw new Error('Account is null');
    }
    if(transaction==null || transaction.Type!=TransactionType.Transfer || transaction.Amount==null || transaction.TransactionDate==null) {
      throw new Error('Invalid transfer transaction for AccountID='+account.AccountID);
    }
    if(transaction.Amount==0) {
      console.log('Transfer amount is zero for AccountID='+account.AccountID+', no balance record will be created/updated.');
      return null;
    }

    // Apply this transfer amount
    let { upsertRecord, compareRecord } = this.getUseableRecords(latest, previous, transaction.TransactionDate, account);

    // Add transaction ID to the description for de-duping prevention.
    let newDescription = transaction.Description ?? '';
    if(transaction.BrokerTransactionID!=null) {
      newDescription += ` [TxID:${transaction.BrokerTransactionID},Amt:${transaction.Amount}]`;
    }
    if(upsertRecord.TransferDescription!=null) {
      if(upsertRecord.TransferDescription.includes(newDescription)) {
          console.log(`Transfer transaction already applied to balance record for AccountID=${account.AccountID}, TxID=${transaction.BrokerTransactionID}, Date=${transaction.TransactionDate.toISOString().substring(0,10)}. Skipping.`);
        return null;
      }
    }
    
    upsertRecord.AddTransferAmount(compareRecord, transaction.Amount, newDescription);
    return upsertRecord;
  }

  // Get or create the appropriate AccountHistory records for the specified date.
  // Returns the record to upsert and the record to compare against (if any).
  private static getUseableRecords(
    latest: AccountHistory | null, 
    previous: AccountHistory | null, 
    forDate: Date | null, 
    account: Account
  ): { upsertRecord: AccountHistory, compareRecord: AccountHistory | null } {

    if(latest!=null) {
      // Check to see if the latest record is the date we want to use
      if(forDate!=null) {
        if(DateUtils.IsSameDay(latest.PeriodEnd, forDate)) {   
          return { upsertRecord: latest, compareRecord: previous };
        } 
      } else {
        if(latest.IsToday()) {
          return { upsertRecord: latest, compareRecord: previous };
        }
      }
    }
    let newRecord: AccountHistory = AccountHistory.CreateFromPrevious(account, latest, forDate);
    return { upsertRecord: newRecord, compareRecord: latest };
  }

}
