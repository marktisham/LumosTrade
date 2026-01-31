import { AccountRollupCalculator } from '../processor/Account/AccountRollupCalculator';
import { Account } from '../interfaces/Account';
import { AccountHistory } from '../interfaces/AccountHistory';
import { RollupPeriod } from '../utils/RollupUtils';

describe('AccountRollupCalculator.findInvestedAmount', () => {
  let testAccount: Account;

  beforeEach(() => {
    testAccount = new Account(
      42,
      'TEST-ACCT',
      'Test Account',
      'Test',
      null,
      null,
      null,
      false
    );
  });

  describe('Weekly rollup with transfers', () => {
    it('should not double-count transfers when using daily records', () => {
      // Scenario: 
      // Day 1 (Mon): Initial transfer of 1000, invested = 1000, balance = 1000
      // Day 2 (Tue): No transfer, invested = 1000, balance = 1010
      // Day 3 (Wed): No transfer, invested = 1000, balance = 1020
      // Weekly rollup should show invested = 1000, NOT 2000

      const mondayDate = new Date('2025-01-06T00:00:00.000Z'); // Monday
      const tuesdayDate = new Date('2025-01-07T00:00:00.000Z');
      const wednesdayDate = new Date('2025-01-08T00:00:00.000Z');

      // Daily records for the week
      const dailyRecords: AccountHistory[] = [
        new AccountHistory(42, RollupPeriod.Daily, mondayDate, 1000, null, null),
        new AccountHistory(42, RollupPeriod.Daily, tuesdayDate, 1010, null, null),
        new AccountHistory(42, RollupPeriod.Daily, wednesdayDate, 1020, null, null),
      ];

      // Day 1 has the transfer
      dailyRecords[0].TransferAmount = 1000;
      dailyRecords[0].TransferDescription = 'Initial deposit';
      dailyRecords[0].InvestedAmount = 1000;
      dailyRecords[0].NetGain = 0;
      dailyRecords[0].NetGainPct = 0;

      // Day 2 has no transfer
      dailyRecords[1].TransferAmount = null;
      dailyRecords[1].InvestedAmount = 1000;
      dailyRecords[1].NetGain = 10;
      dailyRecords[1].NetGainPct = 0.01;

      // Day 3 has no transfer
      dailyRecords[2].TransferAmount = null;
      dailyRecords[2].InvestedAmount = 1000;
      dailyRecords[2].NetGain = 20;
      dailyRecords[2].NetGainPct = 0.02;

      // Calculate weekly rollup (no previous weekly history)
      const weeklyHistory = AccountRollupCalculator.CalculateRollupValues(
        testAccount,
        RollupPeriod.Weekly,
        '2025-01-06', // Monday
        '2025-01-12', // Sunday (end of week)
        1020,         // Current balance
        null,         // No existing weekly record
        null,         // No previous weekly record
        dailyRecords,
        0
      );

      // The invested amount should be 1000, NOT 2000
      expect(weeklyHistory.InvestedAmount).toBe(1000);
      expect(weeklyHistory.NetGain).toBe(20);
      expect(weeklyHistory.NetGainPct).toBeCloseTo(0.02, 4);
    });

    it('should correctly add new transfers to previous weekly invested amount', () => {
      // Scenario:
      // Previous week: invested = 1000
      // This week Day 1: transfer of 500, invested should = 1500
      // This week Day 2: no transfer, invested should = 1500

      const previousWeekEnd = new Date('2025-01-05T00:00:00.000Z'); // Previous Sunday
      const mondayDate = new Date('2025-01-06T00:00:00.000Z');
      const tuesdayDate = new Date('2025-01-07T00:00:00.000Z');

      const previousWeekHistory = new AccountHistory(
        42,
        RollupPeriod.Weekly,
        previousWeekEnd,
        1000,
        null,
        null
      );
      previousWeekHistory.InvestedAmount = 1000;

      const dailyRecords: AccountHistory[] = [
        new AccountHistory(42, RollupPeriod.Daily, mondayDate, 1500, null, null),
        new AccountHistory(42, RollupPeriod.Daily, tuesdayDate, 1510, null, null),
      ];

      dailyRecords[0].TransferAmount = 500;
      dailyRecords[0].InvestedAmount = 1500;
      dailyRecords[1].TransferAmount = null;
      dailyRecords[1].InvestedAmount = 1500;

      const weeklyHistory = AccountRollupCalculator.CalculateRollupValues(
        testAccount,
        RollupPeriod.Weekly,
        '2025-01-06',
        '2025-01-12',
        1510,
        null,
        previousWeekHistory,
        dailyRecords,
        0
      );

      expect(weeklyHistory.InvestedAmount).toBe(1500);
      expect(weeklyHistory.NetGain).toBe(10);
    });
  });

  describe('Monthly rollup with transfers', () => {
    it('should not double-count transfers across daily records in month', () => {
      // Scenario: Transfer on day 1, then multiple days with no transfers
      // Monthly rollup should show invested = transfer amount, not doubled

      const dailyRecords: AccountHistory[] = [];
      for (let day = 1; day <= 5; day++) {
        const date = new Date(`2025-01-${day.toString().padStart(2, '0')}T00:00:00.000Z`);
        const record = new AccountHistory(42, RollupPeriod.Daily, date, 1000 + day * 10, null, null);
        
        if (day === 1) {
          record.TransferAmount = 1000;
          record.InvestedAmount = 1000;
        } else {
          record.TransferAmount = null;
          record.InvestedAmount = 1000;
        }
        
        dailyRecords.push(record);
      }

      const monthlyHistory = AccountRollupCalculator.CalculateRollupValues(
        testAccount,
        RollupPeriod.Monthly,
        '2025-01-01',
        '2025-01-31',
        1050,
        null,
        null,
        dailyRecords,
        0
      );

      expect(monthlyHistory.InvestedAmount).toBe(1000);
      expect(monthlyHistory.NetGain).toBe(50);
    });
  });
});
