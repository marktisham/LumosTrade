import { AccountImport } from '../processor/Account/AccountImport';
import { Account } from '../interfaces/Account';
import { AccountHistory } from '../interfaces/AccountHistory';
import { RollupPeriod } from '../utils/RollupUtils';
import { Transaction, TransactionType } from '../interfaces/Transaction';
import { DateUtils } from '../utils/DateUtils';

const MOCK_ACCOUNT_ID = 42;
const mockAccount = () => ({ AccountID: MOCK_ACCOUNT_ID } as any);

describe('AccountTransfer.ConfigureTransferRecord', () => {

  it('should add transfer amount to new balance record', () => {
    const account = mockAccount();
    const txDate = new Date('2023-01-15');
    const transaction: Transaction = {
      TransactionID: 1,
      Type: TransactionType.Transfer,
      Amount: 5000,
      Description: 'Initial deposit',
      TransactionDate: txDate,
    } as any;
    const cascadeRecords: AccountHistory[] = [];
    const latest = null;
    const previous = null;

    const result = AccountImport.ConfigureTransferRecord(
      account,
      transaction,
      latest,
      previous
    );

    expect(result).not.toBeNull();
    expect(result?.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(result?.TransferAmount).toBe(5000);
    expect(result?.TransferDescription).toContain('Initial deposit');
    expect(DateUtils.IsSameDay(result?.PeriodEnd, txDate)).toBe(true);
  });

  it('should not allow the same transfer twice on the same record. No BrokerTransactionID (rerunnable)', () => {
    const account = mockAccount();
    const txDate = new Date('2023-01-15');
    const transaction: Transaction = {
      TransactionID: 1,
      Type: TransactionType.Transfer,
      Amount: 5000,
      Description: 'Initial deposit',
      TransactionDate: txDate,
    } as any;
    const cascadeRecords: AccountHistory[] = [];
    const latest = null;
    const previous = null;

    const result1 = AccountImport.ConfigureTransferRecord(
      account,
      transaction,
      latest,
      previous
    );
    expect(result1?.TransferAmount).toBe(5000);
    expect(result1?.TransferDescription).toBe('Initial deposit');

    const result2 = AccountImport.ConfigureTransferRecord(
      account,
      transaction,
      result1,
      previous
    );
    expect(result1?.TransferAmount).toBe(5000);
    expect(result1?.TransferDescription).toBe('Initial deposit');
    expect(result2).toBeNull();

  });

  it('should not allow the same transfer twice on the same record. With BrokerTransactionID (rerunnable)', () => {
    const account = mockAccount();
    const txDate = new Date('2023-01-15');
    const transaction: Transaction = {
      BrokerTransactionID: 1,
      Type: TransactionType.Transfer,
      Amount: 5000,
      Description: 'Initial deposit',
      TransactionDate: txDate,
    } as any;
    const cascadeRecords: AccountHistory[] = [];
    const latest = null;
    const previous = null;

    const result1 = AccountImport.ConfigureTransferRecord(
      account,
      transaction,
      latest,
      previous
    );
    expect(result1?.TransferAmount).toBe(5000);
    expect(result1?.TransferDescription).toBe('Initial deposit [TxID:1,Amt:5000]');

    const result2 = AccountImport.ConfigureTransferRecord(
      account,
      transaction,
      result1,
      previous
    );
    expect(result1?.TransferAmount).toBe(5000);
    expect(result1?.TransferDescription).toBe('Initial deposit [TxID:1,Amt:5000]');
    expect(result2).toBeNull();

  });

   it('should allow the same transfer twice on the same record if different broker transaction ids (rerunnable)', () => {
    const account = mockAccount();
    const txDate = new Date('2023-01-15');
    let transaction: Transaction = {
      BrokerTransactionID: 1,
      Type: TransactionType.Transfer,
      Amount: 5000,
      Description: 'Initial deposit',
      TransactionDate: txDate,
    } as any;
    const cascadeRecords: AccountHistory[] = [];
    const latest = null;
    const previous = null;

    const result1 = AccountImport.ConfigureTransferRecord(
      account,
      transaction,
      latest,
      previous
    );
    expect(result1?.TransferAmount).toBe(5000);
    expect(result1?.TransferDescription).toBe('Initial deposit [TxID:1,Amt:5000]');
    expect(result1?.TransferDescription).not.toContain('TxID:2');

    transaction.BrokerTransactionID = 2; // Change to a different ID
    transaction.Amount = 7500;
    const result2 = AccountImport.ConfigureTransferRecord(
      account,
      transaction,
      result1,
      previous
    );
    expect(result1?.TransferAmount).toBe(12500);
    expect(result1?.TransferDescription).toContain('Initial deposit [TxID:1,Amt:5000]');
    expect(result1?.TransferDescription).toContain('Initial deposit [TxID:2,Amt:7500]');
    expect(result2?.TransferAmount).toBe(12500);
    expect(result2?.TransferDescription).toContain('Initial deposit [TxID:1,Amt:5000]');
    expect(result2?.TransferDescription).toContain('Initial deposit [TxID:2,Amt:7500]');
  });

  it('should add transfer amount to existing record', () => {
    const account = mockAccount();
    const transaction: Transaction = {
      TransactionID: 2,
      Type: TransactionType.Transfer,
      Amount: 2000,
      Description: 'Additional deposit',
      TransactionDate: new Date(),
    } as any;
    const cascadeRecords: AccountHistory[] = [];
    
    // Existing balance record for today with prior transfer
    const latest = new AccountHistory(
      MOCK_ACCOUNT_ID, RollupPeriod.Daily,
      new Date(),
      50000,
      1000,
      'Prior transfer'
    );
    const previous = null;

    const result = AccountImport.ConfigureTransferRecord(
      account,
      transaction,
      latest,
      previous
    );

    expect(result).not.toBeNull();
    expect(result?.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(result?.TransferAmount).toBe(3000); // 1000 + 2000
    expect(result?.TransferDescription).toContain('Prior transfer');
    expect(result?.TransferDescription).toContain('Additional deposit');
  });

  it('should return null when transfer amount is zero', () => {
    const account = mockAccount();
    const transaction: Transaction = {
      TransactionID: 3,
      Type: TransactionType.Transfer,
      Amount: 0,
      Description: 'Zero transfer',
      TransactionDate: new Date(),
    } as any;
    const cascadeRecords: AccountHistory[] = [];

    const result = AccountImport.ConfigureTransferRecord(
      account,
      transaction,
      null,
      null
    );

    expect(result).toBeNull();
  });

  it('should throw error when account is null', () => {
    const transaction: Transaction = {
      TransactionID: 4,
      Type: TransactionType.Transfer,
      Amount: 1000,
      TransactionDate: new Date(),
    } as any;

    expect(() => {
      AccountImport.ConfigureTransferRecord(null as any, transaction, null, null);
    }).toThrow('Account is null');
  });

  it('should throw error when transaction type is not Transfer', () => {
    const account = mockAccount();
    const transaction: Transaction = {
      TransactionID: 5,
      Type: TransactionType.Dividend, // Not a Transfer
      Amount: 1000,
      TransactionDate: new Date(),
    } as any;

    expect(() => {
      AccountImport.ConfigureTransferRecord(account, transaction, null, null);
    }).toThrow('Invalid transfer transaction');
  });

  it('should set invested amount on first transafer', () => {
    const account = mockAccount();
    const transaction: Transaction = {
      TransactionID: 1,
      Type: TransactionType.Transfer,
      Amount: 5000,
      Description: 'Initial deposit',
      TransactionDate: new Date()
    } as any;
    const cascadeRecords: AccountHistory[] = [];
    const latest = null;
    const previous = null;

    const result = AccountImport.ConfigureTransferRecord(
      account,
      transaction,
      latest,
      previous
    );

    expect(result).not.toBeNull();
    expect(result?.Balance).toBeNull()
    expect(result?.TransferAmount).toBe(5000);
    // InvestedAmount is not set by ConfigureTransferRecord - it will be calculated by AccountRollupCalculator
    expect(result?.InvestedAmount).toBeNull();
  });

  it('should cumulatively apply multiple transfers on the same date', () => {
    const account = mockAccount();
    const transaction1: Transaction = {
      TransactionID: 1,
      Type: TransactionType.Transfer,
      Amount: 5000,
      Description: 'Initial deposit',
      TransactionDate: new Date()
    } as any;
    const cascadeRecords: AccountHistory[] = [];
    const latest = null;
    const previous = null;

    let result1 = AccountImport.ConfigureTransferRecord(
      account,
      transaction1,
      latest,
      previous
    );

    expect(result1?.Balance).toBeNull()
    expect(result1?.TransferAmount).toBe(5000);
    expect(result1?.TransferDescription).toBe('Initial deposit');
    // InvestedAmount is not set by ConfigureTransferRecord - it will be calculated by AccountRollupCalculator
    expect(result1?.InvestedAmount).toBeNull();

    const transaction2: Transaction = {
      TransactionID: 2,
      Type: TransactionType.Transfer,
      Amount: -3000,
      Description: 'A withdrawal',
      TransactionDate: new Date()
    } as any;

    let result2 = AccountImport.ConfigureTransferRecord(
      account,
      transaction2,
      result1,
      previous
    );

    expect(result2?.Balance).toBeNull()
    expect(result2?.TransferAmount).toBe(2000);
    // InvestedAmount is not set by ConfigureTransferRecord - it will be calculated by AccountRollupCalculator
    expect(result2?.InvestedAmount).toBeNull();
    expect(result2?.TransferDescription).toBe('Initial deposit. A withdrawal');
  });

  it('should cumulatively apply transfers across multiple dates', () => {
    const account = mockAccount();

    const cascadeRecords: AccountHistory[] = [];
    
    // Create first balance record directly
    let firstBalance = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date(),
      5000,
      null,
      null
    );
    firstBalance.BalanceUpdateTime = new Date();
    
    expect(firstBalance?.Balance).toBe(5000)
    expect(firstBalance?.TransferAmount).toBeNull();
    expect(firstBalance?.InvestedAmount).toBeNull();

    let transaction1: Transaction = {
      TransactionID: 1,
      Type: TransactionType.Transfer,
      Amount: 500,
      Description: 'A deposit',
      TransactionDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // add 1 day
    } as any;

    let secondBalance = AccountImport.ConfigureTransferRecord(
      account,
      transaction1,
      firstBalance,
      null
    );
    expect(firstBalance?.Balance).toBe(5000)
    expect(firstBalance?.TransferAmount).toBeNull();
    expect(firstBalance?.InvestedAmount).toBeNull();
    expect(secondBalance?.Balance).toBe(5000)
    expect(secondBalance?.TransferAmount).toBe(500);
    // InvestedAmount is not set by ConfigureTransferRecord - it will be calculated by AccountRollupCalculator
    expect(secondBalance?.InvestedAmount).toBeNull();

    let transaction2: Transaction = {
      TransactionID: 2,
      Type: TransactionType.Transfer,
      Amount: 250,
      Description: 'A second deposit',
      TransactionDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // add 2 days
    } as any;

    let thirdBalance = AccountImport.ConfigureTransferRecord(
      account,
      transaction2,
      secondBalance,
      firstBalance
    );
    expect(firstBalance?.Balance).toBe(5000)
    expect(firstBalance?.TransferAmount).toBeNull();
    expect(firstBalance?.InvestedAmount).toBeNull();
    expect(secondBalance?.Balance).toBe(5000)
    expect(secondBalance?.TransferAmount).toBe(500);
    // InvestedAmount is not set by ConfigureTransferRecord - it will be calculated by AccountRollupCalculator
    expect(secondBalance?.InvestedAmount).toBeNull();
    expect(thirdBalance?.Balance).toBe(5000);
    expect(thirdBalance?.TransferAmount).toBe(250);
    // InvestedAmount is not set by ConfigureTransferRecord - it will be calculated by AccountRollupCalculator
    expect(thirdBalance?.InvestedAmount).toBeNull();  

  });

});



