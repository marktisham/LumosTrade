import { Account } from '../../interfaces/Account';
import { BrokerAccountBalance } from '../../interfaces/AccountHistory';
import { Order } from '../../interfaces/Order';
import { Transaction } from '../../interfaces/Transaction';
import { OAuth1Client } from '../../utils/OAuth1Client';
import { LumosDatastore } from '../../utils/LumosDatastore';
import { SecretManager } from '../../utils/SecretManager';
import { ETCaller } from './ETCaller';
import { ETResponseMapper } from './ETResponseMapper';
import { loadModuleConfig } from '../../utils/moduleConfig';
import { DataAccess } from '../../database/DataAccess';
import { Quote } from '../../interfaces/Quote';
import { Position } from '../../interfaces/Position';
import { ListHelpers } from '../../utils/ListHelpers';
import { PlaceOrderDetail } from '../../interfaces/PlaceOrderDetail';
import { PreviewOrderResponse } from '../../interfaces/PreviewOrderResponse';
import { PlaceOrderResponse } from '../../interfaces/PlaceOrderResponse';
import { BrokerClient } from '../..';


export class ETClient implements BrokerClient {

  protected static oauthClient: OAuth1Client | undefined;

  /**
   * Reset the OAuth client to force re-initialization.
   * Call this after updating tokens to ensure the client uses the latest credentials.
   */
  public static ResetOAuthClient(): void {
    ETClient.oauthClient = undefined;
  }

  GetBrokerID(): number {
    // E*TRADE broker ID, from the Brokers database table. 
    // Hardcoded to a constant value of 1 here, since this is essentially static data.
    return 1;
  }

  GetBrokerName(): string {
    // E*TRADE broker name, hardcoded here as "E*TRADE", since this is static data.
    return "E*TRADE";
  }

  protected async initialize() {
    if (ETClient.oauthClient) {
      return;
    }
    const secrets = await SecretManager.getSecrets();
    const consumerKey = secrets.Brokers.etrade.consumerKey;
    const consumerSecret = secrets.Brokers.etrade.consumerSecret;
    
    const datastoreHelper = new LumosDatastore(true);
    const accessTokenRecord: any = await datastoreHelper.Get(loadModuleConfig().get('brokers.etrade.oauth1.DatastoreKey'));
    const accessToken = accessTokenRecord.accessToken;
    const accessTokenSecret = accessTokenRecord.accessTokenSecret;
    
    ETClient.oauthClient = new OAuth1Client(consumerKey, consumerSecret, accessToken, accessTokenSecret);
  }

  //
  // Accounts
  //

  async ImportAccounts(): Promise<Account[]> {
    const accounts = await this.GetAccounts();
    for (const account of accounts) {
      await DataAccess.AccountRefresh(this, account);
    }
    return accounts;
  }

  async GetAccounts(): Promise<Account[]> {
    try {
      await this.initialize();
      const url = loadModuleConfig().get('brokers.etrade.url.getAccounts');
      const response = await ETCaller.Get(ETClient.oauthClient!, url);
      const accounts: Account[] = ETResponseMapper.mapAccountsResponse(response.data);
      return accounts;
    } catch (err) {
      const msg = this.formatETradeError(err);
      console.error('Failed to fetch E*TRADE accounts:', msg);
      throw new Error(msg);
    }
  }

  async GetAccountBalance(account: Account): Promise<BrokerAccountBalance> {
    try {
      await this.initialize();
      const urlTemplate = loadModuleConfig().get('brokers.etrade.url.getAccountBalance');
      const url = urlTemplate.replace('{accountIdKey}', encodeURIComponent(account.BrokerAccountKey));
      const response = await ETCaller.Get(ETClient.oauthClient!, url);
      return ETResponseMapper.mapAccountBalanceResponse(account, response.data);
    } catch (err) {
      const msg = this.formatETradeError(err);
      console.error('Failed to fetch E*TRADE account balance:', msg);
      throw new Error(msg);
    }
  }

  //
  // Positions
  //

  async GetPositions(account: Account): Promise<Position[]> {
    try {
      await this.initialize();
      const urlTemplate: string = loadModuleConfig().get('brokers.etrade.url.getPositions');
      if (!urlTemplate) return [];
      const url = urlTemplate.replace('{accountIdKey}', encodeURIComponent(account.BrokerAccountKey));
      const response = await ETCaller.Get(ETClient.oauthClient!, url);
      const data = response?.data ?? {};
      const positions: Position[] = ETResponseMapper.mapPositionsResponse(data) ?? [];
      return positions;
    } catch (err) {
      const msg = this.formatETradeError(err);
      console.error('Failed to fetch E*TRADE positions:', msg);
      throw new Error(msg);
    }
  }

  //
  // Orders
  //

  async GetOrders(account: Account, fromDateUTC?: Date, filledOrdersOnly: boolean = true): Promise<Order[]> {
    try {
      await this.initialize();
      if(fromDateUTC) {
        const maxOrderDuration = new Date();
        const maxOrderDurationDays = 61; // add an extra day for rounding safety.
        maxOrderDuration.setDate(maxOrderDuration.getDate() - maxOrderDurationDays); 
        if (fromDateUTC > maxOrderDuration) {
          fromDateUTC = maxOrderDuration;
        }
      }
      const urlTemplate = loadModuleConfig().get('brokers.etrade.url.getOrders');
      let url = urlTemplate.replace('{accountIdKey}', encodeURIComponent(account.BrokerAccountKey));
      url = this.buildOrdersUrlWithDates(url,fromDateUTC);
      let allOrders: Order[] = [];
      let marker: string | undefined = undefined;
      let keepPaging = true;
      while (keepPaging) {
        let pagedUrl = url;
        if (marker) {
          pagedUrl += (pagedUrl.includes('?') ? '&' : '?') + `marker=${encodeURIComponent(marker)}`;
        }
        const response = await ETCaller.Get(ETClient.oauthClient!, pagedUrl);
        const orders = ETResponseMapper.mapOrdersResponse(response.data, filledOrdersOnly);
        allOrders = allOrders.concat(orders);
        marker = response.data?.OrdersResponse?.marker;
        keepPaging = !!marker && orders.length > 0;
      }
      allOrders.reverse();
      return allOrders;
    } catch (err) {
      const msg = this.formatETradeError(err);
      console.error('Failed to fetch E*TRADE orders:', msg);
      throw new Error(msg);
    }
  }

  // Helper to build orders URL with fromDate and toDate
  private buildOrdersUrlWithDates(baseUrl: string, fromDateUTC?: Date): string {
    if (!fromDateUTC) return baseUrl;
    const fromDate = this.formatDateForETrade(fromDateUTC);

    // Set toDate to the day after the current date (e.g. get the latest orders)
    const toDateObj = new Date();
    toDateObj.setDate(toDateObj.getDate() + 1);
    const toDate = this.formatDateForETrade(toDateObj);

    let urlWithDates = baseUrl;
    urlWithDates += (urlWithDates.includes('?') ? '&' : '?') + `fromDate=${fromDate}&toDate=${toDate}`;
    return urlWithDates;
  }

  // Helper to format date in format etrade expects (MMDDYYYY)
  private formatDateForETrade(date: Date): string {
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const yyyy = date.getFullYear().toString();
    return `${mm}${dd}${yyyy}`;
  }

  //
  // Quotes
  //

  async GetQuotes(symbols: string[], detailedQuote: boolean = false): Promise<Quote[]> {
    try {
      await this.initialize();
      const cleaned = ListHelpers.SanitizeSymbols(symbols);
      if (cleaned.length === 0) return [];
      const urlKey = detailedQuote ? 'getQuotesDetaialed' : 'getQuotes';
      const urlTemplate: string = loadModuleConfig().get(`brokers.etrade.url.${urlKey}`);
      if (!urlTemplate) throw new Error(`Missing configuration: brokers.etrade.url.${urlKey}`);
      const batchSize = 50; // max allowed by etrade per-call
      const allQuotes: Quote[] = [];
      for (let i = 0; i < cleaned.length; i += batchSize) {
        const batch = cleaned.slice(i, i + batchSize);
        const symbolList = batch.join(',');
        const url = urlTemplate.replace('{symbols}', symbolList);
        const response = await ETCaller.Get(ETClient.oauthClient!, url);
        const data = response?.data ?? {};
        const quotes: Quote[] = ETResponseMapper.mapQuotesResponse(data, detailedQuote) ?? [];
        allQuotes.push(...quotes);
      }
      return allQuotes;
    } catch (err) {
      const msg = this.formatETradeError(err);
      console.error('Failed to fetch E*TRADE quotes:', msg);
      throw new Error(msg);
    }
  }

  /**
   * Preview an order using E*TRADE's preview endpoint. This is a light-weight initial
   * implementation that attempts an API call and falls back to a best-effort estimate
   * if the response doesn't include expected fields.
   */
  async PreviewOrder(account: Account, order: PlaceOrderDetail): Promise<PreviewOrderResponse | null> {
    try {
      await this.initialize();
      const urlTemplate: string = loadModuleConfig().get('brokers.etrade.url.previewOrder');
      if (!urlTemplate) return null;

      // Use provided account for this preview
      const accountKey = account?.BrokerAccountKey ?? '';
      const url = urlTemplate.replace('{accountIdKey}', encodeURIComponent(accountKey));

      var orderRequest = this.buildOrderRequest(order);
      var previewOrderRequest = {
          PreviewOrderRequest : orderRequest
      }
      const payload = JSON.stringify(previewOrderRequest);

      const response = await ETCaller.Post(ETClient.oauthClient!, url, payload);
      const data = response?.data ?? {};

      // Delegate parsing to the response mapper; no local fallback logic here
      const parsed = ETResponseMapper.mapPreviewOrderResponse(data);
      if (parsed) return parsed;

      return null;
    } catch (err) {
      const msg = this.formatETradeError(err);
      console.error('Failed to preview E*TRADE order:', msg);
      // Don't throw here; return null to indicate preview unavailable
      return null;
    }
  }

  /**
   * Place an order using E*TRADE's place endpoint. Minimal implementation that includes
   * optional preview data when available.
   */
  async PlaceOrder(account: Account, order: PlaceOrderDetail, preview?: PreviewOrderResponse): Promise<PlaceOrderResponse | null> {
    try {
      await this.initialize();
      const urlTemplate: string = loadModuleConfig().get('brokers.etrade.url.placeOrder');
      if (!urlTemplate) return null;

      const accountKey = account?.BrokerAccountKey ?? '';
      const url = urlTemplate.replace('{accountIdKey}', encodeURIComponent(accountKey));

      if(order==null || preview==null){
        throw new Error('Order details and preview information are required to place an order.');
      }
      var orderRequestObj = this.buildOrderRequest(order);
      orderRequestObj.PreviewIds = [{ previewId: Number(preview.PreviewID) }];
      var orderRequest = {
          PlaceOrderRequest : orderRequestObj
      }
      const payload = JSON.stringify(orderRequest);

      const response = await ETCaller.Post(ETClient.oauthClient!, url, payload);
      const data = response?.data ?? {};

      // Extract order id from response: prefer PlaceOrderResponse.OrderIds[0].orderId
      let brokerOrderId: number | null = null;
      const orderIds = data?.PlaceOrderResponse?.OrderIds;
      if (Array.isArray(orderIds) && orderIds.length > 0) {
        const candidate = Number(orderIds[0]?.orderId ?? null);
        if (!isNaN(candidate) && candidate > 0) brokerOrderId = candidate;
      }

      if (brokerOrderId != null) {
        return new PlaceOrderResponse(order.Symbol, brokerOrderId);
      }

      return null;
    } catch (err) {
      const msg = this.formatETradeError(err);
      console.error('Failed to place E*TRADE order:', msg);
      throw new Error(msg);
    }
  }

  private buildOrderRequest(order: PlaceOrderDetail): any {
    // ETrade is VERY finnicky about the format of this, took a lot of trial and error
    // (and reverse engineering from the demo app) to get this structure. If you make changes,
    // TEST THEM WELL!
    const orderRequest = {
      orderType: "EQ",
      clientOrderId: order.ClientOrderID,   // THIS MUST BE A NUMBER! If you pass a string, you get a weird "service not available" error
      Order: [{
        allOrNone: false,
        priceType: "LIMIT",
        orderTerm: "GOOD_FOR_DAY",    // "GOOD_UNTIL_CANCEL"
        marketSession: "EXTENDED",    //  "REGULAR"
        limitPrice: order.LimitPrice,
        Instrument: [{
          Product : {
            securityType: "EQ",
            symbol: order.Symbol
          },
          orderAction: order.Action.GetActionType(),  
          quantityType: "QUANTITY",
          quantity: order.Quantity
        }]
      }]
    };
    return orderRequest;
  }

  //
  // Transactions
  //

  // Fetches transactions from etrade, BUT (since there are so many), filters the results
  // to just the transaction types we care most about.
  async GetTransactions(account: Account, fromDateUTC?: Date): Promise<Transaction[]> {
    try {
      await this.initialize();
      const urlTemplate: string = loadModuleConfig().get('brokers.etrade.url.getTransactions');
      if (!urlTemplate) return [];
      let url = urlTemplate.replace('{accountIdKey}', encodeURIComponent(account.BrokerAccountKey));
      url = this.buildTransactionUrlWithDates(url, fromDateUTC);
      let allTransactions: Transaction[] = [];
      let marker: string | undefined = undefined;
      let keepPaging = true;
      while (keepPaging) {
        let pagedUrl = url;
        if (marker) {
          pagedUrl += (pagedUrl.includes('?') ? '&' : '?') + `marker=${encodeURIComponent(marker)}`;
        }
        const retryCount = 5;
        const response = await ETCaller.Get(ETClient.oauthClient!, pagedUrl, retryCount);
        const txs: Transaction[] = ETResponseMapper.mapTransactionsResponse(response.data);
        allTransactions = allTransactions.concat(txs);
        marker = response.data?.TransactionListResponse?.marker;
        keepPaging = !!marker;
      }
      allTransactions.reverse(); // to chronological order
      return allTransactions;
    } catch (err) {
      const msg = this.formatETradeError(err);
      console.error(`Failed to fetch E*TRADE transactions for account ${account.Name} (${account.AccountID}):`, msg);
      throw new Error(msg);
    }
  }

  // Helper to build transactions URL with startDate and endDate query params
  private buildTransactionUrlWithDates(baseUrl: string, fromDateUTC?: Date): string {
    if (!fromDateUTC) return baseUrl;

    const startDate = this.formatDateForETrade(fromDateUTC);

    // Set endDate to the day after the current date (e.g. include today's transactions)
    const endDateObj = new Date();
    endDateObj.setDate(endDateObj.getDate() + 1);
    const endDate = this.formatDateForETrade(endDateObj);

    let urlWithDates = baseUrl;
    urlWithDates += (urlWithDates.includes('?') ? '&' : '?') + `startDate=${startDate}&endDate=${endDate}`;
    return urlWithDates;
  }

  /**
   * Cancel an order using E*TRADE's cancel endpoint.
   */
  async CancelOrder(account: Account, order: Order): Promise<boolean> {
    try {
      await this.initialize();
      const urlTemplate: string = loadModuleConfig().get('brokers.etrade.url.cancelOrder');
      if (!urlTemplate) {
        throw new Error('Cancel order URL not configured');
      }

      if (!order.BrokerOrderID) {
        throw new Error('Order does not have a broker order ID');
      }

      const accountKey = account?.BrokerAccountKey ?? '';
      let url = urlTemplate.replace('{accountIdKey}', encodeURIComponent(accountKey));

      const cancelOrderRequest = {
        CancelOrderRequest: {
          orderId: order.BrokerOrderID
        }
      };
      const payload = JSON.stringify(cancelOrderRequest);

      const response = await ETCaller.Put(ETClient.oauthClient!, url, payload);
      
      if (response.status !== 200) {
        throw new Error(`Failed to cancel open order ${order.BrokerOrderID}`);
      }

      return true;
    } catch (err) {
      const msg = this.formatETradeError(err);
      console.error('Failed to cancel E*TRADE order:', msg);
      throw new Error(msg);
    }
  }

  /**
   * Formats a user-friendly error message from E*TRADE API errors (XML in error.response.data).
   * @param err The error object (likely AxiosError)
   */
  protected formatETradeError(err: any): string {
    // Try to extract <code> and <message> from XML error.response.data
    if (err && err.response && err.response.data && typeof err.response.data === 'string') {
      const xml = err.response.data;
      const codeMatch = xml.match(/<code>([^<]+)<\/code>/);
      const msgMatch = xml.match(/<message>([^<]+)<\/message>/);
      const code = codeMatch && codeMatch[1] ? codeMatch[1].trim() : '';
      const msg = msgMatch && msgMatch[1] ? msgMatch[1].trim() : '';
      if (msg) {
        let formatted = 'E*TRADE API error';
        if (code) formatted += ` (code ${code})`;
        formatted += `: ${msg}`;
        return formatted;
      }
    }
    return err && err.message ? err.message : String(err);
  }  
}


