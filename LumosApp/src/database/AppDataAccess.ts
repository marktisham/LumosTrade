/**
 * App-specific data access for UI queries. Extends DataAccessBase with methods that return
 * UI-friendly models (SymbolGroup, Trade, AccountHistory, etc.). Accepts filter objects
 * (e.g., TradeFilter, OrderFilter) from the frontend and returns display-ready rows.
 */

import { DataAccessBase, Trade, Order, Account, AccountHistory, SymbolGroup, Milestone, TradeHistory, RollupPeriod } from 'lumostrade';
import { TradeFilter } from './TradeFilter';
import { OrderFilter } from './OrderFilter';
import { BalanceFilter } from './BalanceFilter';
import { AccountHistoryFilter } from './AccountHistoryFilter';
import { SymbolGroupFilter } from './SymbolGroupFilter';
import { MilestoneFilter } from './MilestoneFilter';
import { TradeHistoryFilter } from './TradeHistoryFilter';
import { ExpectedMovesFilter } from './ExpectedMovesFilter';

export type ExpectedMoveRow = {
  Symbol: string;
  ExpiryType: string;
  ExpiryDate: string;
  CurrentPrice?: number | null;
  IV: number;
  ClosingPrice: number;
  Delta: number;
  OneSigmaHigh: number;
  OneSigmaLow: number;
  TwoSigmaHigh: number;
  TwoSigmaLow: number;
  LastUpdated: string;
  QuoteLastUpdated?: Date | null;
};

export class AppDataAccess extends DataAccessBase {
  /**
   * Return symbol groups matching the filter (empty array if none).
   */
  public static async GetSymbolGroups(filter?: SymbolGroupFilter): Promise<SymbolGroup[]> {
    // Support no-arg callers by creating a default filter when needed
    const effectiveFilter = filter ?? new SymbolGroupFilter('Name', 'asc', '');
    return this.withConnection(async (conn) => {
      const whereClause = effectiveFilter.getWhereClause();
      const orderByClause = effectiveFilter.getOrderByClause();
      const query = `SELECT * FROM SymbolGroups ${whereClause} ORDER BY ${orderByClause}`;

      const params: any[] = [];
      if (effectiveFilter.searchText && effectiveFilter.searchText.trim() !== '') {
        const term = `%${effectiveFilter.searchText.trim()}%`;
        params.push(term, term);
      }

      const [rows] = await conn.query(query, params);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }

      return arr.map(row => super.mapRowToSymbolGroup(row));
    });
  }



  // ==========================
  // Symbol Groups
  // ==========================

  public static async GetSymbolGroup(id: number): Promise<SymbolGroup | null> {
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM SymbolGroups WHERE ID = ?', [id]);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return null;
      }
      return super.mapRowToSymbolGroup(arr[0]);
    });
  }

  public static async UpdateSymbolGroup(symbolGroup: SymbolGroup): Promise<void> {
    if (!symbolGroup.ID) {
      throw new Error('SymbolGroup ID is required for update');
    }
    return this.withConnection(async (conn) => {
      await conn.query(
        `UPDATE SymbolGroups SET Symbols = ?, Name = ?, RollupGroup = ? WHERE ID = ?`,
        [
          symbolGroup.Symbols,
          symbolGroup.Name,
          DataAccessBase.formatDbBool(symbolGroup.RollupGroup),
          symbolGroup.ID
        ]
      );
    });
  }

  public static async AddSymbolGroup(symbolGroup: SymbolGroup): Promise<SymbolGroup> {
    if (symbolGroup.ID != null) {
      throw new Error('SymbolGroup ID must be null for insert');
    }
    return this.withConnection(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO SymbolGroups (Symbols, Name, RollupGroup) VALUES (?, ?, ?)`,
        [
          symbolGroup.Symbols,
          symbolGroup.Name,
          DataAccessBase.formatDbBool(symbolGroup.RollupGroup)
        ]
      );

      const insertResult = result as any;
      const insertId = insertResult && (insertResult.insertId || insertResult.insert_id || insertResult.insertID);
      if (!insertId) {
        throw new Error('SymbolGroup insert failed: no insertId returned');
      }
      symbolGroup.ID = insertId;
      return symbolGroup;
    });
  }

  public static async DeleteSymbolGroup(symbolGroup: SymbolGroup): Promise<void> {
    if (!symbolGroup.ID) {
      throw new Error('SymbolGroup ID is required for delete');
    }
    return this.withConnection(async (conn) => {
      await conn.query('DELETE FROM SymbolGroups WHERE ID = ?', [symbolGroup.ID]);
    });
  }

  /**
   * Return trades matching the provided filter. Supports grouping by symbol group and
   * special handling for BrokerID and AccountID sorts.
   */
  public static async GetTrades(filter: TradeFilter): Promise<Trade[]> {
    return this.withConnection(async (conn) => {
      if ((filter as any).groupBy === 'symbolGroup') {
        // Get WHERE clause but exclude symbol filtering (we'll handle it in HAVING)
        const filterCopy = Object.assign(Object.create(Object.getPrototypeOf(filter)), filter);
        const symbolsToFilter = filterCopy.symbols;
        const symbolToFilter = filterCopy.symbol;
        filterCopy.symbols = null;
        filterCopy.symbol = null;
        const whereClause : string = filterCopy.getWhereClause('t');
        
        let orderByClause: string = filter.getOrderByClause('t', true);
        if (filter.sortColumn === 'BrokerID') {
          orderByClause = `b.Name ${filter.sortDirection.toUpperCase()}, a.Name ${filter.sortDirection.toUpperCase()}`;
        } else if (filter.sortColumn === 'AccountID') {
          orderByClause = `a.Name ${filter.sortDirection.toUpperCase()}`;
        }
        
        // Build HAVING clause for symbol group filtering
        let havingClause = '';
        if (symbolsToFilter && symbolsToFilter.length > 0) {
          const quotedSymbols = symbolsToFilter.map((s: string) => `'${s}'`).join(',');
          havingClause = `HAVING Symbol IN (${quotedSymbols})`;
        } else if (symbolToFilter) {
          havingClause = `HAVING Symbol = '${symbolToFilter}'`;
        }
        
        const query = `
          SELECT 
            CASE WHEN MAX(sg.Name) IS NOT NULL THEN NULL ELSE MAX(t.TradeID) END AS TradeID,
            t.AccountID,
            a.BrokerID,
            COALESCE(sg.Name, t.Symbol) AS Symbol,
            t.LongTrade,
            CASE WHEN SUM(CASE WHEN t.TotalGain IS NOT NULL THEN t.TotalGain ELSE 0 END) > 0 THEN 1 ELSE 0 END AS WinningTrade,
            MIN(t.OpenDate) AS OpenDate,
            MAX(t.CloseDate) AS CloseDate,
            MAX(t.DurationMS) AS DurationMS,
            CASE WHEN SUM(CASE WHEN t.Closed = 0 THEN 1 ELSE 0 END) > 0 THEN 0 ELSE 1 END AS Closed,
            SUM(t.OpenQuantity) AS OpenQuantity,
            CASE WHEN SUM(t.OpenQuantity) > 0 THEN SUM(t.BreakEvenPrice * t.OpenQuantity) / SUM(t.OpenQuantity) ELSE 0 END AS BreakEvenPrice,
            CASE WHEN SUM(t.OpenQuantity) > 0 AND SUM(CASE WHEN t.CurrentPrice IS NOT NULL THEN t.OpenQuantity ELSE 0 END) > 0 
                 THEN SUM(CASE WHEN t.CurrentPrice IS NOT NULL THEN t.CurrentPrice * t.OpenQuantity ELSE 0 END) / SUM(CASE WHEN t.CurrentPrice IS NOT NULL THEN t.OpenQuantity ELSE 0 END)
                 ELSE NULL END AS CurrentPrice,
            SUM(t.CurrentCost) AS CurrentCost,
            SUM(t.CurrentValue) AS CurrentValue,
            SUM(CASE WHEN t.TotalGain IS NOT NULL THEN t.TotalGain ELSE 0 END) AS TotalGain,
            CASE WHEN SUM(ABS(t.CurrentCost)) > 0 THEN SUM(CASE WHEN t.TotalGain IS NOT NULL THEN t.TotalGain ELSE 0 END) / SUM(ABS(t.CurrentCost)) ELSE NULL END AS TotalGainPct,
            SUM(ABS(t.LargestRisk)) AS LargestRisk,
            SUM(t.TotalFees) AS TotalFees,
            SUM(t.TotalOrderCount) AS TotalOrderCount,
            MAX(CASE WHEN t.ManuallyAdjusted = 1 THEN 1 ELSE 0 END) AS ManuallyAdjusted,
            MAX(q.LastUpdated) AS CurrentPriceDateTime,
            SUM(CASE WHEN t.RealizedGain IS NOT NULL THEN t.RealizedGain ELSE 0 END) AS RealizedGain,
            SUM(CASE WHEN t.UnrealizedGain IS NOT NULL THEN t.UnrealizedGain ELSE 0 END) AS UnrealizedGain,
            CASE WHEN SUM(t.OpenQuantity) > 0 THEN SUM(CASE WHEN t.AvgEntryPrice IS NOT NULL THEN t.AvgEntryPrice * t.OpenQuantity ELSE 0 END) / SUM(t.OpenQuantity) ELSE NULL END AS AvgEntryPrice,
            CASE WHEN SUM(t.OpenQuantity) > 0 THEN SUM(CASE WHEN t.AvgExitPrice IS NOT NULL THEN t.AvgExitPrice * t.OpenQuantity ELSE 0 END) / SUM(t.OpenQuantity) ELSE NULL END AS AvgExitPrice,
            a.Name AS AccountName,
            b.Name AS BrokerName
          FROM Trades t
          INNER JOIN Accounts a ON t.AccountID = a.AccountID AND a.Closed = 0
          INNER JOIN Brokers b ON a.BrokerID = b.BrokerID
          LEFT JOIN Quotes q ON t.Symbol = q.Symbol AND t.AccountID = q.AccountID
          LEFT JOIN SymbolGroups sg ON FIND_IN_SET(t.Symbol, REPLACE(sg.Symbols, ' ', '')) > 0 AND sg.RollupGroup = 1
          ${whereClause}
          GROUP BY t.AccountID, a.BrokerID, COALESCE(sg.Name, t.Symbol), t.LongTrade
          ${havingClause}
          ORDER BY ${orderByClause}`;
        const [rows] = await conn.query(query);
        const arr = rows as any[];
        if (!arr || arr.length === 0) {
          return [];
        }
        return arr.map(row => super.mapTradeRowToTrade(row));
      }
      const whereClause : string = filter.getWhereClause('t');
      let orderByClause: string = filter.getOrderByClause('t');
      
      // Handle sort by broker/account names when those columns are selected
      if (filter.sortColumn === 'BrokerID') {
        orderByClause = `b.Name ${filter.sortDirection.toUpperCase()}, a.Name ${filter.sortDirection.toUpperCase()}`;
      } else if (filter.sortColumn === 'AccountID') {
        orderByClause = `a.Name ${filter.sortDirection.toUpperCase()}`;
      }
      
      const query = `SELECT t.*, a.Name AS AccountName, a.BrokerID, b.Name AS BrokerName, q.LastUpdated AS CurrentPriceDateTime
           FROM Trades t
           INNER JOIN Accounts a ON t.AccountID = a.AccountID AND a.Closed = 0
           INNER JOIN Brokers b ON a.BrokerID = b.BrokerID
           LEFT JOIN Quotes q ON t.Symbol = q.Symbol AND t.AccountID = q.AccountID
           ${whereClause}
           ORDER BY ${orderByClause}`;
      
      const [rows] = await conn.query(query);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }
      
      return arr.map(row => super.mapTradeRowToTrade(row));
    });
  }

  /**
   * Return orders matching the provided filter. Includes trade close date when available.
   */
  public static async GetOrders(filter: OrderFilter): Promise<Order[]> {
    return this.withConnection(async (conn) => {
      const whereClause = filter.getWhereClause('o');
      let orderByClause: string;
      
      // Handle special sorts that require account/broker names
      if (filter.sortColumn === 'AccountID') {
        orderByClause = `a.Name ${filter.sortDirection.toUpperCase()}`;
      } else if (filter.sortColumn === 'BrokerID') {
        // When sorting by broker, do secondary sort on account name
        orderByClause = `b.Name ${filter.sortDirection.toUpperCase()}, a.Name ${filter.sortDirection.toUpperCase()}`;
      } else {
        orderByClause = filter.getOrderByClause();
      }
      
      // Always join with Accounts and Brokers to get BrokerID and names
      const query = `SELECT o.*, a.BrokerID, t.CloseDate AS TradeCloseDate FROM Orders o 
                 INNER JOIN Accounts a ON o.AccountID = a.AccountID AND a.Closed = 0
                 INNER JOIN Brokers b ON a.BrokerID = b.BrokerID
                 LEFT JOIN Trades t ON o.TradeID = t.TradeID
                 ${whereClause} 
                 ORDER BY ${orderByClause}`;
      
      const [rows] = await conn.query(query);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }
      return arr.map(row => {
        const order = super.mapOrderRowToOrder(row) as any;
        // Preserve BrokerID from the joined Accounts table
        order.BrokerID = row.BrokerID;
        return order;
      });
    });
  }

  /**
   * Return the most recent AccountHistory for each Account for a specific period.
   * Returns an array of tuples containing Account and its AccountHistory for the specified period (or null if none exists).
   * Uses the rollup period and period end date to query the appropriate AccountHistory records.
   */
  public static async GetMostRecentAccountHistory(filter: BalanceFilter): Promise<Array<{ account: Account; balance: AccountHistory | null }>> {
    return this.withConnection(async (conn) => {
      const orderByClause: string = filter.getOrderByClause();
      
      // Build the period constraint for matching records
      let periodConstraint = '';
      const queryParams: any[] = [];
      if (filter.periodEnd) {
        periodConstraint = ' AND ab.PeriodEnd = ? AND ab.RollupPeriod = ?';
        queryParams.push(filter.periodEnd, filter.rollupPeriod);
      } else {
        // No period specified, get the most recent entry for each account at the requested rollup level
        periodConstraint = ` AND ab.RollupPeriod = ? AND ab.PeriodEnd = (
            SELECT MAX(ab2.PeriodEnd)
            FROM AccountHistory ab2
            WHERE ab2.AccountID = a.AccountID AND ab2.RollupPeriod = ?
          )`;
        queryParams.push(filter.rollupPeriod, filter.rollupPeriod);
      }
      
      // Add broker filter if provided
      let brokerWhere = '';
      if ((filter as any).brokerId != null) {
        brokerWhere = ' AND a.BrokerID = ?';
      }

      const query = `
        SELECT 
          a.*, b.BrokerID AS b_BrokerID, b.Name AS b_Name,
          ab.AccountID AS ab_AccountID,
          ab.PeriodEnd AS ab_PeriodEnd,
          ab.Balance AS ab_Balance,
          ab.TransferAmount AS ab_TransferAmount,
          ab.TransferDescription AS ab_TransferDescription,
          ab.BalanceUpdateTime AS ab_BalanceUpdateTime,
          ab.BalanceChangeAmount AS ab_BalanceChangeAmount,
          ab.BalanceChangePct AS ab_BalanceChangePct,
          ab.InvestedAmount AS ab_InvestedAmount,
          ab.NetGain AS ab_NetGain,
          ab.NetGainPct AS ab_NetGainPct,
          ab.OrdersExecuted AS ab_OrdersExecuted,
          ab.RollupPeriod AS ab_RollupPeriod,
          ab.Comment AS ab_Comment,
          -- Compute drawdown from ATH for the selected period (use NULL if no balance or no ATH exists)
          CASE WHEN ab.Balance IS NULL OR a.AllTimeHigh IS NULL THEN NULL ELSE (a.AllTimeHigh - ab.Balance) END AS a_DrawdownFromATH,
          CASE WHEN ab.Balance IS NULL OR a.AllTimeHigh IS NULL OR a.AllTimeHigh = 0 THEN NULL ELSE ((a.AllTimeHigh - ab.Balance) / a.AllTimeHigh) END AS a_DrawdownPctFromATH,
          a.AllTimeHigh AS a_AllTimeHigh,
          a.AllTimeHighDate AS a_AllTimeHighDate,
          a.AllTimeHighRangeStart AS a_AllTimeHighRangeStart
        FROM Accounts a
        LEFT JOIN Brokers b ON a.BrokerID = b.BrokerID
        LEFT JOIN AccountHistory ab ON a.AccountID = ab.AccountID${periodConstraint}
        WHERE a.Closed = 0${brokerWhere}
        ORDER BY ${orderByClause}`;
      
      // If a broker filter is supplied, add it to params (it must be last before ORDER BY)
      if ((filter as any).brokerId != null) {
        queryParams.push((filter as any).brokerId);
      }

      const [rows] = await conn.query(query, queryParams);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }
      
      // Map rows to Account and AccountHistory pairs
      const results = arr.map(row => {
        const account = super.mapRowToAccount(row);
        // Expose broker info on the account object for UI use
        (account as any).BrokerID = row.b_BrokerID != null ? Number(row.b_BrokerID) : null;
        (account as any).BrokerName = row.b_Name ?? null;
        // Expose ATH fields from Accounts table
        (account as any).DrawdownFromATH = row.a_DrawdownFromATH != null ? Number(row.a_DrawdownFromATH) : null;
        (account as any).DrawdownPctFromATH = row.a_DrawdownPctFromATH != null ? Number(row.a_DrawdownPctFromATH) : null;
        (account as any).AllTimeHigh = row.a_AllTimeHigh != null ? Number(row.a_AllTimeHigh) : null;
        (account as any).AllTimeHighDate = row.a_AllTimeHighDate ? (row.a_AllTimeHighDate instanceof Date ? row.a_AllTimeHighDate : new Date(row.a_AllTimeHighDate)) : null;
        (account as any).AllTimeHighRangeStart = row.a_AllTimeHighRangeStart ? (row.a_AllTimeHighRangeStart instanceof Date ? row.a_AllTimeHighRangeStart : new Date(row.a_AllTimeHighRangeStart)) : null;
        
        // Check if there's a balance row (ab_AccountID will be null if no balance exists)
        let balance: AccountHistory | null = null;
        if (row.ab_AccountID != null) {
          // Create a temporary object with the AccountHistory fields
          const balanceRow = {
            AccountID: row.ab_AccountID,
            PeriodEnd: row.ab_PeriodEnd,
            Balance: row.ab_Balance,
            TransferAmount: row.ab_TransferAmount,
            TransferDescription: row.ab_TransferDescription,
            BalanceUpdateTime: row.ab_BalanceUpdateTime,
            BalanceChangeAmount: row.ab_BalanceChangeAmount,
            BalanceChangePct: row.ab_BalanceChangePct,
            InvestedAmount: row.ab_InvestedAmount,
            NetGain: row.ab_NetGain,
            NetGainPct: row.ab_NetGainPct,
            OrdersExecuted: row.ab_OrdersExecuted,
            RollupPeriod: row.ab_RollupPeriod,
            Comment: row.ab_Comment
          };
          balance = super.mapRowToAccountHistory(balanceRow);
        }
        
        return { account, balance };
      });
      
      return results;
    });
  }

  /**
   * Get account history for a specific account or all accounts.
   * If filter.accountId is null, returns history for all accounts aggregated.
   * If filter.accountId is set, returns history for that specific account.
   * Queries AccountHistory table directly using the RollupPeriod filter.
   */
  public static async GetAccountHistory(filter: AccountHistoryFilter): Promise<AccountHistory[]> {
    return this.withConnection(async (conn) => {
      const orderByClause: string = filter.getOrderByClause();
      
      let query: string;
      const queryParams: any[] = [];
      
      // Build WHERE clause for date filtering
      let dateWhere = 'WHERE RollupPeriod = ?';
      queryParams.push(filter.rollupPeriod);
      
      if (filter.startDate && filter.endDate) {
        dateWhere += ' AND PeriodEnd BETWEEN ? AND ?';
        queryParams.push(filter.startDate, filter.endDate);
      } else if (filter.startDate) {
        dateWhere += ' AND PeriodEnd >= ?';
        queryParams.push(filter.startDate);
      }
      
      if (filter.accountId !== null && filter.accountId !== undefined) {
        // Query specific account
        dateWhere += ' AND AccountID = ?';
        queryParams.push(filter.accountId);
        
        query = `
          SELECT 
            AccountID,
            PeriodEnd,
            Balance,
            OrdersExecuted,
            TransferAmount,
            TransferDescription,
            BalanceUpdateTime,
            BalanceChangeAmount,
            BalanceChangePct,
            InvestedAmount,
            NetGain,
            NetGainPct,
            RollupPeriod,
            Comment
          FROM AccountHistory
          ${dateWhere}
          ORDER BY ${orderByClause}`;
      } else {
            // Aggregate all accounts for each period. If a brokerId is specified, only include accounts for that broker.
            if (filter.brokerId != null) {
              dateWhere += ' AND a.BrokerID = ?';
              query = `
                SELECT
                  NULL AS AccountID,
                  ah.PeriodEnd AS PeriodEnd,
                  SUM(ah.Balance) AS Balance,
                  SUM(ah.OrdersExecuted) AS OrdersExecuted,
                  SUM(ah.TransferAmount) AS TransferAmount,
                  GROUP_CONCAT(DISTINCT ah.TransferDescription SEPARATOR ' | ') AS TransferDescription,
                  MAX(ah.BalanceUpdateTime) AS BalanceUpdateTime,
                  SUM(ah.BalanceChangeAmount) AS BalanceChangeAmount,
                  CASE WHEN (SUM(ah.Balance) - SUM(ah.BalanceChangeAmount)) = 0 THEN NULL 
                       ELSE SUM(ah.BalanceChangeAmount) / (SUM(ah.Balance) - SUM(ah.BalanceChangeAmount)) END AS BalanceChangePct,
                  SUM(ah.InvestedAmount) AS InvestedAmount,
                  SUM(ah.NetGain) AS NetGain,
                  CASE WHEN SUM(ah.InvestedAmount) = 0 THEN NULL 
                       ELSE SUM(ah.NetGain) / SUM(ah.InvestedAmount) END AS NetGainPct,
                  ah.RollupPeriod AS RollupPeriod,
                  NULL AS Comment
                FROM AccountHistory ah
                JOIN Accounts a ON ah.AccountID = a.AccountID
                ${dateWhere}
                GROUP BY ah.PeriodEnd, ah.RollupPeriod
                ORDER BY ${orderByClause}`;
              queryParams.push(filter.brokerId);
            } else {
              query = `
                SELECT
                  NULL AS AccountID,
                  PeriodEnd,
                  SUM(Balance) AS Balance,
                  SUM(OrdersExecuted) AS OrdersExecuted,
                  SUM(TransferAmount) AS TransferAmount,
                  GROUP_CONCAT(DISTINCT TransferDescription SEPARATOR ' | ') AS TransferDescription,
                  MAX(BalanceUpdateTime) AS BalanceUpdateTime,
                  SUM(BalanceChangeAmount) AS BalanceChangeAmount,
                  CASE WHEN (SUM(Balance) - SUM(BalanceChangeAmount)) = 0 THEN NULL 
                       ELSE SUM(BalanceChangeAmount) / (SUM(Balance) - SUM(BalanceChangeAmount)) END AS BalanceChangePct,
                  SUM(InvestedAmount) AS InvestedAmount,
                  SUM(NetGain) AS NetGain,
                  CASE WHEN SUM(InvestedAmount) = 0 THEN NULL 
                       ELSE SUM(NetGain) / SUM(InvestedAmount) END AS NetGainPct,
                  RollupPeriod,
                  NULL AS Comment
                FROM AccountHistory
                ${dateWhere}
                GROUP BY PeriodEnd, RollupPeriod
                ORDER BY ${orderByClause}`;
            }
      }
      
      const [rows] = await conn.query(query, queryParams);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }
      
      return arr.map(row => super.mapRowToAccountHistory(row));
    });
  }

  /**
   * Update the AllTimeHighRangeStart for a specific account.
   */
  public static async UpdateAccountAllTimeHighRangeStart(accountId: number, rangeStart: Date | null): Promise<void> {
    return this.withConnection(async (conn) => {
      await conn.query(
        'UPDATE Accounts SET AllTimeHighRangeStart = ? WHERE AccountID = ?',
        [rangeStart ? this.formatDbDate(rangeStart) : null, accountId]
      );
    });
  }

  // ==========================
  // Milestones
  // ==========================

  public static async GetMilestone(id: number): Promise<Milestone | null> {
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM Milestones WHERE ID = ?', [id]);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return null;
      }
      const row = arr[0];
      return new Milestone(
        row.DayStart,
        row.Name,
        row.AccountID,
        row.DayEnd,
        row.ID
      );
    });
  }

  public static async GetMilestones(filter?: MilestoneFilter): Promise<Milestone[]> {
    const effectiveFilter = filter ?? new MilestoneFilter();
    return this.withConnection(async (conn) => {
      const orderByClause = effectiveFilter.getOrderByClause('m');
      const query = `
        SELECT m.* 
        FROM Milestones m
        LEFT JOIN Accounts a ON m.AccountID = a.AccountID AND a.Closed = 0
        ORDER BY ${orderByClause}
      `;

      const [rows] = await conn.query(query);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }

      return arr.map(row => new Milestone(
        row.DayStart,
        row.Name,
        row.AccountID,
        row.DayEnd,
        row.ID
      ));
    });
  }

  public static async UpdateMilestone(milestone: Milestone): Promise<void> {
    if (!milestone.ID) {
      throw new Error('Milestone ID is required for update');
    }
    return this.withConnection(async (conn) => {
      await conn.query(
        `UPDATE Milestones SET AccountID = ?, DayStart = ?, DayEnd = ?, Name = ? WHERE ID = ?`,
        [
          milestone.AccountID,
          milestone.DayStart,
          milestone.DayEnd,
          milestone.Name,
          milestone.ID
        ]
      );
    });
  }

  public static async AddMilestone(milestone: Milestone): Promise<Milestone> {
    if (milestone.ID != null) {
      throw new Error('Milestone ID must be null for insert');
    }
    return this.withConnection(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO Milestones (AccountID, DayStart, DayEnd, Name) VALUES (?, ?, ?, ?)`,
        [
          milestone.AccountID,
          milestone.DayStart,
          milestone.DayEnd,
          milestone.Name
        ]
      );

      const insertResult = result as any;
      const insertId = insertResult && (insertResult.insertId || insertResult.insert_id || insertResult.insertID);
      if (!insertId) {
        throw new Error('Milestone insert failed: no insertId returned');
      }
      milestone.ID = insertId;
      return milestone;
    });
  }

  public static async DeleteMilestone(milestone: Milestone): Promise<void> {
    if (!milestone.ID) {
      throw new Error('Milestone ID is required for delete');
    }
    return this.withConnection(async (conn) => {
      await conn.query('DELETE FROM Milestones WHERE ID = ?', [milestone.ID]);
    });
  }

  // ==========================
  // Trade History
  // ==========================

  public static async GetTradeHistory(filter: TradeHistoryFilter): Promise<Array<TradeHistory & { AccountName: string; Symbol: string; Closed: boolean; BrokerID: number | null; BrokerName: string | null; AvgEntryPrice: number | null; AvgExitPrice: number | null; LongTrade: boolean | null; LargestRisk: number | null }>> {
    return this.withConnection(async (conn) => {
      // Handle symbol group grouping mode
      if (filter.groupBy === 'symbolGroup') {
        // Get WHERE clause but exclude symbol filtering (we'll handle it in HAVING)
        const symbolsToFilter = filter.symbols;
        const symbolToFilter = filter.symbol;
        filter.symbols = null;
        filter.symbol = null;
        const whereClause = filter.getWhereClause();
        const whereParams = filter.getWhereParams();
        filter.symbols = symbolsToFilter;
        filter.symbol = symbolToFilter;
        
        const orderByClause = filter.getOrderByClause(true, true);
        
        // Build HAVING clause for symbol group filtering
        let havingClause = '';
        const havingParams: any[] = [];
        if (symbolsToFilter && symbolsToFilter.length > 0) {
          const placeholders = symbolsToFilter.map(() => '?').join(', ');
          havingClause = `HAVING Symbol IN (${placeholders})`;
          havingParams.push(...symbolsToFilter);
        } else if (symbolToFilter) {
          havingClause = `HAVING Symbol = ?`;
          havingParams.push(symbolToFilter);
        }

        const query = `
          SELECT 
            NULL AS TradeHistoryID,
            th.AccountID,
            NULL AS TradeID,
            COALESCE(sg.Name, t.Symbol) AS Symbol,
            CASE WHEN SUM(CASE WHEN t.Closed = 0 THEN 1 ELSE 0 END) > 0 THEN 0 ELSE 1 END AS Closed,
            th.RollupPeriod,
            th.PeriodEnd,
            SUM(th.PeriodGain) AS PeriodGain,
            CASE WHEN SUM(ABS(th.CurrentCost)) > 0 THEN SUM(th.PeriodGain) / SUM(ABS(th.CurrentCost)) ELSE NULL END AS PeriodGainPct,
            SUM(th.TotalGain) AS TotalGain,
            CASE WHEN SUM(ABS(th.CurrentCost)) > 0 THEN SUM(th.TotalGain) / SUM(ABS(th.CurrentCost)) ELSE NULL END AS TotalGainPct,
            NULL AS LargestRisk,
            SUM(th.CurrentValue) AS CurrentValue,
            SUM(th.CurrentCost) AS CurrentCost,
            NULL AS AvgEntryPrice,
            NULL AS AvgExitPrice,
            NULL AS LongTrade,
            NULL AS CurrentPriceAtPeriodEnd,
            NULL AS OpenQuantityAtPeriodEnd,
            NULL AS BreakevenPriceAtPeriodEnd,
            SUM(th.RealizedGainAtPeriodEnd) AS RealizedGainAtPeriodEnd,
            SUM(th.UnrealizedGainAtPeriodEnd) AS UnrealizedGainAtPeriodEnd,
            a.Name AS AccountName,
            a.BrokerID AS BrokerID,
            b.Name AS BrokerName
          FROM TradeHistory th
          INNER JOIN Accounts a ON th.AccountID = a.AccountID AND a.Closed = 0
          LEFT JOIN Brokers b ON a.BrokerID = b.BrokerID
          INNER JOIN Trades t ON th.TradeID = t.TradeID
          LEFT JOIN SymbolGroups sg ON FIND_IN_SET(t.Symbol, REPLACE(sg.Symbols, ' ', '')) > 0 AND sg.RollupGroup = 1
          ${whereClause}
          GROUP BY th.AccountID, th.RollupPeriod, th.PeriodEnd, COALESCE(sg.Name, t.Symbol), a.Name, a.BrokerID, b.Name
          ${havingClause}
          ORDER BY ${orderByClause}
        `;

        const [rows] = await conn.query(query, [...whereParams, ...havingParams]);
        const arr = rows as any[];
        if (!arr || arr.length === 0) {
          return [];
        }

        return arr.map(row => ({
          TradeHistoryID: row.TradeHistoryID ?? null,
          AccountID: row.AccountID,
          TradeID: row.TradeID ?? null,
          RollupPeriod: row.RollupPeriod,
          PeriodEnd: row.PeriodEnd,
          PeriodGain: row.PeriodGain ?? null,
          PeriodGainPct: row.PeriodGainPct ?? null,
          TotalGain: row.TotalGain ?? null,
          TotalGainPct: row.TotalGainPct ?? null,
          LargestRisk: row.LargestRisk ?? null,
          CurrentValue: row.CurrentValue ?? null,
          CurrentCost: row.CurrentCost ?? null,
          AvgEntryPrice: row.AvgEntryPrice ?? null,
            AvgExitPrice: row.AvgExitPrice ?? null,
            LongTrade: row.LongTrade ?? null,
          CurrentPriceAtPeriodEnd: row.CurrentPriceAtPeriodEnd ?? null,
          OpenQuantityAtPeriodEnd: row.OpenQuantityAtPeriodEnd ?? null,
          BreakevenPriceAtPeriodEnd: row.BreakevenPriceAtPeriodEnd ?? null,
          RealizedGainAtPeriodEnd: row.RealizedGainAtPeriodEnd ?? null,
          UnrealizedGainAtPeriodEnd: row.UnrealizedGainAtPeriodEnd ?? null,
          AccountName: row.AccountName ?? '',
          Symbol: row.Symbol ?? '',
          Closed: !!row.Closed,
          BrokerID: row.BrokerID ?? null,
          BrokerName: row.BrokerName ?? null
        }));
      }

      // Default symbol-level query
      const whereClause = filter.getWhereClause();
      const whereParams = filter.getWhereParams();

      // Build SELECT clause based on optional column filter
      let selectClause = 'th.*';
      let includeJoins = true;
      
      if (filter.columns && filter.columns.length > 0) {
        // Optimize query by only selecting required columns
        const columnSet = new Set(filter.columns);
        const selectedCols: string[] = ['th.TradeHistoryID', 'th.AccountID', 'th.TradeID', 'th.RollupPeriod'];
        
        if (columnSet.has('PeriodEnd')) selectedCols.push('th.PeriodEnd');
        if (columnSet.has('CurrentValue')) selectedCols.push('th.CurrentValue');
        if (columnSet.has('CurrentCost')) selectedCols.push('th.CurrentCost');
        if (columnSet.has('AvgEntryPrice')) selectedCols.push('t.AvgEntryPrice AS AvgEntryPrice');
        if (columnSet.has('AvgExitPrice')) selectedCols.push('t.AvgExitPrice AS AvgExitPrice');
        if (columnSet.has('CurrentPriceAtPeriodEnd')) selectedCols.push('th.CurrentPriceAtPeriodEnd');
        if (columnSet.has('OpenQuantityAtPeriodEnd')) selectedCols.push('th.OpenQuantityAtPeriodEnd');
        if (columnSet.has('BreakevenPriceAtPeriodEnd')) selectedCols.push('th.BreakevenPriceAtPeriodEnd');
        if (columnSet.has('RealizedGainAtPeriodEnd')) selectedCols.push('th.RealizedGainAtPeriodEnd');
        if (columnSet.has('UnrealizedGainAtPeriodEnd')) selectedCols.push('th.UnrealizedGainAtPeriodEnd');
        if (columnSet.has('PeriodGain')) selectedCols.push('th.PeriodGain');
        if (columnSet.has('PeriodGainPct')) selectedCols.push('th.PeriodGainPct');
        if (columnSet.has('TotalGain')) selectedCols.push('th.TotalGain');
        if (columnSet.has('TotalGainPct')) selectedCols.push('th.TotalGainPct');
        if (columnSet.has('LargestRisk')) selectedCols.push('t.LargestRisk AS LargestRisk');
        
        // Always include Symbol and TradeID columns for charting
        if (columnSet.has('Symbol')) {
          selectedCols.push('t.Symbol AS Symbol');
        }
        
        selectClause = selectedCols.join(', ');
        includeJoins = columnSet.has('AccountName') || columnSet.has('BrokerName') || columnSet.has('Symbol');
      }
      
      const orderByClause = filter.getOrderByClause(includeJoins || !filter.columns);
      
      const accountJoin = includeJoins || !filter.columns ? 
        'INNER JOIN Accounts a ON th.AccountID = a.AccountID AND a.Closed = 0' : '';
      const brokerJoin = includeJoins || !filter.columns ? 
        'LEFT JOIN Brokers b ON a.BrokerID = b.BrokerID' : '';
      const tradeJoin = 'INNER JOIN Trades t ON th.TradeID = t.TradeID';
      
      const accountNameCol = includeJoins || !filter.columns ? 'a.Name AS AccountName,' : '';
      const brokerIdCol = includeJoins || !filter.columns ? 'a.BrokerID AS BrokerID,' : '';
      const brokerNameCol = includeJoins || !filter.columns ? 'b.Name AS BrokerName,' : '';
      const symbolCol = includeJoins || !filter.columns ? 't.Symbol AS Symbol,' : '';
      const avgEntryCol = includeJoins || !filter.columns ? 't.AvgEntryPrice AS AvgEntryPrice,' : '';
      const avgExitCol = includeJoins || !filter.columns ? 't.AvgExitPrice AS AvgExitPrice,' : '';
      const longTradeCol = includeJoins || !filter.columns ? 't.LongTrade AS LongTrade,' : '';
      const largestRiskCol = includeJoins || !filter.columns ? 't.LargestRisk AS LargestRisk,' : '';
      const closedCol = 'CAST(t.Closed AS UNSIGNED) AS Closed';

      const query = `
        SELECT 
          ${filter.columns && filter.columns.length > 0 ? selectClause : 'th.*'},
          ${accountNameCol}
          ${brokerIdCol}
          ${brokerNameCol}
          ${symbolCol}
          ${avgEntryCol}
          ${avgExitCol}
          ${longTradeCol}
          ${largestRiskCol}
          ${closedCol}
        FROM TradeHistory th
        ${accountJoin}
        ${brokerJoin}
        ${tradeJoin}
        ${whereClause}
        ORDER BY ${orderByClause}
      `;

      const [rows] = await conn.query(query, whereParams);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }

      return arr.map(row => ({
        TradeHistoryID: row.TradeHistoryID,
        AccountID: row.AccountID,
        TradeID: row.TradeID,
        RollupPeriod: row.RollupPeriod,
        PeriodEnd: row.PeriodEnd,
        PeriodGain: row.PeriodGain ?? null,
        PeriodGainPct: row.PeriodGainPct ?? null,
        TotalGain: row.TotalGain ?? null,
        TotalGainPct: row.TotalGainPct ?? null,
        LargestRisk: row.LargestRisk ?? null,
        CurrentValue: row.CurrentValue ?? null,
        CurrentCost: row.CurrentCost ?? null,
        AvgEntryPrice: row.AvgEntryPrice ?? null,
        AvgExitPrice: row.AvgExitPrice ?? null,
        LongTrade: row.LongTrade ?? null,
        CurrentPriceAtPeriodEnd: row.CurrentPriceAtPeriodEnd ?? null,
        OpenQuantityAtPeriodEnd: row.OpenQuantityAtPeriodEnd ?? null,
        BreakevenPriceAtPeriodEnd: row.BreakevenPriceAtPeriodEnd ?? null,
        RealizedGainAtPeriodEnd: row.RealizedGainAtPeriodEnd ?? null,
        UnrealizedGainAtPeriodEnd: row.UnrealizedGainAtPeriodEnd ?? null,
        AccountName: row.AccountName ?? '',
        Symbol: row.Symbol ?? '',
        Closed: !!row.Closed,
        BrokerID: row.BrokerID ?? null,
        BrokerName: row.BrokerName ?? null
      }));
    });
  }

  /**
   * Return expected moves matching the provided filter.
   * Left joins ExpectedMoveSymbols to ExpectedMoves on symbol.
   */
  public static async GetExpectedMoves(filter: ExpectedMovesFilter): Promise<ExpectedMoveRow[]> {
    return this.withConnection(async (conn) => {
      const orderByClause = filter.getOrderByClause('em');

      // Build WHERE conditions for the filter
      const conditions: string[] = [];
      const whereParams: any[] = [];
      
      // Filter by InitialValue - include NULL (no data) or matching rows
      if (filter.initialValue === 'initial') {
        conditions.push(`(em.Symbol IS NULL OR em.InitialValue = b'1')`);
      } else if (filter.initialValue === 'latest') {
        conditions.push(`(em.Symbol IS NULL OR em.InitialValue = b'0')`);
      }

      // Filter by ExpiryType - include NULL (no data) or rows with matching types
      if (filter.expiryTypes && filter.expiryTypes.length > 0) {
        const quotedTypes = filter.expiryTypes.map(t => `'${t}'`).join(',');
        conditions.push(`(em.Symbol IS NULL OR em.ExpiryType IN (${quotedTypes}))`);
      }

      // Filter by specific symbol (only include rows for that registered symbol)
      if (filter.symbol) {
        conditions.push(`ems.Symbol = ?`);
        whereParams.push(filter.symbol);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const query = `
        SELECT 
          ems.Symbol,
          em.ExpiryType,
          em.ExpiryDate,
          (SELECT q2.Price FROM Quotes q2 WHERE q2.Symbol = ems.Symbol ORDER BY q2.LastUpdated DESC LIMIT 1) AS CurrentPrice,
          em.IV,
          em.ClosingPrice,
          em.Delta,
          em.OneSigmaHigh,
          em.OneSigmaLow,
          em.TwoSigmaHigh,
          em.TwoSigmaLow,
          em.LastUpdated,
          (SELECT q3.LastUpdated FROM Quotes q3 WHERE q3.Symbol = ems.Symbol ORDER BY q3.LastUpdated DESC LIMIT 1) AS QuoteLastUpdated
        FROM ExpectedMoveSymbols ems
        LEFT JOIN ExpectedMoves em ON ems.Symbol = em.Symbol
        ${whereClause}
        ORDER BY ${orderByClause}
      `;

      const [rows] = await conn.query(query, whereParams);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }

      return arr.map(row => ({
        Symbol: row.Symbol,
        ExpiryType: row.ExpiryType || '',
        ExpiryDate: row.ExpiryDate ? new Date(row.ExpiryDate).toISOString().split('T')[0] : '',
        CurrentPrice: row.CurrentPrice != null ? parseFloat(row.CurrentPrice) : null,
        IV: row.IV ? parseFloat(row.IV) : 0,
        ClosingPrice: row.ClosingPrice ? parseFloat(row.ClosingPrice) : 0,
        Delta: row.Delta ? parseFloat(row.Delta) : 0,
        OneSigmaHigh: row.OneSigmaHigh ? parseFloat(row.OneSigmaHigh) : 0,
        OneSigmaLow: row.OneSigmaLow ? parseFloat(row.OneSigmaLow) : 0,
        TwoSigmaHigh: row.TwoSigmaHigh ? parseFloat(row.TwoSigmaHigh) : 0,
        TwoSigmaLow: row.TwoSigmaLow ? parseFloat(row.TwoSigmaLow) : 0,
        LastUpdated: row.LastUpdated ? new Date(row.LastUpdated).toISOString() : '',
        QuoteLastUpdated: row.QuoteLastUpdated ? new Date(row.QuoteLastUpdated) : null
      }));
    });
  }

  /**
   * Return list of symbols in the ExpectedMoveSymbols table ordered by Symbol
   */
  public static async GetExpectedMoveSymbols(): Promise<string[]> {
    return this.withConnection(async (conn) => {
      const [rows] = await conn.query('SELECT Symbol FROM ExpectedMoveSymbols ORDER BY Symbol');
      const arr = rows as any[];
      if (!arr || arr.length === 0) return [];
      return arr.map(r => r.Symbol);
    });
  }

  /**
   * Add a new symbol to ExpectedMoveSymbols for tracking.
   */
  public static async AddExpectedMoveSymbol(symbol: string): Promise<void> {
    if (!symbol || symbol.trim() === '') {
      throw new Error('Symbol is required');
    }
    const value = symbol.trim().toUpperCase();
    return this.withConnection(async (conn) => {
      await conn.query(
        `INSERT INTO ExpectedMoveSymbols (Symbol) VALUES (?)`,
        [value]
      );
    });
  }

  /**
   * Delete a symbol from ExpectedMoveSymbols.
   */
  public static async DeleteExpectedMoveSymbol(symbol: string): Promise<void> {
    if (!symbol || symbol.trim() === '') {
      throw new Error('Symbol is required');
    }
    const value = symbol.trim().toUpperCase();
    return this.withConnection(async (conn) => {
      await conn.query(
        `DELETE FROM ExpectedMoveSymbols WHERE Symbol = ?`,
        [value]
      );
    });
  }

  // ==========================
  // Place Orders
  // ==========================

  /**
   * Get PlaceOrders with account names, sorted by the specified column and direction.
   */
  public static async GetPlaceOrders(sortColumn: string = 'Symbol', sortDirection: 'asc' | 'desc' = 'asc'): Promise<Array<import('lumostrade').PlaceOrder & { AccountName: string, CurrentPrice?: number | null, QuoteLastUpdated?: Date | null }>> {
    return this.withConnection(async (conn) => {
      const validColumns = ['AccountName', 'BrokerOrderID', 'Symbol', 'Action', 'Price', 'CurrentPrice', 'Quantity', 'OrderAmount', 'OrderStatus', 'LastUpdated', 'QuoteLastUpdated'];
      const column = validColumns.includes(sortColumn) ? sortColumn : 'Symbol';
      const direction = sortDirection === 'desc' ? 'DESC' : 'ASC';
      
      const query = `
        SELECT po.*, a.Name as AccountName, q.Price AS CurrentPrice, q.LastUpdated AS QuoteLastUpdated
        FROM PlaceOrder po
        LEFT JOIN Accounts a ON po.AccountID = a.AccountID
        LEFT JOIN Quotes q ON po.AccountID = q.AccountID AND po.Symbol = q.Symbol
        ORDER BY ${column} ${direction}
      `;

      const [rows] = await conn.query(query);
      const arr = rows as any[];
      if (!arr || arr.length === 0) {
        return [];
      }

      const { OrderAction } = require('lumostrade');
      return arr.map(row => ({
        PlaceOrderID: row.PlaceOrderID,
        AccountID: row.AccountID,
        BrokerOrderID: row.BrokerOrderID,
        Symbol: row.Symbol,
        Action: OrderAction.CreateFromActionType(row.Action) || row.Action,
        Price: row.Price,
        CurrentPrice: row.CurrentPrice != null ? parseFloat(row.CurrentPrice) : null,
        Quantity: row.Quantity,
        OrderAmount: row.OrderAmount,
        Status: row.OrderStatus ?? null,
        LastUpdated: row.LastUpdated,
        QuoteLastUpdated: row.QuoteLastUpdated ? new Date(row.QuoteLastUpdated) : null,
        AccountName: row.AccountName
      }));
    });
  }
}
