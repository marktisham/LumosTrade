import { Order } from '../interfaces/Order';
import { DataAccessBase } from './DataAccessBase';
import { Account } from '../interfaces/Account';
import { AccountHistory } from '../interfaces/AccountHistory';
import { BrokerClient } from '../interfaces/BrokerClient';
import { Trade } from '../interfaces/Trade';
import { RoundUtil } from '../utils/RoundUtil';
import { DateUtils } from '../utils/DateUtils';
import { Quote } from '../interfaces/Quote';
import { Transaction } from '../interfaces/Transaction';
import { Instrument } from '../interfaces/Instrument';
import { TradeHistory } from '../interfaces/TradeHistory';
import { RollupPeriod } from '../utils/RollupUtils';
import { Broker } from '../interfaces/Broker';
import { ExpectedMove } from '../interfaces/ExpectedMove';
import { OrderStatus } from '../interfaces/OrderStatus';


export class DataAccess extends DataAccessBase {

  // ==========================
  // Accounts
  // ==========================

  /**
   * Refresh account metadata from a broker into the Accounts table via stored procedure.
   */
  public static async AccountRefresh(broker: BrokerClient, account: Account): Promise<void> {
    const brokerId = broker.GetBrokerID();
    await this.withConnection(async (conn) => {
      await conn.query(
        `INSERT INTO Accounts (BrokerID, BrokerAccountID, BrokerAccountKey, Name, Description)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           BrokerAccountKey = VALUES(BrokerAccountKey),
           Name = VALUES(Name),
           Description = VALUES(Description)`,
        [
          brokerId,
          account.BrokerAccountID ?? null,
          account.BrokerAccountKey ?? null,
          account.Name,
          account.Description ?? null
        ]
      );
    });
  }

  /**
   * Return all brokers from the Brokers table ordered by name.
   */
  public static async GetBrokers(): Promise<Broker[]> {
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query('SELECT BrokerID, Name FROM Brokers ORDER BY Name');
      const arr = rows as any[];
      if (!arr || arr.length === 0) return [];
      return arr.map(r => super.mapRowToBroker(r));
    });
  }


  /** Return a single Account by AccountID, or null if not found. */
  public static async GetAccount(accountId: number): Promise<Account | null> {
    if (accountId == null) {
      throw new Error('accountId is required');
    }
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM Accounts WHERE AccountID = ? LIMIT 1', [accountId]);
      const arr = rows as any[];
      if (!arr || arr.length === 0) return null;
      return super.mapRowToAccount(arr[0]);
    });
  }

  public static async GetAccounts(broker?: BrokerClient): Promise<Account[]> {
    const brokerId = broker ? broker.GetBrokerID() : null;
    return this.withConnection(async (conn) => {
      let query: string;
      let params: any[];
      
      if (brokerId != null) {
        query = 'SELECT * FROM Accounts WHERE BrokerID = ? AND Closed = 0 ORDER BY AccountID ASC';
        params = [brokerId];
      } else {
        query = 'SELECT * FROM Accounts WHERE Closed = 0 ORDER BY AccountID ASC';
        params = [];
      }
      const [rows] = await conn.query(query, params);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }
      return arr.map(row => super.mapRowToAccount(row));
    });
  }

  /**
   * Ensure the test account exists in the database. If it doesn't exist, create it.
   * Returns the Account record.
   */
  public static async EnsureTestAccount(testAccountId: number): Promise<Account> {
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM Accounts WHERE AccountID = ? LIMIT 1', [testAccountId]);
      const arr = rows as any[];
      
      if (arr && arr.length > 0) {
        return super.mapRowToAccount(arr[0]);
      }
      
      await conn.query(
        `INSERT INTO Accounts (AccountID, BrokerID, Name, Description, Closed)
         VALUES (?, ?, ?, ?, ?)`,
        [
          testAccountId,
          1,
          'INTEGRATION TEST ACCOUNT',
          'Used for integration tests',
          1
        ]
      );
      
      const [newRows] = await conn.query('SELECT * FROM Accounts WHERE AccountID = ? LIMIT 1', [testAccountId]);
      const newArr = newRows as any[];
      if (!newArr || newArr.length === 0) {
        throw new Error(`Failed to create test account with ID ${testAccountId}`);
      }
      return super.mapRowToAccount(newArr[0]);
    });
  }

  /**
   * Update LatestBrokerTransactionID and LatestBrokerTransactionDate for the given account
   * in the Accounts table and update the in-memory `account` object as well.
   */
  public static async SetAccountLatestBrokerTransaction(
    account: Account,
    latestBrokerTransactionID: number | null,
    latestBrokerTransactionDate: Date | null
  ): Promise<void> {
    const accountId = account.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required to update latest broker transaction');
    }

    await this.withConnection(async (conn) => {
      await conn.query(
        'UPDATE Accounts SET LatestBrokerTransactionID = ?, LatestBrokerTransactionDate = ? WHERE AccountID = ?',
        [latestBrokerTransactionID ?? null, this.formatDbDate(latestBrokerTransactionDate), accountId]
      );
    });
  }

  /**
   * Refresh account all-time high (ATH) statistics.
   * Calculates and updates AllTimeHigh, AllTimeHighDate, DrawdownFromATH, and DrawdownPctFromATH
   * based on daily AccountHistory records.
   */
  public static async RefreshAccountATH(account: Account): Promise<void> {
    const accountId = account.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required to refresh ATH');
    }

    await this.withConnection(async (conn) => {
      // First, get AllTimeHighRangeStart from the Accounts table
      const [accountRows] = await conn.query(
        'SELECT AllTimeHighRangeStart FROM Accounts WHERE AccountID = ? LIMIT 1',
        [accountId]
      );
      const accountArr = accountRows as any[];
      if (!accountArr || accountArr.length === 0) {
        throw new Error(`Account with ID ${accountId} not found`);
      }
      const allTimeHighRangeStart = accountArr[0].AllTimeHighRangeStart;

      // Build query to find max Balance from AccountHistory (daily rollup)
      let athQuery = `
        SELECT Balance, PeriodEnd
        FROM AccountHistory
        WHERE AccountID = ? AND RollupPeriod = ?
      `;
      const athParams: any[] = [accountId, RollupPeriod.Daily];
      
      // If AllTimeHighRangeStart is set, filter by PeriodEnd >= AllTimeHighRangeStart
      if (allTimeHighRangeStart != null) {
        athQuery += ' AND PeriodEnd >= ?';
        athParams.push(this.formatDbDate(allTimeHighRangeStart));
      }
      
      athQuery += ' ORDER BY Balance DESC LIMIT 1';

      const [athRows] = await conn.query(athQuery, athParams);
      const athArr = athRows as any[];
      
      if (!athArr || athArr.length === 0) {
        // No AccountHistory records found, cannot calculate ATH
        return;
      }

      const allTimeHigh = athArr[0].Balance;
      const allTimeHighDate = athArr[0].PeriodEnd;

      // Get the latest Balance from AccountHistory (daily rollup)
      const [latestRows] = await conn.query(
        `SELECT Balance
         FROM AccountHistory
         WHERE AccountID = ? AND RollupPeriod = ?
         ORDER BY PeriodEnd DESC
         LIMIT 1`,
        [accountId, RollupPeriod.Daily]
      );
      const latestArr = latestRows as any[];
      
      if (!latestArr || latestArr.length === 0) {
        // No latest balance found, cannot calculate drawdown
        return;
      }

      const latestBalance = latestArr[0].Balance;
      const drawdownFromATH = allTimeHigh - latestBalance;
      const drawdownPctFromATH = allTimeHigh > 0 ? drawdownFromATH / allTimeHigh : 0;

      // Update Accounts table with calculated values
      await conn.query(
        `UPDATE Accounts
         SET AllTimeHigh = ?,
             AllTimeHighDate = ?,
             DrawdownFromATH = ?,
             DrawdownPctFromATH = ?
         WHERE AccountID = ?`,
        [
          RoundUtil.RoundForDB(allTimeHigh),
          this.formatDbDate(allTimeHighDate),
          RoundUtil.RoundForDB(drawdownFromATH),
          RoundUtil.RoundForDB(drawdownPctFromATH),
          accountId
        ]
      );
    });
  }

  // ==========================
  // Account History
  // ==========================

  /**
   * Get the earliest PeriodEnd date from AccountHistory for the specified account.
   * Returns null if no history records exist.
   */
  public static async GetEarliestAccountHistoryDate(account: Account): Promise<Date | null> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }

    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        'SELECT MIN(PeriodEnd) as EarliestDate FROM AccountHistory WHERE AccountID = ?',
        [accountId]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0 || !arr[0].EarliestDate) {
        return null;
      }
      return new Date(arr[0].EarliestDate);
    });
  }

  /** Get the two most recent daily AccountHistory rows for an account up to `atDate` (ET semantics). */
  public static async GetRecentDailyAccountHistory(account: Account, atDate: Date | string | null = null): 
    Promise<{ latest: AccountHistory | null; previous: AccountHistory | null }> {
      
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }

    // Convert to YYYY-MM-DD string in America/New_York timezone to avoid timezone issues
    const dateStr = DateUtils.ToDateStringInTimeZone(atDate ?? undefined);

    return this.withConnection(async (conn) => {
      const sql = 'SELECT * FROM AccountHistory WHERE AccountID = ? AND RollupPeriod = ? AND PeriodEnd <= ? ORDER BY PeriodEnd DESC LIMIT 2';
      const [rows] = await conn.query(sql, [accountId, RollupPeriod.Daily, dateStr]);
      const arr = rows as any[];
      
      if (!arr || arr.length === 0) {
        return { latest: null, previous: null };
      }
      
      const latest = this.mapRowToAccountHistory(arr[0]);
      const previous = arr.length > 1 ? this.mapRowToAccountHistory(arr[1]) : null;
      
      return { latest, previous };
    });
  }

  /**
   * Get the most recent daily AccountHistory record for the specified account.
   * Returns null if no daily history records exist.
   */
  public static async GetLatestAccountHistory(accountId: number): Promise<AccountHistory | null> {
    if (accountId == null) {
      throw new Error('accountId is required');
    }

    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        'SELECT * FROM AccountHistory WHERE AccountID = ? AND RollupPeriod = ? ORDER BY PeriodEnd DESC LIMIT 1',
        [accountId, RollupPeriod.Daily]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return null;
      }
      return this.mapRowToAccountHistory(arr[0]);
    });
  }

  /**
   * Get the maximum PeriodEnd date from AccountHistory for the given account (daily rollup only).
   * Returns null if no balances exist.
   */
  public static async GetMaxAccountHistoryDate(accountId: number): Promise<Date | null> {
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        'SELECT MAX(PeriodEnd) as MaxDate FROM AccountHistory WHERE AccountID = ? and RollupPeriod=1',
        [accountId]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0 || !arr[0].MaxDate) return null;
      return new Date(arr[0].MaxDate);
    });
  }

  /**
   * Insert or update an AccountHistory row for the provided account and balance.
   * Uses AccountID + RollupPeriod + PeriodEnd as the primary key (upsert).
   */
  public static async UpsertAccountHistory(account: Account, balance: AccountHistory): Promise<void> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }
    if (balance == null) {
      throw new Error('AccountHistory is required');
    }

    return this.withConnection(async (conn) => {
      const sql = `INSERT INTO AccountHistory (
        AccountID,
        RollupPeriod,
        PeriodEnd,
        Balance,
        BalanceUpdateTime,
        BalanceChangeAmount,
        BalanceChangePct,
        TransferAmount,
        TransferDescription,
        OrdersExecuted,
        Comment,
        InvestedAmount,
        NetGain,
        NetGainPct
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        Balance = VALUES(Balance),
        BalanceUpdateTime = VALUES(BalanceUpdateTime),
        BalanceChangeAmount = VALUES(BalanceChangeAmount),
        BalanceChangePct = VALUES(BalanceChangePct),
        TransferAmount = VALUES(TransferAmount),
        TransferDescription = VALUES(TransferDescription),
        OrdersExecuted = VALUES(OrdersExecuted),
        Comment = VALUES(Comment),
        InvestedAmount = VALUES(InvestedAmount),
        NetGain = VALUES(NetGain),
        NetGainPct = VALUES(NetGainPct)`;

      const periodEndStr = DateUtils.formatDateOnly(balance.PeriodEnd);
      const params = [
        accountId,
        balance.RollupPeriod,
        periodEndStr,
        RoundUtil.RoundForDB(balance.Balance),
        this.formatDbDate(balance.BalanceUpdateTime),
        RoundUtil.RoundForDB(balance.BalanceChangeAmount),
        this.clampDecimal8_4(RoundUtil.RoundForDB(balance.BalanceChangePct)),
        RoundUtil.RoundForDB(balance.TransferAmount),
        balance.TransferDescription ?? null,
        RoundUtil.RoundForDB(balance.OrdersExecuted),
        balance.Comment ?? null,
        RoundUtil.RoundForDB(balance.InvestedAmount),
        RoundUtil.RoundForDB(balance.NetGain),
        this.clampDecimal8_4(RoundUtil.RoundForDB(balance.NetGainPct))
      ];

      await conn.query(sql, params);
    });
  }

  /**
   * Return all AccountBalances for an account that occur on or after the provided date.
   * Results are returned in ascending order by `PeriodEnd`.
   * 
   * @param fromDate - Date, date string (YYYY-MM-DD or ISO), or null for all records.
   *                   Interprets dates in America/New_York timezone.
   * @param rollupPeriod - Optional RollupPeriod to filter by (Daily, Weekly, or Monthly).
   *                       If not specified, returns all rollup periods.
   */
  public static async GetAccountHistoryOnOrAfterDate(
    account: Account, 
    fromDate: Date | string | null,
    rollupPeriod?: RollupPeriod
  ): Promise<AccountHistory[]> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }

    return this.withConnection(async (conn) => {
      let sql: string;
      let params: any[];
      
      const whereClauses = ['AccountID = ?'];
      params = [accountId];
      
      if (fromDate != null) {
        const dateStr = DateUtils.ToDateStringInTimeZone(fromDate);
        if (!dateStr) {
          throw new Error('Invalid fromDate provided to GetAccountHistoryOnOrAfterDate');
        }
        whereClauses.push('PeriodEnd >= ?');
        params.push(dateStr);
      }
      
      if (rollupPeriod != null) {
        whereClauses.push('RollupPeriod = ?');
        params.push(rollupPeriod);
      }
      
      sql = `SELECT * FROM AccountHistory WHERE ${whereClauses.join(' AND ')} ORDER BY PeriodEnd ASC`;

      const [rows] = await conn.query(sql, params);
      const arr = rows as any[];
      if (!arr || arr.length === 0) return [];
      return arr.map(r => this.mapRowToAccountHistory(r));
    });
  }

  /**
   * Get AccountHistory for a specific rollup period and period end date.
   */
  public static async GetAccountHistoryForPeriod(
    accountId: number,
    rollupPeriod: RollupPeriod,
    periodEnd: string
  ): Promise<AccountHistory | null> {
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        `SELECT * FROM AccountHistory 
         WHERE AccountID = ? AND RollupPeriod = ? AND PeriodEnd = ?
         LIMIT 1`,
        [accountId, rollupPeriod, periodEnd]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return null;
      }
      return this.mapRowToAccountHistory(arr[0]);
    });
  }

  /**
   * Get AccountHistory just prior to the date passed in, if any
   */
  public static async GetAccountHistoryForPeriodPrior(
    accountId: number,
    rollupPeriod: RollupPeriod,
    periodEnd: string
  ): Promise<AccountHistory | null> {
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        `SELECT * FROM AccountHistory 
         WHERE AccountID = ? AND RollupPeriod = ? AND PeriodEnd < ?
         ORDER BY PeriodEnd DESC
         LIMIT 1`,
        [accountId, rollupPeriod, periodEnd]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return null;
      }
      return this.mapRowToAccountHistory(arr[0]);
    });
  }


  /**
   * Get all daily AccountHistory records within a date range (inclusive).
   * Results are returned in ascending order by PeriodEnd.
   */
  public static async GetDailyAccountHistoryInRange(
    accountId: number,
    startDate: string,
    endDate: string
  ): Promise<AccountHistory[]> {
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        `SELECT * FROM AccountHistory 
         WHERE AccountID = ? AND RollupPeriod = ? AND PeriodEnd >= ? AND PeriodEnd <= ?
         ORDER BY PeriodEnd ASC`,
        [accountId, RollupPeriod.Daily, startDate, endDate]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }
      return arr.map(r => this.mapRowToAccountHistory(r));
    });
  }

  /**
   * Get the count of orders executed for an account on a specific date.
   * @param accountId - The account ID
   * @param date - YYYY-MM-DD string in US Eastern Time
   */
  public static async GetOrdersExecutedCount(
    accountId: number,
    date: string
  ): Promise<number> {
    return this.withConnection(async (conn) => {
      // Convert Eastern Time date to UTC datetime boundaries
      const startOfDayUTC = DateUtils.GetEasternStartOfDayUTC(date);
      const endOfDayUTC = DateUtils.GetEasternEndOfDayUTC(date);
      
      const [rows] = await conn.query(
        `SELECT COUNT(*) as count FROM Orders 
         WHERE AccountID = ? 
           AND ExecutedTime >= ? 
           AND ExecutedTime < ?`,
        [accountId, this.formatDbDate(startOfDayUTC), this.formatDbDate(endOfDayUTC)]
      );
      const arr = rows as any[];
      return arr && arr.length > 0 ? arr[0].count : 0;
    });
  }

  // ==========================
  // Trades
  // ==========================

  /**
   * Get the latest price for a symbol from the Orders table.
   * Returns the most recent order executed on or before the specified date.
   * @param symbol The stock symbol
   * @param date Date to search up to (will be rounded to end of day in ET)
   * @returns Tuple of (price, date) or null if not found
   */
  public static async GetLatestPriceForSymbol(symbol: string, date: Date): Promise<{ price: number; date: Date } | null> {
    return this.withConnection(async (conn) => {
      // Convert Date to YYYY-MM-DD string and then to end of day in UTC
      const dateStr = DateUtils.formatDateOnly(date);
      if (!dateStr) {
        throw new Error('Invalid date provided to GetLatestPriceForSymbol');
      }
      const endOfDayUTC = DateUtils.GetEasternEndOfDayUTC(dateStr);

      // Get most recent order for this symbol on or before the date
      const [orderRows] = await conn.query(
        `SELECT Price, ExecutedTime as PriceDate 
         FROM Orders 
         WHERE Symbol = ? AND ExecutedTime <= ?
         ORDER BY ExecutedTime DESC 
         LIMIT 1`,
        [symbol, this.formatDbDate(endOfDayUTC)]
      );
      const orderArr = orderRows as any[];
      if (orderArr && orderArr.length > 0 && orderArr[0].Price != null) {
        return {
          price: Number(orderArr[0].Price),
          date: orderArr[0].PriceDate
        };
      }

      return null;
    });
  }

  /**
   * Count trades for a symbol on an account. Returns 0 if none.
   */
  public static async GetTradeCountForSymbol(account: Account, symbol: string, LongTrade: boolean): Promise<number> {
    const accountId = account.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        'SELECT COUNT(*) as tradeCount FROM Trades WHERE AccountID = ? AND Symbol = ? AND LongTrade = ?',
        [accountId, symbol, this.formatDbBool(LongTrade)]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return 0;
      }
      return arr[0].tradeCount ?? 0;
    });
  }

  /**
   * Delete a trade for the given account and trade ID.
   */
  

  /**
   * Insert a new trade. Returns the trade with TradeID populated.
   */
  public static async TradeInsert(account: Account, trade: Trade): Promise<Trade> {
    const accountId = account.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required for trade insert');
    }
    if(trade.TradeID != null) { 
      throw new Error('Trade.TradeID must be null for trade insert');
    }

    return this.withConnection(async (conn) => {
      // Calculate CurrentCost and CurrentValue (always positive, direction indicated by LongTrade)
      const currentCost = (trade.OpenQuantity != null && trade.BreakEvenPrice != null) 
        ? RoundUtil.RoundForDB(Math.abs(trade.OpenQuantity) * trade.BreakEvenPrice) 
        : null;
      const currentValue = (trade.OpenQuantity != null && trade.CurrentPrice != null) 
        ? RoundUtil.RoundForDB(Math.abs(trade.OpenQuantity) * trade.CurrentPrice) 
        : null;

      const [result] = await conn.query(
        `INSERT INTO Trades (
          AccountID,
          Symbol,
          LongTrade,
          WinningTrade,
          OpenDate,
          CloseDate,
          DurationMS,
          Closed,
          OpenQuantity,
          BreakEvenPrice,
          CurrentPrice,
          TotalGain,
          TotalGainPct,
          LargestRisk,
          TotalFees,
          TotalOrderCount,
          ManuallyAdjusted,
          CurrentCost,
          CurrentValue,
          RealizedGain,
          UnrealizedGain,
          AvgEntryPrice,
          AvgExitPrice
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          accountId,
          trade.Symbol,
          this.formatDbBool(trade.LongTrade),
          this.formatDbBool(trade.WinningTrade ?? null),
          this.formatDbDate(trade.OpenDate),
          this.formatDbDate(trade.CloseDate),
          trade.DurationMS?.toString(),
          this.formatDbBool(trade.Closed),
          // Store absolute value for backward compatibility with existing data
          RoundUtil.RoundForDB(Math.abs(trade.OpenQuantity))!,
          trade.BreakEvenPrice != null ? RoundUtil.RoundForDB(trade.BreakEvenPrice) : null,
          trade.CurrentPrice != null ? RoundUtil.RoundForDB(trade.CurrentPrice) : null,
          trade.TotalGain != null ? RoundUtil.RoundForDB(trade.TotalGain) : null,
          trade.TotalGainPct != null ? RoundUtil.RoundForDB(trade.TotalGainPct) : null,
          RoundUtil.RoundForDB(trade.LargestRisk)!,
          RoundUtil.RoundForDB(trade.TotalFees)!,
          trade.TotalOrderCount,
          this.formatDbBool(trade.ManuallyAdjusted ?? false),
          currentCost,
          currentValue,
          trade.RealizedGain != null ? RoundUtil.RoundForDB(trade.RealizedGain) : null,
          trade.UnrealizedGain != null ? RoundUtil.RoundForDB(trade.UnrealizedGain) : null,
          trade.AvgEntryPrice != null ? RoundUtil.RoundForDB(trade.AvgEntryPrice) : null,
          trade.AvgExitPrice != null ? RoundUtil.RoundForDB(trade.AvgExitPrice) : null
        ]
      );

      const insertResult = result as any;
      const insertId = insertResult && (insertResult.insertId || insertResult.insert_id || insertResult.insertID);
      if (!insertId) {
        throw new Error('Trade insert failed: no insertId returned');
      }
      trade.TradeID = insertId;
      return trade;
    });
  }

  /**
   * Update an existing trade via stored procedure.
   */
  public static async TradeUpdate(account: Account, trade: Trade): Promise<void> {
    const accountId = account.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required for trade update');
    }
    if (trade==null || trade.TradeID == null) {
      throw new Error('Trade.TradeID is required for trade update');
    }

    await this.withConnection(async (conn) => {
      // Calculate CurrentCost and CurrentValue (always positive, direction indicated by LongTrade)
      const currentCost = (trade.OpenQuantity != null && trade.BreakEvenPrice != null) 
        ? RoundUtil.RoundForDB(Math.abs(trade.OpenQuantity) * trade.BreakEvenPrice) 
        : null;
      const currentValue = (trade.OpenQuantity != null && trade.CurrentPrice != null) 
        ? RoundUtil.RoundForDB(Math.abs(trade.OpenQuantity) * trade.CurrentPrice) 
        : null;

      const [result] = await conn.query(
        `UPDATE Trades SET
          AccountID = ?,
          Symbol = ?,
          LongTrade = ?,
          WinningTrade = ?,
          OpenDate = ?,
          CloseDate = ?,
          DurationMS = ?,
          Closed = ?,
          OpenQuantity = ?,
          BreakEvenPrice = ?,
          CurrentPrice = ?,
          TotalGain = ?,
          TotalGainPct = ?,
          LargestRisk = ?,
          TotalFees = ?,
          TotalOrderCount = ?,
          ManuallyAdjusted = ?,
          CurrentCost = ?,
          CurrentValue = ?,
          RealizedGain = ?,
          UnrealizedGain = ?,
          AvgEntryPrice = ?,
          AvgExitPrice = ?
        WHERE TradeID = ?`,
        [
          accountId,
          trade.Symbol,
          this.formatDbBool(trade.LongTrade),
          this.formatDbBool(trade.WinningTrade ?? null),
          this.formatDbDate(trade.OpenDate),
          this.formatDbDate(trade.CloseDate),
          trade.DurationMS?.toString(),
          this.formatDbBool(trade.Closed),
          // Store absolute value for backward compatibility with existing data
          RoundUtil.RoundForDB(Math.abs(trade.OpenQuantity))!,
          trade.BreakEvenPrice != null ? RoundUtil.RoundForDB(trade.BreakEvenPrice) : null,
          trade.CurrentPrice != null ? RoundUtil.RoundForDB(trade.CurrentPrice) : null,
          trade.TotalGain != null ? RoundUtil.RoundForDB(trade.TotalGain) : null,
          trade.TotalGainPct != null ? RoundUtil.RoundForDB(trade.TotalGainPct) : null,
          RoundUtil.RoundForDB(trade.LargestRisk)!,
          RoundUtil.RoundForDB(trade.TotalFees)!,
          trade.TotalOrderCount,
          this.formatDbBool(trade.ManuallyAdjusted ?? false),
          currentCost,
          currentValue,
          trade.RealizedGain != null ? RoundUtil.RoundForDB(trade.RealizedGain) : null,
          trade.UnrealizedGain != null ? RoundUtil.RoundForDB(trade.UnrealizedGain) : null,
          trade.AvgEntryPrice != null ? RoundUtil.RoundForDB(trade.AvgEntryPrice) : null,
          trade.AvgExitPrice != null ? RoundUtil.RoundForDB(trade.AvgExitPrice) : null,
          trade.TradeID
        ]
      );

      const updateResult = result as any;
      if (updateResult.affectedRows !== 1) {
        throw new Error(`Trade update failed: expected to update 1 row but updated ${updateResult.affectedRows}`);
      }
    });
  }

  /**
   * Insert or update a trade: if `trade.TradeID` exists perform an update,
   * otherwise insert and return the created trade with TradeID populated.
   */
  public static async UpsertTrade(account: Account, trade: Trade): Promise<Trade> {
    if (account == null || account.AccountID == null) {
      throw new Error('Account.AccountID is required for trade upsert');
    }
    if (trade == null) {
      throw new Error('Trade is required for upsert');
    }

    if (trade.TradeID != null) {
      await this.TradeUpdate(account, trade);
      return trade;
    }

    // Insert returns the trade with TradeID populated
    return await this.TradeInsert(account, trade);
  }

  /**
   * Associate the provided orders with a trade by setting their TradeID.
   */
  public static async TradeSetForOrders(account: Account, trade: Trade, orders: Order[]): Promise<void> {
    const accountId = account.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required for trade set');
    }
    if (trade.TradeID == null) {
      throw new Error('Trade.TradeID is required for trade set');
    }
    if (!orders || orders.length === 0) {
      return;
    }

    const orderIds: number[] = [];
    for (const order of orders) {
      if (order.OrderID == null) {
        throw new Error('Order.OrderID is required for trade set');
      }
      orderIds.push(order.OrderID);
    }

    await this.withConnection(async (conn) => {
      const [result] = await conn.query(
        'UPDATE Orders SET TradeID = ? WHERE AccountID = ? AND OrderID IN (?)',
        [trade.TradeID, accountId, orderIds]
      );
    });
  }

  /**
   * Return distinct symbols for trades that are still open (Closed = 0) for the given account.
   */
  public static async GetOpenTradeSymbols(account: Account): Promise<string[]> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query('SELECT DISTINCT(Symbol) AS Symbol FROM Trades WHERE Closed = 0 AND AccountID = ?', [accountId]);
      const arr = rows as any[];
      if (!arr || arr.length === 0) return [];
      return arr.map(r => (r.Symbol ?? r.symbol ?? '').toString());
    });
  }

  /**
   * Return all open trades (Closed = 0) for the given account.
   */
  public static async GetOpenTrades(account: Account): Promise<Trade[]> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        'SELECT * FROM Trades WHERE AccountID = ? AND Closed = 0 ORDER BY TradeID ASC',
        [accountId]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }
      return arr.map(row => super.mapTradeRowToTrade(row));
    });
  }

  /**
   * Delete a trade for the given account and trade object. Only `Trade.TradeID` is required on the `trade` parameter.
   */
  public static async DeleteTrade(account: Account, trade: Trade): Promise<void> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }
    if (trade == null || trade.TradeID == null) {
      throw new Error('Trade.TradeID is required to delete a trade');
    }

    return this.withConnection(async (conn) => {
      await conn.query('DELETE FROM Trades WHERE AccountID = ? AND TradeID = ?', [accountId, trade.TradeID]);
    });
  }

  // ==========================
  // Orders
  // ==========================

  /**
   * Return orders that are not yet part of a closed trade for the account.
   */
  public static async GetOrdersForTrades(account: Account): Promise<Order[]> {
    const accountId = account.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(`
        SELECT o.* 
        FROM Orders o 
        LEFT JOIN Trades t ON o.TradeID = t.TradeID 
        WHERE o.AccountID = ? 
          AND (o.TradeID IS NULL OR t.Closed = 0) 
          AND o.IncompleteTrade = 0b0 
        ORDER BY o.ExecutedTime ASC, o.BrokerOrderID ASC, o.BrokerOrderStep ASC
      `, [accountId]);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }
      return arr.map(row => super.mapOrderRowToOrder(row));
    });
  }

  /**
   * Return all orders matching the given AccountID and BrokerOrderID, sorted by BrokerOrderStep ascending.
   */
  

  /**
   * Return all orders for a specific trade on the given account, ordered by ExecutedTime ascending.
   */
  public static async GetOrdersForTrade(account: Account, trade: Trade): Promise<Order[]> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }
    if (trade == null || trade.TradeID == null) {
      throw new Error('Trade and Trade.TradeID are required');
    }

    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        'SELECT * FROM Orders WHERE AccountID = ? AND TradeID = ? ORDER BY ExecutedTime ASC, BrokerOrderID ASC, BrokerOrderStep ASC',
        [accountId, trade.TradeID]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }
      return arr.map(row => super.mapOrderRowToOrder(row));
    });
  }

  /**
   * Return a single order matching the provided Account and Transaction (by BrokerTransactionID), or null if none found.
   */
  public static async GetOrderForTransaction(account: Account, tx: Transaction): Promise<Order | null> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }
    if (tx == null || tx.BrokerTransactionID == null) {
      throw new Error('Transaction and Transaction.BrokerTransactionID are required');
    }

    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        'SELECT * FROM Orders WHERE AccountID = ? AND BrokerTransactionID = ? LIMIT 1',
        [accountId, tx.BrokerTransactionID]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return null;
      }
      return super.mapOrderRowToOrder(arr[0]);
    });
  }

  /**
   * Return a single order matching the provided Account and BrokerOrderID, or null if none found.
   * `brokerOrderID` is a numeric broker identifier.
   */
  public static async GetOrderFromBrokerID(account: Account, brokerOrderID: number): Promise<Order | null> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }
    if (brokerOrderID == null) {
      throw new Error('BrokerOrderID is required');
    }

    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        'SELECT * FROM Orders WHERE AccountID = ? AND BrokerOrderID = ? LIMIT 1',
        [accountId, brokerOrderID]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return null;
      }
      return super.mapOrderRowToOrder(arr[0]);
    });
  }

  // ==========================
  // Transactions
  // ==========================

  /**
   * Return the most recent daily AccountHistory transfer on or before the provided date.
   * Returns null if no matching record is found.
   */
  public static async GetLastTransfer(
    account: Account,
    currentDate: Date
  ): Promise<{ PeriodEnd: Date; TransferAmount: number | null } | null> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }

    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        'SELECT PeriodEnd, TransferAmount FROM AccountHistory WHERE AccountID = ? AND RollupPeriod = ? AND PeriodEnd <= ? AND TransferAmount is not NULL ORDER BY PeriodEnd DESC LIMIT 1',
        [accountId, RollupPeriod.Daily, this.formatDbDate(currentDate)]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return null;
      }

      const row = arr[0];
      return {
        PeriodEnd: new Date(row.PeriodEnd),
        TransferAmount: row.TransferAmount ?? null
      };
    });
  }

  /**
   * Return the most recent order for the account or null if none exist.
   */
  public static async GetMostRecentOrder(account: Account, symbol?: string | null, beforeDate?: Date | null): Promise<Order | null> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }

    return this.withConnection(async (conn) => {
      const whereClauses: string[] = ['AccountID = ?'];
      const params: any[] = [accountId];

      if (symbol != null) {
        whereClauses.push('Symbol = ?');
        params.push(symbol);
      }
      if (beforeDate != null) {
        whereClauses.push('ExecutedTime <= ?');
        params.push(this.formatDbDate(beforeDate));
      }

      const sql = `SELECT * FROM Orders WHERE ${whereClauses.join(' AND ')} ORDER BY ExecutedTime DESC, BrokerOrderID DESC, BrokerOrderStep DESC LIMIT 1`;
      const [rows] = await conn.query(sql, params);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return null;
      }
      return super.mapOrderRowToOrder(arr[0]);
    });
  }
  

  /**
   * Insert an order by calling the OrderInsert stored procedure.
   */
  public static async OrderInsert(
    account: Account,
    order: Order
  ): Promise<void> {
    const accountId = account.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required for order insert');
    }
    const actionType = order.Action && typeof order.Action.GetActionType === 'function'
      ? order.Action.GetActionType()
      : null;
    if (!actionType) {
      throw new Error('Order.Action.GetActionType() is required for order insert');
    }
    await this.withConnection(async (conn) => {
      await conn.query(
          `INSERT INTO Orders (
            AccountID,
            BrokerOrderID,
            BrokerOrderStep,
            Symbol,
            Action,
            ExecutedTime,
            Quantity,
            Price,
            Fees,
            OrderAmount,
            IncompleteTrade,
            ManuallyAdjusted,
            AdjustedComment,
            BrokerTransactionID
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          accountId,
          order.BrokerOrderID ?? null,
          order.BrokerOrderStep ?? null,
          order.Symbol,
          actionType,
          this.formatDbDate(order.ExecutedTime),
          order.Quantity,
          order.ExecutedPrice,
          order.Fees,
          order.OrderAmount,
          this.formatDbBool(order.IncompleteTrade ?? false),
          this.formatDbBool(order.ManuallyAdjusted ?? false),
          (order as any).AdjustedComment ?? null,
          order.BrokerTransactionID ?? null
        ]
      );
    });
  }

  /**
   * Update an existing order with the latest values from the provided Order object.
   * Matches on AccountID and OrderID.
   */
  public static async UpdateOrder(account: Account, order: Order): Promise<void> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required for order update');
    }
    if (!order || order.OrderID == null) {
      throw new Error('Order.OrderID is required for order update');
    }

    await this.withConnection(async (conn) => {
      const [result] = await conn.query(
        `UPDATE Orders SET
          BrokerOrderID = ?,
          BrokerOrderStep = ?,
          TradeID = ?,
          Symbol = ?,
          Action = ?,
          ExecutedTime = ?,
          Quantity = ?,
          Price = ?,
          Fees = ?,
          OrderAmount = ?,
          IncompleteTrade = ?,
          ManuallyAdjusted = ?,
          AdjustedComment = ?,
          BrokerTransactionID = ?
        WHERE AccountID = ? AND OrderID = ?`,
        [
          order.BrokerOrderID ?? null,
          order.BrokerOrderStep ?? null,
          order.TradeID ?? null,
          order.Symbol,
          order.Action.GetActionType(),
          this.formatDbDate(order.ExecutedTime),
          order.Quantity,
          order.ExecutedPrice,
          order.Fees,
          order.OrderAmount,
          this.formatDbBool(order.IncompleteTrade ?? false),
          this.formatDbBool(order.ManuallyAdjusted ?? false),
          (order as any).AdjustedComment ?? null,
          order.BrokerTransactionID ?? null,
          accountId,
          order.OrderID
        ]
      );

      const updateResult = result as any;
      if (updateResult.affectedRows !== 1) {
        throw new Error(`Order update failed: expected to update 1 row but updated ${updateResult.affectedRows}`);
      }
    });
  }

  /**
   * Mark the provided orders as having an incomplete trade.
   * Validates order IDs and checks that the affected row count matches the input.
   */
  public static async OrdersSetIncomplete(account: Account, orders: Order[]): Promise<void> {
    const accountId = account.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required for orders set incomplete');
    }
    if (!orders || orders.length === 0) {
      return;
    }

    const orderIds: number[] = [];
    for (const order of orders) {
      if (order.OrderID == null) {
        throw new Error('Order.OrderID is required for orders set incomplete');
      }
      orderIds.push(order.OrderID);
    }

    await this.withConnection(async (conn) => {
      const [result] = await conn.query(
        'UPDATE Orders SET IncompleteTrade = 0b1 WHERE AccountID = ? AND OrderID IN (?)',
        [accountId, orderIds]
      );
      
      const updateResult = result as any;
      if (updateResult.affectedRows !== orders.length) {
        throw new Error(`Orders set incomplete failed: expected to update ${orders.length} orders but updated ${updateResult.affectedRows}`);
      }
    });
  }

  /**
   * Find new orders that are not already in the database.
   * @param account The account to check orders for.
   * @param orders The list of orders to filter.
   * @returns A list of orders that are not already in the database.
   */
  public static async FindNewOrders(account: Account, orders: Order[]): Promise<Order[]> {
    const accountId = account.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }

    if (!orders || orders.length === 0) {
      return [];
    }

    return this.withConnection(async (conn) => {
      // Separate orders with null BrokerOrderID - these are always considered new
      const ordersWithNullBrokerID = orders.filter(order => order.BrokerOrderID == null);
      const ordersWithBrokerID = orders.filter(order => order.BrokerOrderID != null);

      // If all orders have null BrokerOrderID, return them all
      if (ordersWithBrokerID.length === 0) {
        return ordersWithNullBrokerID;
      }

      const orderConditions = ordersWithBrokerID
        .map(order => `(${conn.escape(order.BrokerOrderID)}, ${conn.escape(order.BrokerOrderStep)})`)
        .join(',');

      // We can generally assume there will be a lot more existing orders than non-existing orders,
      // so this query is optimized to only return the non-existing ones (if any).
      const query = `
        SELECT BrokerOrderID, BrokerOrderStep
        FROM (SELECT ${ordersWithBrokerID.map(order => `${conn.escape(order.BrokerOrderID)} AS BrokerOrderID, ${conn.escape(order.BrokerOrderStep)} AS BrokerOrderStep`).join(' UNION ALL SELECT ')}) AS OrdersToInsert
        WHERE NOT EXISTS (
          SELECT 1
          FROM Orders o
          WHERE o.AccountID = ?
            AND o.BrokerOrderID = OrdersToInsert.BrokerOrderID
            AND o.BrokerOrderStep = OrdersToInsert.BrokerOrderStep
        )
      `;

      const [rows] = await conn.query(query, [accountId]);

      // Map the result back to the original orders
      const newOrdersSet = new Set(
        (rows as any[]).map(row => `${row.BrokerOrderID}-${row.BrokerOrderStep}`)
      );

      const newOrdersWithBrokerID = ordersWithBrokerID.filter(order =>
        newOrdersSet.has(`${order.BrokerOrderID}-${order.BrokerOrderStep}`)
      );

      // Combine orders with null BrokerOrderID and new orders with BrokerOrderID
      return [...ordersWithNullBrokerID, ...newOrdersWithBrokerID];
    });
  }

  /**
   * Return the most recent order for the given symbol across all accounts.
   *
   * Note: This method intentionally does NOT filter by AccountID — it searches the
   * Orders table globally for the most recent order for the symbol. Use with care.
   *
   * If `beforeDate` is provided, only orders with `ExecutedTime` <= `beforeDate`
   * will be considered. If `beforeDate` is `null`, the most recent order for the
   * symbol (regardless of time) will be returned.
   */
  public static async GetLatestOrderForSymbolAllAccounts(symbol: string, beforeDate: Date | null): Promise<Order | null> {
    if (symbol == null) {
      throw new Error('Symbol is required');
    }

    return this.withConnection(async (conn) => {
      let query: string;
      let params: any[];

      if (beforeDate == null) {
        query = 'SELECT * FROM Orders WHERE Symbol = ? ORDER BY ExecutedTime DESC, BrokerOrderID DESC, BrokerOrderStep DESC LIMIT 1';
        params = [symbol];
      } else {
        query = 'SELECT * FROM Orders WHERE Symbol = ? AND ExecutedTime <= ? ORDER BY ExecutedTime DESC, BrokerOrderID DESC, BrokerOrderStep DESC LIMIT 1';
        params = [symbol, this.formatDbDate(beforeDate)];
      }

      const [rows] = await conn.query(query, params);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return null;
      }
      return super.mapOrderRowToOrder(arr[0]);
    });
  }


  // ==========================
  // Quotes
  // ==========================


    /**
     * Replace the contents of the Quotes table for the given account with the provided list.
     */
    public static async RefreshQuotes(quotes: Quote[], account: Account): Promise<void> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required for RefreshQuotes');
    }

    return this.withConnection(async (conn) => {
      if (!quotes || quotes.length === 0) return;

      await conn.query('DELETE FROM Quotes WHERE AccountID = ?', [accountId]);

      const placeholders: string[] = [];
      const params: any[] = [];
      for (const q of quotes) {
        placeholders.push('(?, ?, ?, ?)');
        const lastUpdated = this.formatDbDate(q.LastUpdated);
        params.push(accountId, q.Symbol, q.Price, lastUpdated);
      }

      const sql = `INSERT INTO Quotes (AccountID, Symbol, Price, LastUpdated) VALUES ${placeholders.join(', ')}`;
      await conn.query(sql, params);
    });
  }

    /**
     * Return all quotes for the given account as a Map keyed by symbol.
     */
    public static async GetQuotesMap(account: Account): Promise<Map<string, Quote>> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required for GetQuotesMap');
    }
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM Quotes WHERE AccountID = ?', [accountId]);
      const arr = rows as any[];
      const map = new Map<string, Quote>();
      if (!arr || arr.length === 0) return map;
      for (const r of arr) {
        const symbol = (r.Symbol ?? r.symbol ?? '').toString();
        map.set(symbol, super.mapQuoteRowToQuote(r));
      }
      return map;
    });
  }

    /**
     * Return the most recent LastUpdated value from the Quotes table, or null if no quotes exist.
     */
    public static async GetLatestQuoteUpdate(account?: Account | null): Promise<Date | null> {
      const accountId = account?.AccountID;
      return this.withConnection(async (conn) => {
        let query = 'SELECT MAX(LastUpdated) AS LastUpdated FROM Quotes';
        const params: any[] = [];
        
        if (accountId != null) {
          query += ' WHERE AccountID = ?';
          params.push(accountId);
        }

        const [rows] = await conn.query(query, params);
        const arr = rows as any[];
        if (!arr || arr.length === 0) return null;
        const v = arr[0].LastUpdated;
        if (!v) return null;
        return v instanceof Date ? v : new Date(v);
      });
    }

    /**
     * Update all open trades (`Closed = 0`) from the latest `Quotes`.
     * For each trade the method:
     * - LEFT JOINs `Quotes` on `Symbol`.
     * - If no quote exists: sets `CurrentPrice`, `UnrealizedGain`, `TotalGain`, `TotalGainPct`, and `WinningTrade` to NULL.
    * - If a quote exists: sets `CurrentPrice` to the quote price, `UnrealizedGain` to
    *   `OpenQuantity * (quotePrice - BreakEvenPrice)` with trade direction applied,
    *   and `TotalGain` to `UnrealizedGain + RealizedGain`.
     *   `TotalGainPct` is TotalGain / LargestRisk (NULL if LargestRisk is missing/zero).
     *   `WinningTrade` is true when TotalGain >= 0, otherwise false.
     * 
     *  This mirrors the logic in `Trade.CreateOpenTradeFromOrders` for calculating open trade values.
     *  Note: any changes here should also be reflected there.
     * 
     *  To prevent deadlocks when multiple accounts update in parallel, this method
     *  acquires shared locks on Quotes first, then updates Trades. This ensures
     *  consistent lock ordering across concurrent operations.
     */
    public static async UpdateOpenTradesWithLatestQuotes(account: Account): Promise<void> {
      const accountId = account?.AccountID;
      if (accountId == null) {
        throw new Error('Account.AccountID is required for UpdateOpenTradesWithLatestQuotes');
      }
      return this.withConnection(async (conn) => {
        // First, acquire shared locks on all quotes for this account to prevent deadlocks
        // This ensures consistent lock ordering: Quotes first, then Trades
        await conn.query('SELECT 1 FROM Quotes WHERE AccountID = ? FOR SHARE', [accountId]);

        const unrealizedExpr = 't.OpenQuantity * (q.Price - t.BreakEvenPrice) * CASE WHEN t.LongTrade THEN 1 ELSE -1 END';
        const totalGainExpr = `${unrealizedExpr} + COALESCE(t.RealizedGain, 0)`;

        // Join to account-scoped quotes for this account
        const joinClause = 'LEFT JOIN Quotes AS q ON t.Symbol = q.Symbol AND q.AccountID = ' + conn.escape(accountId);

        const sql = `
          UPDATE Trades AS t
          ${joinClause}
          SET
            -- UnrealizedGain: OpenQuantity * (CurrentPrice - BreakEvenPrice) with trade direction
            t.UnrealizedGain   = CASE WHEN q.Price IS NULL THEN NULL ELSE ${unrealizedExpr} END,

            -- TotalGain: UnrealizedGain + RealizedGain
            t.TotalGain        = CASE WHEN q.Price IS NULL THEN NULL ELSE ${totalGainExpr} END,

            -- TotalGainPct: gain / LargestRisk (NULL if LargestRisk missing or zero)
            t.TotalGainPct     = CASE
                              WHEN q.Price IS NULL THEN NULL
                              WHEN t.LargestRisk IS NULL OR t.LargestRisk = 0 THEN NULL
                              ELSE (${totalGainExpr}) / t.LargestRisk
                            END,

            -- WinningTrade: true when gain >= 0
            t.WinningTrade = CASE
                              WHEN q.Price IS NULL THEN NULL
                              WHEN (${totalGainExpr}) >= 0 THEN 1
                              ELSE 0
                            END,

            -- Set current price to latest quote price
            t.CurrentPrice   = CASE WHEN q.Price IS NULL THEN NULL ELSE q.Price END,

            -- CurrentCost: OpenQuantity * BreakEvenPrice (always positive, direction indicated by LongTrade)
            t.CurrentCost = CASE WHEN t.OpenQuantity IS NOT NULL AND t.BreakEvenPrice IS NOT NULL
                              THEN t.OpenQuantity * t.BreakEvenPrice
                              ELSE NULL
                            END,

            -- CurrentValue: OpenQuantity * CurrentPrice (always positive, direction indicated by LongTrade)
            t.CurrentValue = CASE WHEN t.OpenQuantity IS NOT NULL AND q.Price IS NOT NULL
                              THEN t.OpenQuantity * q.Price
                              ELSE NULL
                            END

          WHERE t.Closed = 0 AND t.AccountID = ${conn.escape(accountId)}
        `;

        await conn.query(sql);
      });
    }

  // ==========================
  // Instruments
  // ==========================

  /**
   * Insert a list of Instrument records into the Instruments table if an
   * identical row does not already exist. Matches on all fields using
   * NULL-safe comparison.
   * Note: the same symbol may be inserted more then once if it has different
   * descriptions. That's ok.
   */
  public static async InsertInstruments(instruments: Instrument[]): Promise<void> {
    if (!instruments || instruments.length === 0) return;

    return this.withConnection(async (conn) => {
      for (const ins of instruments) {
        if (!ins) continue; // skip null/undefined entries
        // Skip instruments with a null Symbol and log a warning
        if (ins.Symbol === null || typeof ins.Symbol === 'undefined') {
          console.warn(`InsertInstruments: skipping instrument with null symbol (Cusip=${ins.Cusip ?? ''}, Description=${ins.Description ?? ''})`);
          continue;
        }

        // Insert a new row only if an exact match (all fields equal, NULL-safe) does not already exist.
        // Uses NULL-safe <=> operator so NULLs compare correctly.
        const sql = `INSERT INTO Instruments (Symbol, Cusip, Description)
                     SELECT ?, ?, ? FROM DUAL
                     WHERE NOT EXISTS (
                       SELECT 1 FROM Instruments i
                       WHERE i.Symbol <=> ? AND i.Cusip <=> ? AND i.Description <=> ?
                     )`;

        const params = [ins.Symbol, ins.Cusip ?? null, ins.Description ?? null, ins.Symbol, ins.Cusip ?? null, ins.Description ?? null];
        await conn.query(sql, params);
      }
    });
  }

  /**
   * Find instruments matching any non-null field of the provided Instrument object.
   * The search uses OR between each non-null field.
   */
  public static async FindInstrument(example: Instrument): Promise<Instrument[]> {
    if (!example) return [];

    const criteria: string[] = [];
    const params: any[] = [];

    if (typeof example.Symbol !== 'undefined' && example.Symbol !== null) {
      criteria.push('Symbol = ?');
      params.push(example.Symbol);
    }
    if (typeof example.Cusip !== 'undefined' && example.Cusip !== null) {
      criteria.push('Cusip = ?');
      params.push(example.Cusip);
    }
    if (typeof example.Description !== 'undefined' && example.Description !== null) {
      criteria.push('Description = ?');
      params.push(example.Description);
    }

    if (criteria.length === 0) {
      return [];
    }

    return this.withConnection(async (conn) => {
      const where = '(' + criteria.join(' OR ') + ')';
      const sql = `SELECT * FROM Instruments WHERE ${where} ORDER BY Symbol ASC`;
      const [rows] = await conn.query(sql, params);
      const arr = rows as any[];
      if (!arr || arr.length === 0) return [];
      return arr.map(r => new Instrument((r.Symbol ?? r.symbol ?? '').toString(), (r.Cusip ?? r.cusip ?? null), (r.Description ?? r.description ?? '').toString()));
    });
  }

  // ==========================
  // Trade History
  // ==========================

  /**
   * Get trades that are either open or recently closed (at or after a specific date).
   * Used for rollup processing.
   */
  public static async GetTradesForRollup(account: Account, closedOnOrAfter: string): Promise<Trade[]> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }
    return this.withConnection(async (conn) => {
      // Convert Eastern Time date string to UTC datetime for comparison
      // closedOnOrAfter is a YYYY-MM-DD string in ET, but CloseDate is stored in UTC
      const { DateUtils } = require('../utils/DateUtils');
      const closedOnOrAfterUTC = DateUtils.GetEasternStartOfDayUTC(closedOnOrAfter);
      
      const [rows] = await conn.query(
        `SELECT * FROM Trades 
         WHERE AccountID = ? 
         AND (Closed = 0 OR CloseDate >= ?)
         ORDER BY TradeID ASC`,
        [accountId, this.formatDbDate(closedOnOrAfterUTC)]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }
      return arr.map(row => super.mapTradeRowToTrade(row));
    });
  }

  /**
   * Get a TradeHistory record for a specific trade, rollup period, and period end date.
   */
  public static async GetTradeHistoryForPeriod(
    accountId: number,
    tradeId: number,
    rollupPeriod: RollupPeriod,
    periodEnd: string
  ): Promise<TradeHistory | null> {
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        `SELECT * FROM TradeHistory 
         WHERE AccountID = ? AND TradeID = ? AND RollupPeriod = ? AND PeriodEnd = ?
         LIMIT 1`,
        [accountId, tradeId, rollupPeriod, periodEnd]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return null;
      }
      return super.mapRowToTradeHistory(arr[0]);
    });
  }

  /**
   * Upsert (insert or update) a TradeHistory record.
   */
  public static async UpsertTradeHistory(history: TradeHistory): Promise<void> {
    return this.withConnection(async (conn) => {
      await conn.query(
        `INSERT INTO TradeHistory 
         (AccountID, TradeID, RollupPeriod, PeriodEnd, PeriodGain, PeriodGainPct, TotalGain, TotalGainPct, CurrentValue, CurrentCost, CurrentPriceAtPeriodEnd, OpenQuantityAtPeriodEnd, BreakevenPriceAtPeriodEnd, RealizedGainAtPeriodEnd, UnrealizedGainAtPeriodEnd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           PeriodGain = VALUES(PeriodGain),
           PeriodGainPct = VALUES(PeriodGainPct),
           TotalGain = VALUES(TotalGain),
           TotalGainPct = VALUES(TotalGainPct),
           CurrentValue = VALUES(CurrentValue),
           CurrentCost = VALUES(CurrentCost),
           CurrentPriceAtPeriodEnd = VALUES(CurrentPriceAtPeriodEnd),
           OpenQuantityAtPeriodEnd = VALUES(OpenQuantityAtPeriodEnd),
           BreakevenPriceAtPeriodEnd = VALUES(BreakevenPriceAtPeriodEnd),
           RealizedGainAtPeriodEnd = VALUES(RealizedGainAtPeriodEnd),
           UnrealizedGainAtPeriodEnd = VALUES(UnrealizedGainAtPeriodEnd)`,
        [
          history.AccountID,
          history.TradeID,
          history.RollupPeriod,
          history.PeriodEnd,
          history.PeriodGain,
          history.PeriodGainPct,
          history.TotalGain,
          history.TotalGainPct,
          history.CurrentValue,
          history.CurrentCost,
          history.CurrentPriceAtPeriodEnd,
          history.OpenQuantityAtPeriodEnd,
          history.BreakevenPriceAtPeriodEnd,
          history.RealizedGainAtPeriodEnd,
          history.UnrealizedGainAtPeriodEnd
        ]
      );
    });
  }

  // ==========================
  // Expected Moves
  // ==========================

  /**
   * Return list of symbols in the ExpectedMoveSymbols table ordered by Symbol
   */
  public static async GetExpectedMoveSymbols(): Promise<string[]> {
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query('SELECT Symbol FROM ExpectedMoveSymbols ORDER BY Symbol');
      const arr = rows as any[];
      if (!arr || arr.length === 0) return [];
      return arr.map(r => (r.Symbol ?? r.symbol ?? '').toString()).filter(s => s.length > 0);
    });
  }

  /**
   * Get the current InitialValue expected move for a symbol and expiry type (InitialValue = 1).
   */
  public static async GetInitialExpectedMove(symbol: string, expiryType: string): Promise<ExpectedMove | null> {
    if (!symbol) throw new Error('symbol is required');
    if (!expiryType) throw new Error('expiryType is required');

    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        `SELECT * FROM ExpectedMoves WHERE Symbol = ? AND ExpiryType = ? AND InitialValue = 1 LIMIT 1`,
        [symbol, expiryType]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0) return null;
      return super.mapRowToExpectedMove(arr[0]);
    });
  }

  /**
   * Upsert an ExpectedMove row with the provided InitialValue flag.
   */
  public static async UpsertExpectedMove(expected: ExpectedMove, initialValue: boolean): Promise<void> {
    if (!expected) throw new Error('expected is required');
    if (!expected.Symbol) throw new Error('expected.Symbol is required');
    if (!expected.ExpiryType) throw new Error('expected.ExpiryType is required');

    return this.withConnection(async (conn) => {
      const sql = `INSERT INTO ExpectedMoves (
        Symbol,
        ExpiryType,
        InitialValue,
        ExpiryDate,
        IV,
        ClosingPrice,
        Delta,
        OneSigmaHigh,
        OneSigmaLow,
        TwoSigmaHigh,
        TwoSigmaLow,
        LastUpdated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        ExpiryDate = VALUES(ExpiryDate),
        IV = VALUES(IV),
        ClosingPrice = VALUES(ClosingPrice),
        Delta = VALUES(Delta),
        OneSigmaHigh = VALUES(OneSigmaHigh),
        OneSigmaLow = VALUES(OneSigmaLow),
        TwoSigmaHigh = VALUES(TwoSigmaHigh),
        TwoSigmaLow = VALUES(TwoSigmaLow),
        LastUpdated = VALUES(LastUpdated)`;

      const params = [
        expected.Symbol,
        expected.ExpiryType,
        this.formatDbBool(initialValue),
        DateUtils.formatDateOnly(expected.ExpiryDate),
        expected.IV != null ? expected.IV : null,
        expected.ClosingPrice != null ? expected.ClosingPrice : null,
        expected.Delta != null ? expected.Delta : null,
        expected.OneSigmaHigh != null ? expected.OneSigmaHigh : null,
        expected.OneSigmaLow != null ? expected.OneSigmaLow : null,
        expected.TwoSigmaHigh != null ? expected.TwoSigmaHigh : null,
        expected.TwoSigmaLow != null ? expected.TwoSigmaLow : null,
        this.formatDbDate(expected.LastUpdated)
      ];

      await conn.query(sql, params);
    });
  }


  // ==========================
  // Place Orders
  // ==========================

  /**
   * Return all PlaceOrder rows ordered by AccountID ascending.
   */
  public static async GetAllPlaceOrders(): Promise<import('../interfaces/PlaceOrder').PlaceOrder[]> {
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query(
        `SELECT * FROM PlaceOrder ORDER BY AccountID ASC`
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0) return [];
      return arr.map(r => this.mapRowToPlaceOrder(r));
    });
  }

  /**
   * Return distinct symbols for PlaceOrder rows for the given account.
   */
  public static async GetPlaceOrderSymbols(account: Account): Promise<string[]> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required');
    }

    return this.withConnection(async (conn) => {
      const [rows] = await conn.query('SELECT DISTINCT(Symbol) AS Symbol FROM PlaceOrder WHERE AccountID = ?', [accountId]);
      const arr = rows as any[];
      if (!arr || arr.length === 0) return [];
      return arr.map(r => (r.Symbol ?? r.symbol ?? '').toString());
    });
  }

  /**
   * Insert a new PlaceOrder row or update an existing one.
   * If `placeOrder.PlaceOrderID` is provided the row will be updated, otherwise a new row will be inserted.
   */
  public static async UpsertPlaceOrder(placeOrder: import('../interfaces/PlaceOrder').PlaceOrder): Promise<void> {
    if (!placeOrder) throw new Error('placeOrder is required');
    if (!placeOrder.AccountID) throw new Error('placeOrder.AccountID is required');

    return this.withConnection(async (conn) => {
      // If PlaceOrderID present, perform an update
      if (placeOrder.PlaceOrderID != null) {
        await conn.query(
          `UPDATE PlaceOrder SET
             AccountID = ?,
             BrokerOrderID = ?,
             Symbol = ?,
             Action = ?,
             Price = ?,
             Quantity = ?,
             OrderAmount = ?,
             OrderStatus = ?,
             LastUpdated = ?
           WHERE PlaceOrderID = ?`,
          [
            placeOrder.AccountID,
            placeOrder.BrokerOrderID ?? null,
            placeOrder.Symbol,
            placeOrder.Action.GetActionType(),
            placeOrder.Price,
            placeOrder.Quantity,
            placeOrder.OrderAmount,
            placeOrder.Status ?? null,
            placeOrder.LastUpdated ? this.formatDbDate(placeOrder.LastUpdated) : this.formatDbDate(new Date()),
            placeOrder.PlaceOrderID
          ]
        );
      } else {
        const [result] = await conn.query(
          `INSERT INTO PlaceOrder (AccountID, BrokerOrderID, Symbol, Action, Price, Quantity, OrderAmount, OrderStatus, LastUpdated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            placeOrder.AccountID,
            placeOrder.BrokerOrderID ?? null,
            placeOrder.Symbol,
            placeOrder.Action.GetActionType(),
            placeOrder.Price,
            placeOrder.Quantity,
            placeOrder.OrderAmount,
            placeOrder.Status ?? null,
            placeOrder.LastUpdated ? this.formatDbDate(placeOrder.LastUpdated) : this.formatDbDate(new Date())
          ]
        );
        // Set generated ID on the object for convenience
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insertId = (result as any)?.insertId;
        if (insertId) placeOrder.PlaceOrderID = insertId;
      }
    });
  }

  /**
   * Delete a PlaceOrder row.
   */
  public static async DeletePlaceOrder(placeOrder: import('../interfaces/PlaceOrder').PlaceOrder): Promise<void> {
    if (!placeOrder) throw new Error('placeOrder is required');
    if (!placeOrder.PlaceOrderID) throw new Error('placeOrder.PlaceOrderID is required for delete');

    return this.withConnection(async (conn) => {
      await conn.query('DELETE FROM PlaceOrder WHERE PlaceOrderID = ?', [placeOrder.PlaceOrderID]);
    });
  }

  /**
   * Delete all PlaceOrder rows where OrderStatus is EXECUTED.
   */
  public static async DeleteExecutedPlaceOrders(): Promise<void> {
    return this.withConnection(async (conn) => {
      await conn.query("DELETE FROM PlaceOrder WHERE OrderStatus = 'EXECUTED'");
    });
  }

  /**
   * Delete all trades for the given account. Useful for test cleanup.
   */
  public static async DeleteAllTrades(account: Account): Promise<void> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required for DeleteAllTrades');
    }
    return this.withConnection(async (conn) => {
      await conn.query('DELETE FROM Trades WHERE AccountID = ?', [accountId]);
    });
  }

  /**
   * Delete all quotes for the given account. Useful for test cleanup.
   */
  public static async DeleteAllQuotes(account: Account): Promise<void> {
    const accountId = account?.AccountID;
    if (accountId == null) {
      throw new Error('Account.AccountID is required for DeleteAllQuotes');
    }
    return this.withConnection(async (conn) => {
      await conn.query('DELETE FROM Quotes WHERE AccountID = ?', [accountId]);
    });
  }

  /**
   * Get the maximum ExecutedTime from Orders for the given account.
   * Returns null if no orders exist.
   */
  public async GetMaxOrderExecutedTime(accountId: number): Promise<Date | null> {
    return DataAccess.withConnection(async (conn) => {
      const [rows] = await conn.query(
        'SELECT MAX(ExecutedTime) as MaxDate FROM Orders WHERE AccountID = ?',
        [accountId]
      );
      const arr = rows as any[];
      if (!arr || arr.length === 0 || !arr[0].MaxDate) return null;
      return new Date(arr[0].MaxDate);
    });
  }

}
