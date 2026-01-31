import mysql, { Pool, PoolConnection, PoolOptions } from 'mysql2/promise';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import { SecretManager } from '../utils/SecretManager';
import { RoundUtil } from '../utils/RoundUtil';

/**
 * Base class for DB access. Manages connection pool using Google Cloud SQL Connector and
 * provides low-level helpers for mapping rows and formatting DB values.
 * 
 * Database credentials are fetched from Google Secret Manager at runtime.
 */
export class DataAccessBase {
  private static connector: Connector | null = null;
  private static pool: Pool | null = null;
  private static clientOpts: PoolOptions | null = null;

  protected static async initPool(): Promise<Pool> {
    if (this.pool) {
      return this.pool;
    }
    if (!this.connector) {
      this.connector = new Connector();
    }
    
    const secrets = await SecretManager.getSecrets();
    
    // Construct database connection details from environment variables
    const projectId = process.env.PROJECT_ID;
    const region = process.env.SQL_REGION || process.env.REGION;
    const instance = process.env.SQL_INSTANCE;
    const database = process.env.SQL_DATABASE;
    
    if (!projectId || !region || !instance || !database) {
      throw new Error(
        'Missing required database environment variables. Ensure PROJECT_ID, REGION (or SQL_REGION), SQL_INSTANCE, and SQL_DATABASE are set.'
      );
    }
    
    const server = `${projectId}:${region}:${instance}`;
    
    if (!this.clientOpts) {
      this.clientOpts = await this.connector.getOptions({
        instanceConnectionName: server,
        ipType: IpAddressTypes.PUBLIC,
      });
    }
    this.pool = mysql.createPool({
      ...this.clientOpts,
      user: secrets.database.user,
      password: secrets.database.password,
      database: database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: 'Z',
    });
    return this.pool;
  }

  /** Acquire a pooled connection. */
  protected static async getConnection(): Promise<PoolConnection> {
    const pool = await this.initPool();
    return pool.getConnection();
  }

  /** Release a previously acquired connection. */
  protected static async releaseConnection(conn: PoolConnection): Promise<void> {
    await conn.release();
  }

  /**
   * Close the pool and connector (for shutdown/cleanup).
   */
  public static async closePool(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    if (this.connector) {
      await this.connector.close();
      this.connector = null;
    }
    this.clientOpts = null;
  }
  
  /**
   * Helper to manage connection lifecycle for a query.
   */
  protected static async withConnection<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
    let conn: PoolConnection | null = null;
    try {
      conn = await this.getConnection();
      return await fn(conn);
    } finally {
      if (conn) {
        await this.releaseConnection(conn);
      }
    }
  }

  /**
   * Converts MySQL bit(1) fields to boolean.
   * MySQL bit fields may be returned as Buffer, number, or boolean depending on driver configuration.
   */
  protected static toBool(value: any): boolean {
    if (value instanceof Buffer) {
      return value[0] === 1;
    }
    return value === 1 || value === true;
  }

  /**
   * Format a Date or string for MySQL DATETIME input.
   * - If `value` is a Date, returns `YYYY-MM-DD HH:MM:SS` string in UTC.
   * - If `value` is a string or null/undefined, returns it unchanged (or null).
   */
  protected static formatDbDate(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    if (value instanceof Date) {
      return value.toISOString().slice(0, 19).replace('T', ' ');
    }
    return value as string;
  }

  /**
   * Format a boolean for DB usage: returns 1 for true, 0 for false, and null for null/undefined.
   */
  protected static formatDbBool(value: boolean | null | undefined): number | null {
    if (value == null) return null;
    return value ? 1 : 0;
  }

  /** Clamp a number to DECIMAL(8,4) bounds; return null if out of range or nullish. */
  protected static clampDecimal8_4(value: number | null | undefined): number | null {
    if (value == null) return null;
    
    const MAX_DECIMAL_8_4 = 9999.9999;
    const MIN_DECIMAL_8_4 = -9999.9999;
    
    if (value > MAX_DECIMAL_8_4 || value < MIN_DECIMAL_8_4) {
      return null;
    }
    
    return value;
  }

  

  //
  // Maps a row in the Order table to an Order object.
  //
  protected static mapOrderRowToOrder(row: any): import('../interfaces/Order').Order {
    // Import OrderAction classes locally to avoid circular dependencies
    const { OrderAction } = require('../interfaces/OrderAction');
    const action = OrderAction.CreateFromActionType(row.Action);
    const { Order } = require('../interfaces/Order');
    const order = new Order(
      row.BrokerOrderID ?? null,
      row.BrokerOrderStep ?? null,
      row.Symbol,
      row.ExecutedTime instanceof Date ? row.ExecutedTime : new Date(row.ExecutedTime),
      action,
      Number(row.Quantity),
      Number(row.Price),
      Number(row.OrderAmount),
      Number(row.Fees),
      row.Status ?? null,
      row.OrderID ?? null,
      row.TradeID ?? null
    );
    // Add additional properties from database row that aren't in the constructor
    (order as any).AccountID = row.AccountID;
    (order as any).IncompleteTrade = this.toBool(row.IncompleteTrade);
    (order as any).ManuallyAdjusted = this.toBool(row.ManuallyAdjusted);
    (order as any).BrokerTransactionID = row.BrokerTransactionID != null ? Number(row.BrokerTransactionID) : null;
    (order as any).AdjustedComment = row.AdjustedComment ?? null;
    
    // If the query joined Trades to provide CloseDate, expose it on the order row mapping
    (order as any).TradeCloseDate = row.TradeCloseDate ? (row.TradeCloseDate instanceof Date ? row.TradeCloseDate : new Date(row.TradeCloseDate)) : null;
    return order;
  }

  //
  // Maps a row in the Trades table to a Trade object.
  //
  protected static mapTradeRowToTrade(row: any): import('../interfaces/Trade').Trade {
    const { Trade } = require('../interfaces/Trade');
    
    // TotalGain and WinningTrade come directly from the DB columns.
    let mappedTotalGain = row.TotalGain != null ? Number(row.TotalGain) : null;
    
    // WinningTrade may be returned as bit, boolean, number, or string ('1'/'0').
    let mappedWinning: boolean | null = null;
    if (row.WinningTrade != null) {
      if (typeof row.WinningTrade === 'string') {
        mappedWinning = row.WinningTrade === '1' || row.WinningTrade.toLowerCase() === 'true';
      } else if (row.WinningTrade instanceof Buffer) {
        mappedWinning = row.WinningTrade[0] === 1;
      } else {
        mappedWinning = row.WinningTrade === 1 || row.WinningTrade === true;
      }
    }

    const trade = new Trade({
      TradeID: row.TradeID ?? null,
      AccountID: row.AccountID,
      Symbol: row.Symbol,
      LongTrade: this.toBool(row.LongTrade),
      WinningTrade: mappedWinning,
      OpenDate: row.OpenDate instanceof Date ? row.OpenDate : new Date(row.OpenDate),
      CloseDate: row.CloseDate instanceof Date ? row.CloseDate : (row.CloseDate ? new Date(row.CloseDate) : null),
      DurationMS: row.DurationMS != null ? BigInt(row.DurationMS) : null,
      Closed: this.toBool(row.Closed),
      // Backward compatibility: Convert positive OpenQuantity to negative for short trades
      // Old code stored all OpenQuantity as positive; new code uses negative for shorts
      OpenQuantity: this.toBool(row.LongTrade) ? 
        RoundUtil.RoundForDB(Number(row.OpenQuantity))! : 
        -Math.abs(RoundUtil.RoundForDB(Number(row.OpenQuantity))!),
      BreakEvenPrice: Number(row.BreakEvenPrice),
      CurrentPrice: row.CurrentPrice != null ? Number(row.CurrentPrice) : null,
      
      TotalGain: mappedTotalGain,
      TotalGainPct: row.TotalGainPct != null ? Number(row.TotalGainPct) : null,
      LargestRisk: Number(row.LargestRisk),
      TotalFees: Number(row.TotalFees),
      TotalOrderCount: row.TotalOrderCount,
      ManuallyAdjusted: this.toBool(row.ManuallyAdjusted),
      CurrentPriceDateTime: row.CurrentPriceDateTime instanceof Date ? row.CurrentPriceDateTime : (row.CurrentPriceDateTime ? new Date(row.CurrentPriceDateTime) : undefined),
      CurrentCost: row.CurrentCost != null ? Number(row.CurrentCost) : null,
      CurrentValue: row.CurrentValue != null ? Number(row.CurrentValue) : null,
      RealizedGain: row.RealizedGain != null ? Number(row.RealizedGain) : null,
      UnrealizedGain: row.UnrealizedGain != null ? Number(row.UnrealizedGain) : null,
      AvgEntryPrice: row.AvgEntryPrice != null ? Number(row.AvgEntryPrice) : null,
      AvgExitPrice: row.AvgExitPrice != null ? Number(row.AvgExitPrice) : null
    });
    
    // Expose BrokerID for UI needs where the Trade type does not formally include it
    try {
      (trade as any).BrokerID = row.BrokerID != null ? parseInt(row.BrokerID, 10) : null;
      (trade as any).AccountName = row.AccountName ?? null;
      (trade as any).BrokerName = row.BrokerName ?? null;
    } catch (err) {
      // ignore if assignment fails
    }
    
    return trade;
  }

  //
  // Maps a row in the Accounts table to an Account object.
  //
  protected static mapRowToAccount(row: any): import('../interfaces/Account').Account {
    const { Account } = require('../interfaces/Account');
    const account = new Account(
      row.BrokerAccountID != null ? parseInt(row.BrokerAccountID, 10) : 0,
      row.BrokerAccountKey ?? '',
      row.Description ?? '',
      row.Name ?? '',
      row.AccountID != null ? parseInt(row.AccountID, 10) : null,
      row.LatestBrokerTransactionID != null ? (Number.isNaN(Number(row.LatestBrokerTransactionID)) ? null : Number(row.LatestBrokerTransactionID)) : null,
      row.LatestBrokerTransactionDate ? (row.LatestBrokerTransactionDate instanceof Date ? row.LatestBrokerTransactionDate : new Date(row.LatestBrokerTransactionDate)) : null,
      this.toBool(row.Closed)
    );
    // Expose BrokerID for UI needs where the Account type does not formally include it
    try {
      (account as any).BrokerID = row.BrokerID != null ? parseInt(row.BrokerID, 10) : null;
    } catch (err) {
      // ignore if assignment fails
    }
    return account;
  }

  /**
   * Maps a row in the Quotes table to a Quote object.
   */
  protected static mapQuoteRowToQuote(row: any): import('../interfaces/Quote').Quote {
    const { Quote } = require('../interfaces/Quote');
    const lastUpdated = row.LastUpdated ? (row.LastUpdated instanceof Date ? row.LastUpdated : new Date(row.LastUpdated)) : new Date();
    const accountId = row.AccountID != null && !Number.isNaN(Number(row.AccountID)) ? Number(row.AccountID) : 0;
    const quoteId = row.QuoteID != null && !Number.isNaN(Number(row.QuoteID)) ? Number(row.QuoteID) : 0;
    return new Quote(quoteId, accountId, (row.Symbol ?? row.symbol ?? '').toString(), Number(row.Price), lastUpdated);
  }

  /**
   * Maps a row in the PlaceOrder table to a PlaceOrder object.
   */
  protected static mapRowToPlaceOrder(row: any): import('../interfaces/PlaceOrder').PlaceOrder {
    const { PlaceOrder } = require('../interfaces/PlaceOrder');
    const lastUpdated = row.LastUpdated ? (row.LastUpdated instanceof Date ? row.LastUpdated : new Date(row.LastUpdated)) : null;
    const placeOrderId = row.PlaceOrderID != null && !Number.isNaN(Number(row.PlaceOrderID)) ? Number(row.PlaceOrderID) : null;
    const accountId = row.AccountID != null && !Number.isNaN(Number(row.AccountID)) ? Number(row.AccountID) : 0;
    const brokerOrderId = row.BrokerOrderID != null && !Number.isNaN(Number(row.BrokerOrderID)) ? Number(row.BrokerOrderID) : null;
    const price = row.Price != null && !Number.isNaN(Number(row.Price)) ? Number(row.Price) : 0;
    const quantity = row.Quantity != null && !Number.isNaN(Number(row.Quantity)) ? Number(row.Quantity) : 0;

    // Import OrderAction & OrderStatus locally to avoid circular dependencies and map the action string to an OrderAction object
    const { OrderAction } = require('../interfaces/OrderAction');
    const { OrderStatus } = require('../interfaces/OrderStatus');
    const action = OrderAction.CreateFromActionType(row.Action);

    return new PlaceOrder(
      accountId,
      (row.Symbol ?? row.symbol ?? '').toString(),
      action,
      price,
      quantity,
      row.OrderStatus ? (row.OrderStatus as any) : null,
      brokerOrderId,
      placeOrderId,
      lastUpdated
    );
  }

  /**
   * Maps a row in the Brokers table to a Broker object.
   */
  protected static mapRowToBroker(row: any): import('../interfaces/Broker').Broker {
    const { Broker } = require('../interfaces/Broker');
    return new Broker(
      row.BrokerID != null ? parseInt(row.BrokerID, 10) : 0,
      row.Name ?? ''
    );
  }

  /**
   * Maps a row in the AccountHistory table to an AccountHistory object.
   */
  protected static mapRowToAccountHistory(row: any): import('../interfaces/AccountHistory').AccountHistory {
    const { AccountHistory } = require('../interfaces/AccountHistory');
    const accountHistory = new AccountHistory(
      row.AccountID,
      row.RollupPeriod,
      row.PeriodEnd instanceof Date ? row.PeriodEnd : new Date(row.PeriodEnd),
      row.Balance != null ? Number(row.Balance) : null,
      row.TransferAmount != null ? Number(row.TransferAmount) : null,
      row.TransferDescription ?? null
    );
    // Set additional fields
    accountHistory.AccountHistoryID = row.AccountHistoryID ?? null;
    accountHistory.BalanceUpdateTime = row.BalanceUpdateTime ? (row.BalanceUpdateTime instanceof Date ? row.BalanceUpdateTime : new Date(row.BalanceUpdateTime)) : null;
    accountHistory.BalanceChangeAmount = row.BalanceChangeAmount != null ? Number(row.BalanceChangeAmount) : null;
    accountHistory.BalanceChangePct = row.BalanceChangePct != null ? Number(row.BalanceChangePct) : null;
    accountHistory.InvestedAmount = row.InvestedAmount != null ? Number(row.InvestedAmount) : null;
    accountHistory.NetGain = row.NetGain != null ? Number(row.NetGain) : null;
    accountHistory.NetGainPct = row.NetGainPct != null ? Number(row.NetGainPct) : null;
    accountHistory.OrdersExecuted = row.OrdersExecuted != null ? Number(row.OrdersExecuted) : null;
    accountHistory.Comment = row.Comment ?? null;
    return accountHistory;
  }

  /**
   * Maps a row in the SymbolGroups table to a SymbolGroup object.
   */
  protected static mapRowToSymbolGroup(row: any): import('../interfaces/SymbolGroup').SymbolGroup {
    const { SymbolGroup } = require('../interfaces/SymbolGroup');
    const lastUpdated = row.LastUpdated instanceof Date ? row.LastUpdated : (row.LastUpdated ? new Date(row.LastUpdated) : new Date());
    const rollup = this.toBool(row.RollupGroup);
    return new SymbolGroup(
      row.Symbols ?? '',
      row.Name ?? '',
      lastUpdated,
      row.ID != null ? parseInt(row.ID, 10) : null,
      rollup
    );
  }

  /**
   * Map a database row to a TradeHistory object.
   */
  protected static mapRowToTradeHistory(row: any): import('../interfaces/TradeHistory').TradeHistory {
    const { TradeHistory } = require('../interfaces/TradeHistory');
    return new TradeHistory(
      row.TradeHistoryID ?? null,
      row.AccountID,
      row.TradeID,
      row.RollupPeriod,
      row.PeriodEnd instanceof Date ? row.PeriodEnd : new Date(row.PeriodEnd),
      row.PeriodGain != null ? Number(row.PeriodGain) : null,
      row.PeriodGainPct != null ? Number(row.PeriodGainPct) : null,
      row.TotalGain != null ? Number(row.TotalGain) : null,
      row.TotalGainPct != null ? Number(row.TotalGainPct) : null,
      row.CurrentValue != null ? Number(row.CurrentValue) : null,
      row.CurrentCost != null ? Number(row.CurrentCost) : null,
      row.CurrentPriceAtPeriodEnd != null ? Number(row.CurrentPriceAtPeriodEnd) : null,
      row.OpenQuantityAtPeriodEnd != null ? Number(row.OpenQuantityAtPeriodEnd) : null,
      row.BreakevenPriceAtPeriodEnd != null ? Number(row.BreakevenPriceAtPeriodEnd) : null,
      row.RealizedGainAtPeriodEnd != null ? Number(row.RealizedGainAtPeriodEnd) : null,
      row.UnrealizedGainAtPeriodEnd != null ? Number(row.UnrealizedGainAtPeriodEnd) : null
    );
  }

  /**
   * Parse a value that represents a date in US Eastern (America/New_York)
   * and return a Date that represents midnight Eastern on that calendar day (as a UTC instant).
   * Accepts Date objects (where UTC components represent the stored date), or strings like "YYYY-MM-DD".
   * Uses DateUtils.GetEasternStartOfDayUTC() which matches OptionExpirationDate.toDate() behavior.
   */
  protected static parseEasternDate(value: any): Date | null {
    const { DateUtils } = require('../utils/DateUtils');
    if (value == null) return null;

    // Convert to YYYY-MM-DD string format
    const dateStr = DateUtils.formatDateOnly(value);
    if (!dateStr) return null;

    // Use DateUtils helper to get midnight Eastern as UTC Date
    return DateUtils.GetEasternStartOfDayUTC(dateStr);
  }

  /**
   * Maps a row in the ExpectedMoves table to an ExpectedMove object.
   */
  protected static mapRowToExpectedMove(row: any): import('../interfaces/ExpectedMove').ExpectedMove {
    const { ExpectedMove } = require('../interfaces/ExpectedMove');
    const expiry = this.parseEasternDate(row.ExpiryDate) || new Date(row.ExpiryDate);
    return new ExpectedMove(
      row.Symbol,
      row.ExpiryType,
      this.toBool(row.InitialValue),
      expiry,
      row.IV != null ? Number(row.IV) : 0,
      row.ClosingPrice != null ? Number(row.ClosingPrice) : 0,
      row.Delta != null ? Number(row.Delta) : 0,
      row.OneSigmaHigh != null ? Number(row.OneSigmaHigh) : 0,
      row.OneSigmaLow != null ? Number(row.OneSigmaLow) : 0,
      row.TwoSigmaHigh != null ? Number(row.TwoSigmaHigh) : 0,
      row.TwoSigmaLow != null ? Number(row.TwoSigmaLow) : 0,
      row.LastUpdated ? (row.LastUpdated instanceof Date ? row.LastUpdated : new Date(row.LastUpdated)) : new Date()
    );
  }
}
