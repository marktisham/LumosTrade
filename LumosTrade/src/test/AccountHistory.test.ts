import { AccountRollupCalculator } from '../processor/Account/AccountRollupCalculator';
import { Account } from '../interfaces/Account';
import { AccountHistory } from '../interfaces/AccountHistory';
import { RollupPeriod, RollupUtils } from '../utils/RollupUtils';
import { DateUtils } from '../utils/DateUtils';

const MOCK_ACCOUNT_ID = 42;
const mockAccount = (): Account => ({ 
  AccountID: MOCK_ACCOUNT_ID, 
  Name: 'Test Account',
  BrokerID: 1 
} as any);

describe('AccountRollupCalculator - Daily Rollups', () => {

  it('should calculate daily rollup with no previous history', () => {
    const account = mockAccount();
    const currentBalance = 10000;
    const periodStart = '2024-01-15';
    const periodEnd = '2024-01-15';
    const ordersExecuted = 0;

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Daily,
      periodStart,
      periodEnd,
      currentBalance,
      null, // currentHistory
      null, // previousHistory
      [], // dailyRecords
      ordersExecuted
    );

    expect(result).not.toBeNull();
    expect(result.AccountID).toBe(MOCK_ACCOUNT_ID);
    expect(result.RollupPeriod).toBe(RollupPeriod.Daily);
    expect(result.Balance).toBe(10000);
    expect(result.BalanceUpdateTime).toBeTruthy();
    expect(result.BalanceChangeAmount).toBe(0);
    expect(result.BalanceChangePct).toBe(0);
    expect(result.InvestedAmount).toBeNull();
    expect(result.NetGain).toBeNull();
    expect(result.NetGainPct).toBeNull();
    expect(result.OrdersExecuted).toBe(0);
  });

  it('should calculate daily rollup with previous history', () => {
    const account = mockAccount();
    const currentBalance = 10500;
    const periodStart = '2024-01-16';
    const periodEnd = '2024-01-16';
    const ordersExecuted = 2;

    const previousHistory = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date('2024-01-15T00:00:00.000Z'),
      10000,
      null,
      null
    );
    previousHistory.InvestedAmount = 8000;
    previousHistory.BalanceUpdateTime = new Date('2024-01-15T16:00:00.000Z');

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Daily,
      periodStart,
      periodEnd,
      currentBalance,
      null,
      previousHistory,
      [],
      ordersExecuted
    );

    expect(result.Balance).toBe(10500);
    expect(result.BalanceChangeAmount).toBe(500);
    expect(result.BalanceChangePct).toBeCloseTo(0.05, 4);
    expect(result.InvestedAmount).toBe(8000);
    expect(result.NetGain).toBe(2500);
    expect(result.NetGainPct).toBeCloseTo(0.3125, 4);
    expect(result.OrdersExecuted).toBe(2);
  });

  it('should calculate daily rollup with transfer on same day', () => {
    const account = mockAccount();
    const currentBalance = 10000;
    const periodStart = '2024-01-15';
    const periodEnd = '2024-01-15';

    const currentHistory = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date('2024-01-15T00:00:00.000Z'),
      10000,
      5000, // Transfer amount
      'Initial deposit'
    );

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Daily,
      periodStart,
      periodEnd,
      currentBalance,
      currentHistory,
      null,
      [currentHistory],
      0
    );

    expect(result.Balance).toBe(10000);
    expect(result.TransferAmount).toBe(5000);
    expect(result.TransferDescription).toBe('Initial deposit');
    expect(result.InvestedAmount).toBe(5000);
    expect(result.NetGain).toBe(5000);
    expect(result.NetGainPct).toBe(1.0);
  });

  it('should calculate daily rollup with positive transfer and previous invested amount', () => {
    const account = mockAccount();
    const currentBalance = 15000;
    const periodStart = '2024-01-16';
    const periodEnd = '2024-01-16';

    const previousHistory = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date('2024-01-15T00:00:00.000Z'),
      10000,
      null,
      null
    );
    previousHistory.InvestedAmount = 8000;

    const currentHistory = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date('2024-01-16T00:00:00.000Z'),
      currentBalance,
      5000,
      'Additional deposit'
    );

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Daily,
      periodStart,
      periodEnd,
      currentBalance,
      currentHistory,
      previousHistory,
      [currentHistory],
      0
    );

    expect(result.Balance).toBe(15000);
    expect(result.TransferAmount).toBe(5000);
    expect(result.InvestedAmount).toBe(13000); // 8000 + 5000
    expect(result.NetGain).toBe(2000); // 15000 - 13000
    expect(result.NetGainPct).toBeCloseTo(0.1538, 4);
  });

  it('should calculate daily rollup with negative transfer and previous invested amount', () => {
    const account = mockAccount();
    const currentBalance = 5000;
    const periodStart = '2024-01-16';
    const periodEnd = '2024-01-16';

    const previousHistory = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date('2024-01-15T00:00:00.000Z'),
      10000,
      null,
      null
    );
    previousHistory.InvestedAmount = 8000;

    const currentHistory = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date('2024-01-16T00:00:00.000Z'),
      currentBalance,
      -5000,
      'Transfer out'
    );

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Daily,
      periodStart,
      periodEnd,
      currentBalance,
      currentHistory,
      previousHistory,
      [currentHistory],
      0
    );

    expect(result.Balance).toBe(5000);
    expect(result.TransferAmount).toBe(-5000);
    expect(result.InvestedAmount).toBe(3000); // 8000 - 5000
  });

  it('should handle negative transfers (withdrawals)', () => {
    const account = mockAccount();
    const currentBalance = 8000;
    const periodStart = '2024-01-16';
    const periodEnd = '2024-01-16';

    const previousHistory = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date('2024-01-15T00:00:00.000Z'),
      10000,
      null,
      null
    );
    previousHistory.InvestedAmount = 10000;

    const currentHistory = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date('2024-01-16T00:00:00.000Z'),
      8000,
      -2000,
      'Withdrawal'
    );

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Daily,
      periodStart,
      periodEnd,
      currentBalance,
      currentHistory,
      previousHistory,
      [currentHistory],
      0
    );

    expect(result.Balance).toBe(8000);
    expect(result.TransferAmount).toBe(-2000);
    expect(result.InvestedAmount).toBe(8000); // 10000 - 2000
    expect(result.NetGain).toBe(0); // 8000 - 8000
    expect(result.NetGainPct).toBe(0);
  });
});

describe('AccountRollupCalculator - Weekly Rollups', () => {

  it('should calculate weekly rollup from daily records', () => {
    const account = mockAccount();
    
    // Create daily records for Mon-Fri (2024-01-15 to 2024-01-19)
    const dailyRecords: AccountHistory[] = [];
    for (let day = 15; day <= 19; day++) {
      const record = new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date(`2024-01-${day}T00:00:00.000Z`),
        10000 + (day - 15) * 100, // Increasing balance
        null,
        null
      );
      record.OrdersExecuted = day === 15 ? 0 : 1;
      dailyRecords.push(record);
    }

    const currentBalance = 10400; // Friday balance
    const periodStart = '2024-01-15'; // Monday
    const periodEnd = '2024-01-19'; // Friday

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Weekly,
      periodStart,
      periodEnd,
      currentBalance,
      null,
      null,
      dailyRecords,
      0
    );

    expect(result.RollupPeriod).toBe(RollupPeriod.Weekly);
    expect(result.Balance).toBe(10400);
    expect(result.OrdersExecuted).toBe(3); // Sum of daily orders: 0 + 1 + 1 + 1
    expect(DateUtils.formatDateOnly(result.PeriodEnd)).toBe('2024-01-19');
  });

  it('should aggregate transfers in weekly rollup', () => {
    const account = mockAccount();
    
    const dailyRecords: AccountHistory[] = [
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-15T00:00:00.000Z'),
        5000,
        5000,
        'Initial deposit'
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-16T00:00:00.000Z'),
        7500,
        2500,
        'Second deposit'
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-17T00:00:00.000Z'),
        7500,
        null,
        null
      )
    ];

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Weekly,
      '2024-01-15',
      '2024-01-19',
      7500,
      null,
      null,
      dailyRecords,
      0
    );

    expect(result.TransferAmount).toBe(7500); // 5000 + 2500
    expect(result.TransferDescription).toContain('Initial deposit');
    expect(result.TransferDescription).toContain('Second deposit');
    expect(result.InvestedAmount).toBe(7500);
  });

  it('should calculate weekly rollup with previous week', () => {
    const account = mockAccount();

    const previousWeek = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Weekly,
      new Date('2024-01-12T00:00:00.000Z'),
      10000,
      null,
      null
    );
    previousWeek.InvestedAmount = 8000;

    const dailyRecords: AccountHistory[] = [
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-15T00:00:00.000Z'),
        10200,
        null,
        null
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-16T00:00:00.000Z'),
        10500,
        null,
        null
      )
    ];

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Weekly,
      '2024-01-15',
      '2024-01-19',
      10500,
      null,
      previousWeek,
      dailyRecords,
      0
    );

    expect(result.Balance).toBe(10500);
    expect(result.BalanceChangeAmount).toBe(500); // 10500 - 10000
    expect(result.BalanceChangePct).toBeCloseTo(0.05, 4);
    expect(result.InvestedAmount).toBe(8000); // No new transfers
    expect(result.NetGain).toBe(2500); // 10500 - 8000
  });

  it('should handle week spanning month boundary', () => {
    const account = mockAccount();
    
    // Week from Jan 29 (Mon) to Feb 2 (Fri)
    const dailyRecords: AccountHistory[] = [];
    const dates = ['2024-01-29', '2024-01-30', '2024-01-31', '2024-02-01', '2024-02-02'];
    
    dates.forEach((dateStr, idx) => {
      const record = new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date(dateStr + 'T00:00:00.000Z'),
        10000 + idx * 100,
        null,
        null
      );
      dailyRecords.push(record);
    });

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Weekly,
      '2024-01-29',
      '2024-02-02',
      10400,
      null,
      null,
      dailyRecords,
      0
    );

    expect(result.RollupPeriod).toBe(RollupPeriod.Weekly);
    expect(result.Balance).toBe(10400);
    expect(DateUtils.formatDateOnly(result.PeriodEnd)).toBe('2024-02-02');
  });

  it('should handle week with transfers spanning month boundary', () => {
    const account = mockAccount();
    
    const dailyRecords: AccountHistory[] = [
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-29T00:00:00.000Z'),
        5000,
        5000,
        'Jan deposit'
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-30T00:00:00.000Z'),
        5000,
        null,
        null
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-31T00:00:00.000Z'),
        5000,
        null,
        null
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-02-01T00:00:00.000Z'),
        8000,
        3000,
        'Feb deposit'
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-02-02T00:00:00.000Z'),
        8000,
        null,
        null
      )
    ];

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Weekly,
      '2024-01-29',
      '2024-02-02',
      8000,
      null,
      null,
      dailyRecords,
      0
    );

    expect(result.TransferAmount).toBe(8000); // 5000 + 3000
    expect(result.TransferDescription).toContain('Jan deposit');
    expect(result.TransferDescription).toContain('Feb deposit');
    expect(result.InvestedAmount).toBe(8000);
  });
});

describe('AccountRollupCalculator - Monthly Rollups', () => {

  it('should calculate monthly rollup from daily records', () => {
    const account = mockAccount();
    
    // Create daily records for first few days of January
    const dailyRecords: AccountHistory[] = [];
    for (let day = 2; day <= 5; day++) { // Jan 2-5 (Tue-Fri)
      const record = new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date(`2024-01-0${day}T00:00:00.000Z`),
        10000 + day * 100,
        null,
        null
      );
      record.OrdersExecuted = day === 2 ? 0 : 2;
      dailyRecords.push(record);
    }

    const currentBalance = 10500;

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Monthly,
      '2024-01-02',
      '2024-01-31',
      currentBalance,
      null,
      null,
      dailyRecords,
      0
    );

    expect(result.RollupPeriod).toBe(RollupPeriod.Monthly);
    expect(result.Balance).toBe(10500);
    expect(result.OrdersExecuted).toBe(6); // Sum of daily orders (0 + 2 + 2 + 2)
  });

  it('should aggregate transfers in monthly rollup', () => {
    const account = mockAccount();
    
    const dailyRecords: AccountHistory[] = [
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-02T00:00:00.000Z'),
        5000,
        5000,
        'Start of month deposit'
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-15T00:00:00.000Z'),
        8000,
        3000,
        'Mid month deposit'
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-30T00:00:00.000Z'),
        9000,
        1000,
        'End of month deposit'
      )
    ];

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Monthly,
      '2024-01-02',
      '2024-01-31',
      9000,
      null,
      null,
      dailyRecords,
      0
    );

    expect(result.TransferAmount).toBe(9000); // 5000 + 3000 + 1000
    expect(result.TransferDescription).toContain('Start of month deposit');
    expect(result.TransferDescription).toContain('Mid month deposit');
    expect(result.TransferDescription).toContain('End of month deposit');
    expect(result.InvestedAmount).toBe(9000);
  });

  it('should calculate monthly rollup with previous month', () => {
    const account = mockAccount();

    const previousMonth = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Monthly,
      new Date('2023-12-29T00:00:00.000Z'),
      10000,
      null,
      null
    );
    previousMonth.InvestedAmount = 8000;

    const dailyRecords: AccountHistory[] = [
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-02T00:00:00.000Z'),
        10200,
        null,
        null
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-31T00:00:00.000Z'),
        11000,
        null,
        null
      )
    ];

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Monthly,
      '2024-01-02',
      '2024-01-31',
      11000,
      null,
      previousMonth,
      dailyRecords,
      0
    );

    expect(result.Balance).toBe(11000);
    expect(result.BalanceChangeAmount).toBe(1000); // 11000 - 10000
    expect(result.BalanceChangePct).toBeCloseTo(0.1, 4);
    expect(result.InvestedAmount).toBe(8000); // No new transfers
    expect(result.NetGain).toBe(3000); // 11000 - 8000
    expect(result.NetGainPct).toBeCloseTo(0.375, 4);
  });

  it('should handle month with multiple weeks and transfers', () => {
    const account = mockAccount();
    
    // Create 20 business days with various transfers
    const dailyRecords: AccountHistory[] = [];
    let balance = 0;
    
    // Week 1: Initial deposit
    dailyRecords.push(new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date('2024-01-02T00:00:00.000Z'),
      10000,
      10000,
      'Initial deposit'
    ));
    balance = 10000;
    
    // Week 2-3: Trading days with no transfers
    for (let day = 3; day <= 19; day++) {
      if (day === 6 || day === 7 || day === 13 || day === 14) continue; // Skip weekends
      balance += 50; // Small daily gains
      const record = new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date(`2024-01-${day.toString().padStart(2, '0')}T00:00:00.000Z`),
        balance,
        null,
        null
      );
      dailyRecords.push(record);
    }
    
    // Week 4: Another deposit
    balance += 2000;
    dailyRecords.push(new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date('2024-01-22T00:00:00.000Z'),
      balance,
      2000,
      'Additional deposit'
    ));

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Monthly,
      '2024-01-02',
      '2024-01-31',
      balance,
      null,
      null,
      dailyRecords,
      0
    );

    expect(result.TransferAmount).toBe(12000); // 10000 + 2000
    expect(result.InvestedAmount).toBe(12000);
    expect(result.Balance).toBeGreaterThan(12000); // Has some gains
    expect(result.NetGain).toBeGreaterThan(0);
  });
});

describe('AccountRollupCalculator - Month/Week Boundary Cases', () => {

  it('should handle week starting in one month and ending in another', () => {
    const account = mockAccount();
    
    // Week from Dec 30 (Mon) to Jan 3 (Fri)
    const dailyRecords: AccountHistory[] = [
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-12-30T00:00:00.000Z'),
        10000,
        10000,
        'Dec deposit'
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-12-31T00:00:00.000Z'),
        10100,
        null,
        null
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2025-01-02T00:00:00.000Z'),
        10200,
        null,
        null
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2025-01-03T00:00:00.000Z'),
        10300,
        300,
        'Jan deposit'
      )
    ];

    // Weekly rollup
    const weeklyResult = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Weekly,
      '2024-12-30',
      '2025-01-03',
      10300,
      null,
      null,
      dailyRecords,
      0
    );

    expect(weeklyResult.TransferAmount).toBe(10300); // Both transfers
    expect(weeklyResult.TransferDescription).toContain('Dec deposit');
    expect(weeklyResult.TransferDescription).toContain('Jan deposit');

    // December monthly rollup (should include Dec 30-31)
    const decRecords = dailyRecords.filter(r => r.PeriodEnd < new Date('2025-01-01'));
    const decResult = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Monthly,
      '2024-12-02',
      '2024-12-31',
      10100,
      null,
      null,
      decRecords,
      0
    );

    expect(decResult.TransferAmount).toBe(10000); // Only Dec deposit

    // January monthly rollup (should include Jan 2-3)
    const janRecords = dailyRecords.filter(r => r.PeriodEnd >= new Date('2025-01-01'));
    const janResult = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Monthly,
      '2025-01-02',
      '2025-01-31',
      10300,
      null,
      decResult, // Previous month
      janRecords,
      0
    );

    expect(janResult.TransferAmount).toBe(300); // Only Jan deposit
    expect(janResult.InvestedAmount).toBe(10300); // Carries forward from Dec
  });

  it('should handle month ending mid-week', () => {
    const account = mockAccount();
    
    // Jan ends on Wednesday (Jan 31), week continues into Feb
    const dailyRecords: AccountHistory[] = [
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-29T00:00:00.000Z'),
        10000,
        null,
        null
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-30T00:00:00.000Z'),
        10100,
        null,
        null
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-01-31T00:00:00.000Z'),
        10200,
        200,
        'End of Jan'
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-02-01T00:00:00.000Z'),
        10300,
        null,
        null
      ),
      new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        new Date('2024-02-02T00:00:00.000Z'),
        10400,
        100,
        'Start of Feb'
      )
    ];

    // January monthly should end on Jan 31
    const janRecords = dailyRecords.filter(r => r.PeriodEnd < new Date('2024-02-01'));
    const janResult = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Monthly,
      '2024-01-02',
      '2024-01-31',
      10200,
      null,
      null,
      janRecords,
      0
    );

    expect(janResult.Balance).toBe(10200);
    expect(janResult.TransferAmount).toBe(200);

    // Weekly rollup spans both months
    const weeklyResult = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Weekly,
      '2024-01-29',
      '2024-02-02',
      10400,
      null,
      null,
      dailyRecords,
      0
    );

    expect(weeklyResult.Balance).toBe(10400);
    expect(weeklyResult.TransferAmount).toBe(300); // Both transfers
  });

  it('should properly rollup multiple weeks within a month', () => {
    const account = mockAccount();
    
    // January 2024: 4 full weeks + partial week
    const allDailyRecords: AccountHistory[] = [];
    let balance = 10000;
    
    // Create records for entire month
    for (let day = 2; day <= 31; day++) {
      const date = new Date(`2024-01-${day.toString().padStart(2, '0')}T00:00:00.000Z`);
      const dayOfWeek = date.getDay();
      
      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      
      balance += 50; // Small daily gain
      
      const record = new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        date,
        balance,
        null,
        null
      );
      record.OrdersExecuted = 1;
      allDailyRecords.push(record);
    }

    // Add a transfer mid-month
    const midMonthRecord = allDailyRecords[10];
    midMonthRecord.TransferAmount = 5000;
    midMonthRecord.TransferDescription = 'Mid month deposit';
    midMonthRecord.Balance = (midMonthRecord.Balance ?? 0) + 5000;
    
    // Update subsequent balances
    for (let i = 11; i < allDailyRecords.length; i++) {
      allDailyRecords[i].Balance = (allDailyRecords[i].Balance ?? 0) + 5000;
    }

    // Monthly rollup should aggregate all transfers
    const monthlyResult = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Monthly,
      '2024-01-02',
      '2024-01-31',
      allDailyRecords[allDailyRecords.length - 1].Balance ?? 0,
      null,
      null,
      allDailyRecords,
      0
    );

    expect(monthlyResult.TransferAmount).toBe(5000);
    expect(monthlyResult.OrdersExecuted).toBeGreaterThan(15); // ~22 business days
  });

  it('should handle GroupDailyRecordsByPeriod correctly', () => {
    const dailyRecords: AccountHistory[] = [];
    
    // Create records spanning multiple weeks
    for (let day = 2; day <= 31; day++) {
      const date = new Date(`2024-01-${day.toString().padStart(2, '0')}T00:00:00.000Z`);
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      
      const record = new AccountHistory(
        MOCK_ACCOUNT_ID,
        RollupPeriod.Daily,
        date,
        10000,
        null,
        null
      );
      dailyRecords.push(record);
    }

    // Group by week
    const weeklyGroups = AccountRollupCalculator.GroupDailyRecordsByPeriod(
      RollupPeriod.Weekly,
      dailyRecords
    );

    // January 2024 should have 5 weeks
    expect(weeklyGroups.size).toBeGreaterThanOrEqual(4);
    expect(weeklyGroups.size).toBeLessThanOrEqual(5);

    // Each group should have 5 or fewer records (Mon-Fri)
    weeklyGroups.forEach((records, periodEnd) => {
      expect(records.length).toBeGreaterThan(0);
      expect(records.length).toBeLessThanOrEqual(5);
    });

    // Group by month
    const monthlyGroups = AccountRollupCalculator.GroupDailyRecordsByPeriod(
      RollupPeriod.Monthly,
      dailyRecords
    );

    // Should have only 1 month
    expect(monthlyGroups.size).toBe(1);
    const janRecords = monthlyGroups.get('2024-01-31');
    expect(janRecords).toBeDefined();
    expect(janRecords!.length).toBe(dailyRecords.length);
  });
});

describe('AccountRollupCalculator - Edge Cases', () => {

  it('should handle zero balance correctly', () => {
    const account = mockAccount();

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Daily,
      '2024-01-15',
      '2024-01-15',
      0,
      null,
      null,
      [],
      0
    );

    expect(result.Balance).toBe(0);
    expect(result.NetGain).toBeNull();
    expect(result.NetGainPct).toBeNull();
  });

  it('should handle very large balance changes', () => {
    const account = mockAccount();
    
    const previousHistory = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date('2024-01-15T00:00:00.000Z'),
      100,
      null,
      null
    );

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Daily,
      '2024-01-16',
      '2024-01-16',
      100000,
      null,
      previousHistory,
      [],
      0
    );

    expect(result.BalanceChangeAmount).toBe(99900);
    expect(result.BalanceChangePct).toBe(999); // 99900%
  });

  it('should handle balance decrease (losses)', () => {
    const account = mockAccount();
    
    const previousHistory = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date('2024-01-15T00:00:00.000Z'),
      10000,
      null,
      null
    );
    previousHistory.InvestedAmount = 10000;

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Daily,
      '2024-01-16',
      '2024-01-16',
      9000,
      null,
      previousHistory,
      [],
      0
    );

    expect(result.BalanceChangeAmount).toBe(-1000);
    expect(result.BalanceChangePct).toBeCloseTo(-0.1, 4);
    expect(result.NetGain).toBe(-1000);
    expect(result.NetGainPct).toBeCloseTo(-0.1, 4);
  });

  it('should handle multiple transfers on same day correctly', () => {
    const account = mockAccount();
    
    const currentHistory = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date('2024-01-15T00:00:00.000Z'),
      10000,
      7500, // Already has combined transfers
      'First deposit. Second deposit. Third deposit'
    );

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Daily,
      '2024-01-15',
      '2024-01-15',
      10000,
      currentHistory,
      null,
      [currentHistory],
      0
    );

    expect(result.TransferAmount).toBe(7500);
    expect(result.InvestedAmount).toBe(7500);
    expect(result.TransferDescription).toContain('First deposit');
    expect(result.TransferDescription).toContain('Second deposit');
    expect(result.TransferDescription).toContain('Third deposit');
  });

  it('should preserve existing currentHistory when provided', () => {
    const account = mockAccount();
    
    const existingHistory = new AccountHistory(
      MOCK_ACCOUNT_ID,
      RollupPeriod.Daily,
      new Date('2024-01-15T00:00:00.000Z'),
      9500,
      1000,
      'Existing deposit'
    );
    existingHistory.AccountHistoryID = 123;

    const result = AccountRollupCalculator.CalculateRollupValues(
      account,
      RollupPeriod.Daily,
      '2024-01-15',
      '2024-01-15',
      10000,
      existingHistory,
      null,
      [existingHistory],
      0
    );

    // Should return same instance, updated
    expect(result).toBe(existingHistory);
    expect(result.AccountHistoryID).toBe(123);
    expect(result.Balance).toBe(10000); // Updated
    expect(result.TransferAmount).toBe(1000); // Preserved
  });
});
