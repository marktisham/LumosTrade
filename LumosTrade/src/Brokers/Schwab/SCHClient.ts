import { Account } from '../../interfaces/Account';
import { BrokerAccountBalance } from '../../interfaces/AccountHistory';
import { Order } from '../../interfaces/Order';
import { Transaction } from '../../interfaces/Transaction';
import { OAuth2Client, OAuth2Config } from '../../utils/OAuth2Client';
import { LumosDatastore } from '../../utils/LumosDatastore';
import { SecretManager } from '../../utils/SecretManager';
import { SCHCaller } from './SCHCaller';
import { SCHResponseMapper } from './SCHResponseMapper';
import { loadModuleConfig } from '../../utils/moduleConfig';
import { DataAccess } from '../../database/DataAccess';
import { Quote } from '../../interfaces/Quote';
import { PlaceOrderDetail } from '../../interfaces/PlaceOrderDetail';
import { PreviewOrderResponse } from '../../interfaces/PreviewOrderResponse';
import { PlaceOrderResponse } from '../../interfaces/PlaceOrderResponse';
import { Position } from '../../interfaces/Position';
import { BrokerClient } from '../../interfaces/BrokerClient';
import { Instrument } from '../../interfaces/Instrument';
import { ListHelpers } from '../../utils/ListHelpers';

export class SCHClient implements BrokerClient {

  protected static oauthClient: OAuth2Client | undefined;

  /**
   * Reset the OAuth client to force re-initialization.
   * Call this after updating tokens to ensure the client uses the latest credentials.
   */
  public static ResetOAuthClient(): void {
    SCHClient.oauthClient = undefined;
  }

  GetBrokerID(): number {
    // Charles Schwab broker ID, aligned to the Brokers database table.
    return 2;
  }

  GetBrokerName(): string {
    // Charles Schwab broker name
    return "Charles Schwab";
  }

  protected async initialize() {
    if (SCHClient.oauthClient) {
      return;
    }

    const secrets = await SecretManager.getSecrets();
    const datastoreHelper = new LumosDatastore(true);
    const accessTokenRecord: any = await datastoreHelper.Get(loadModuleConfig().get('brokers.schwab.oauth2.DatastoreKey'));
    const accessToken = accessTokenRecord.accessToken;
    const refreshToken = accessTokenRecord.refreshToken;
    const expiresIn = accessTokenRecord.expiresIn;

    const config: OAuth2Config = {
      clientId: secrets.Brokers.schwab.appKey,
      clientSecret: secrets.Brokers.schwab.secret,
      tokenUrl: loadModuleConfig().get('brokers.schwab.oauth2.TokenURL'),
      authUrl: loadModuleConfig().get('brokers.schwab.oauth2.AuthURL'),
    };

    SCHClient.oauthClient = new OAuth2Client(config, accessToken, refreshToken, expiresIn);
    // Token persistence is handled internally by SCHCaller.
  }

  //
  // Accounts
  //

  async ImportAccounts(): Promise<Account[]> {
    const accounts = await this.GetAccounts();

    // Load existing accounts for this broker so we can preserve name and other fields
    // (schwab does not return name values)
    const existingAccounts = await DataAccess.GetAccounts(this);
    const existingMap = new Map<number, Account>();
    for (const ea of existingAccounts) {
      existingMap.set(ea.BrokerAccountID, ea);
    }

    // Upsert the latest values for each, taking caren to clobber values not returnes by the API (e.g. Name)
    for (const account of accounts) {
      let existing = existingMap.get(account.BrokerAccountID);
      if (existing) {
        existing.BrokerAccountKey = account.BrokerAccountKey;
        await DataAccess.AccountRefresh(this, existing);
      } else {
        await DataAccess.AccountRefresh(this, account);
      }
    }

    return accounts;
  }

  async GetAccounts(): Promise<Account[]> {
    try {
      await this.initialize();

      // Get the accounts URL from config
      const url: string = loadModuleConfig().get('brokers.schwab.url.getAccounts');
      const response = await SCHCaller.Get(SCHClient.oauthClient!, url);
      // SCHCaller may return an axios response or raw data; normalize to `data`
      const data = response?.data ?? response;
      // Use the response mapper to convert to Account[]
      const accounts = SCHResponseMapper.mapAccountsResponse(data);
      return accounts;
    } catch (err) {
      const msg = this.formatSchwabError(err);
      console.error('Failed to fetch Schwab accounts:', msg);
      throw new Error(msg);
    }
  }

  async GetAccountBalance(account: Account): Promise<BrokerAccountBalance> {
    try {
      await this.initialize();
      const urlTemplate = loadModuleConfig().get('brokers.schwab.url.getAccountBalance');
      const url = urlTemplate.replace('{accountIdKey}', encodeURIComponent(account.BrokerAccountKey));
      const response = await SCHCaller.Get(SCHClient.oauthClient!, url);
      return SCHResponseMapper.mapAccountBalanceResponse(account, response.data);
    } catch (err) {
      const msg = this.formatSchwabError(err);
      console.error('Failed to fetch Schwab account balance:', msg);
      throw new Error(msg);
    }
  }

  //
  // Orders
  //

  async GetOrders(account: Account, fromDateUTC?: Date, filledOrdersOnly?: boolean): Promise<Order[]> {
    try {
      await this.initialize();
      const urlTemplate = loadModuleConfig().get('brokers.schwab.url.getOrders');
      let url = urlTemplate.replace('{accountIdKey}', encodeURIComponent(account.BrokerAccountKey));
      url = this.buildOrdersUrlWithDates(url, fromDateUTC);
      const maxRetries = 5; // schwab can sometimes be slow for this.
      const response = await SCHCaller.Get(SCHClient.oauthClient!, url, maxRetries);
      const instruments: Instrument[] = SCHResponseMapper.extractInstruments(response.data);
      if (instruments && instruments.length > 0) {
        try {
          await DataAccess.InsertInstruments(instruments);
        } catch (err) {
          const msg = this.formatSchwabError(err);
          console.error('Failed to insert instruments from Schwab orders:', msg);
        }
      }
      let orders = SCHResponseMapper.mapOrdersResponse(response.data);
      orders.reverse();
      return orders;
    } catch (err) {
      const msg = this.formatSchwabError(err);
      console.error('Failed to fetch Schwab orders:', msg);
      throw new Error(msg);
    }
  }

  // PreviewOrder and PlaceOrder are not yet implemented for Schwab
  async PreviewOrder(account: Account, order: PlaceOrderDetail): Promise<PreviewOrderResponse | null> {
    throw new Error('PreviewOrder is not implemented for Schwab');
  }

  async PlaceOrder(account: Account, order: PlaceOrderDetail, preview?: PreviewOrderResponse): Promise<PlaceOrderResponse | null> {
    throw new Error('PlaceOrder is not implemented for Schwab');
  }

  async CancelOrder(account: Account, order: Order): Promise<boolean> {
    throw new Error('CancelOrder has not yet been implemented for Charles Schwab');
  }

  // Helper to build orders URL with fromDate and toDate
  private buildOrdersUrlWithDates(baseUrl: string, fromDateUTC?: Date): string {
    // Set toDate to now (Schwab throws error if > 1 year between from/to)
    const toDateObj = new Date();
    const toDate = this.formatDateForSchwab(toDateObj);

    // From date must be no older than one year back. If not provided or
    // older than one year, default to exactly one year back from now.
    const oneYearBack = new Date();
    oneYearBack.setFullYear(oneYearBack.getFullYear() - 1);
    let fromDateObj: Date;
    if (!fromDateUTC) {
      fromDateObj = oneYearBack;
    } else {
      fromDateObj = new Date(fromDateUTC);
      if (fromDateObj < oneYearBack) {
        fromDateObj = oneYearBack;
      }
    }
    const fromDate = this.formatDateForSchwab(fromDateObj);

    let urlWithDates = baseUrl;
    urlWithDates += (urlWithDates.includes('?') ? '&' : '?') + `fromEnteredTime=${fromDate}&toEnteredTime=${toDate}`;
    return urlWithDates;
  }

  // Schwab expects an ISO-8601 UTC timestamp with milliseconds, e.g. 2024-03-29T00:00:00.000Z
  private formatDateForSchwab(date: Date): string {
    return date.toISOString();
  }

  //
  // Positions
  //

  async GetPositions(account: Account): Promise<Position[]> {
    try {
      await this.initialize();
      const urlTemplate: string = loadModuleConfig().get('brokers.schwab.url.getPositions');
      if (!urlTemplate) return [];
      const url = urlTemplate.replace('{accountIdKey}', encodeURIComponent(account.BrokerAccountKey));
      const response = await SCHCaller.Get(SCHClient.oauthClient!, url);
      const data = response?.data ?? {};
      const positions: Position[] = SCHResponseMapper.mapPositionsResponse(data) ?? [];
      return positions;
    } catch (err) {
      const msg = this.formatSchwabError(err);
      console.error('Failed to fetch Schwab positions:', msg);
      throw new Error(msg);
    }
  }

  //
  // Quotes
  //

  async GetQuotes(symbols: string[], detailedQuote: boolean = false): Promise<Quote[]> {
    try {
      await this.initialize();
      const cleaned = ListHelpers.SanitizeSymbols(symbols);
      if (cleaned.length === 0) return [];
      
      // Use detailed or basic URL based on detailedQuote flag
      const configKey = detailedQuote ? 'brokers.schwab.url.getQuotesDetaialed' : 'brokers.schwab.url.getQuotes';
      const urlTemplate: string = loadModuleConfig().get(configKey);
      if (!urlTemplate) throw new Error(`Missing configuration: ${configKey}`);
      
      const batchSize = 50; // unsure what the schwab max is, but let's page just in case.
      const allQuotes: Quote[] = [];
      for (let i = 0; i < cleaned.length; i += batchSize) {
        const batch = cleaned.slice(i, i + batchSize);
        const symbolList = batch.join(',');
        const url = urlTemplate.replace('{symbols}', symbolList);
        const response = await SCHCaller.Get(SCHClient.oauthClient!, url);
        const data = response?.data ?? {};
        const quotes: Quote[] = SCHResponseMapper.mapQuotesResponse(data, detailedQuote) ?? [];
        allQuotes.push(...quotes);
      }
      return allQuotes;
    } catch (err) {
      const msg = this.formatSchwabError(err);
      console.error('Failed to fetch Schwab quotes:', msg);
      throw new Error(msg);
    }
  }

  //
  // Transactions
  //

  async GetTransactions(account: Account, fromDateUTC?: Date): Promise<Transaction[]> {
    try {
      await this.initialize();
      const urlTemplate: string = loadModuleConfig().get('brokers.schwab.url.getTransactions');
      if (!urlTemplate) return [];
      let url = urlTemplate.replace('{accountIdKey}', encodeURIComponent(account.BrokerAccountKey));
      url = this.buildTransactionUrlWithDates(url, fromDateUTC);
      const maxRetries = 5; // schwab can sometimes be slow for this.
      const response = await SCHCaller.Get(SCHClient.oauthClient!, url, maxRetries);
      let allTransactions: Transaction[] = await SCHResponseMapper.mapTransactionsResponse(response.data);
      allTransactions.reverse(); // to chronological order
      return allTransactions;
    } catch (err) {
      const msg = this.formatSchwabError(err);
      console.error(`Failed to fetch Schwab transactions for account ${account.Name} (${account.AccountID}):`, msg);
      throw new Error(msg);
    }
  }
  
  // Helper to build transactions URL with startDate and endDate query params
  private buildTransactionUrlWithDates(baseUrl: string, fromDateUTC?: Date): string {
    // Set toDate to now (Schwab throws error if > 1 year between from/to)
    const toDateObj = new Date();
    const toDate = this.formatDateForSchwab(toDateObj);

    // From date must be no older than one year back. If not provided or
    // older than one year, default to exactly one year back from now.
    const oneYearBack = new Date();
    oneYearBack.setFullYear(oneYearBack.getFullYear() - 1);
    let fromDateObj: Date;
    if (!fromDateUTC) {
      fromDateObj = oneYearBack;
    } else {
      fromDateObj = new Date(fromDateUTC);
      if (fromDateObj < oneYearBack) {
        fromDateObj = oneYearBack;
      }
    }
    const fromDate = this.formatDateForSchwab(fromDateObj);

    let urlWithDates = baseUrl;
    urlWithDates += (urlWithDates.includes('?') ? '&' : '?') + `startDate=${fromDate}&endDate=${toDate}`;
    return urlWithDates;
  }

  /**
   * Formats a user-friendly error message from Schwab API errors.
   * @param err The error object (likely AxiosError)
   */
    private formatSchwabError(err: any): string {
      if (err && err.response && err.response.data) {
        const code = err.response.status;
        const error = err.response.data.error;
        const desc = err.response.data.error_description;
        let embeddedDesc = '';
        // Try to extract embedded error_description if present
        if (desc) {
          // Look for Exception=... inside the error_description
          const match = desc.match(/Exception=([^\[\]]+)/);
          if (match && match[1]) {
            embeddedDesc = match[1].trim();
          }
        }
        let msg = `Schwab API error`;
        if (code) msg += ` (HTTP ${code})`;
        if (error) msg += `: ${error}`;
        if (embeddedDesc) {
          msg += ` - ${embeddedDesc}`;
        } else if (desc) {
          msg += ` - ${desc}`;
        }
        return msg;
      }
      return err && err.message ? err.message : String(err);
    }

}
