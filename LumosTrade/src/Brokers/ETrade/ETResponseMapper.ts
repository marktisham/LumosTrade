import { Account } from '../../interfaces/Account';
import { BrokerAccountBalance } from '../../interfaces/AccountHistory';
import { Order } from '../../interfaces/Order';
import { Quote } from '../../interfaces/Quote';
import { Transaction, TransactionType } from '../../interfaces/Transaction';
import {
  OrderAction,
  OrderActionSellShort,
  OrderActionBuyToCover,
  OrderActionBuy,
  OrderActionSell
} from '../../interfaces/OrderAction';
import { RoundUtil } from '../../utils/RoundUtil';
import { StingUtils } from '../../utils/StingUtils';
import { DateUtils } from '../../utils/DateUtils';
import { pickNumber, pickNumberWithOptions, pickUnixSecondsDate, pickString } from '../../utils/ValueUtils';
import { Position } from '../../interfaces/Position';
import { OptionExpirationDate, OptionExpiryType } from '../../interfaces/OptionExpirationDate';
import { OptionPair } from '../../interfaces/OptionPair';
import { PreviewOrderResponse } from '../../interfaces/PreviewOrderResponse';
import { OrderStatus } from '../../interfaces/OrderStatus';

export class ETResponseMapper {

    
  static mapAccountsResponse(data: any): Account[] {
    let accountsRaw = data?.AccountListResponse?.Accounts?.Account || [];
    let accountsOpen = accountsRaw.filter((acct: any) => acct.accountStatus !== 'CLOSED');
    return accountsOpen.map((acct: any) => new Account(
      acct.accountId != null ? parseInt(acct.accountId, 10) : 0,
      acct.accountIdKey ?? '',
      acct.accountDesc ?? '',
      acct.accountName ?? ''
      // AccountID is not set here
    ));
  }

  static mapAccountBalanceResponse(account: Account, data: any): BrokerAccountBalance {
    const totalAccountValue = data?.BalanceResponse?.Computed?.RealTimeValues?.totalAccountValue ?? null;
    return new BrokerAccountBalance(account, totalAccountValue);
  }

  static mapOrdersResponse(data: any, filledOrdersOnly: boolean = true): Order[] {
    const ordersRaw = data?.OrdersResponse?.Order || [];
    const orders: Order[] = [];
    for (const o of ordersRaw) {
      // Some orders, like One-Cancels-Other, will have multiple executed steps within the same OrderID.
      // Use brokerOrderStep to differentiate.
      // NOTE: we have to process OrderDetail in reverse order to maintain correct step ordering for the
      // caller (since we want the return list to be in chronological order).
      for (let i:number = o.OrderDetail.length - 1; i >= 0; i--) {
        const detail = o.OrderDetail[i];
        let brokerOrderStep: number = i+1;

        for (const instr of detail.Instrument) {
          const newOrder: Order | null = ETResponseMapper.createOrderFromETradePayload(o, detail, instr, brokerOrderStep, filledOrdersOnly);
          if (newOrder) {
            orders.push(newOrder);
          } 
        }
      }
    }
    return orders;
  }

  static mapQuotesResponse(data: any, detailedQuote: boolean = false): Quote[] {
    // Log any messages in the response
    ETResponseMapper.logQuoteMessages(data);

    // Extract quote entries from the response
    const quoteData = data?.QuoteResponse?.QuoteData ?? data?.QuoteData ?? [];
    const quotes: Quote[] = [];

    for (const entry of quoteData) {
      const quote = detailedQuote 
        ? ETResponseMapper.parseDetailedQuote(entry)
        : ETResponseMapper.parseBasicQuote(entry);
      
      if (quote) {
        quotes.push(quote);
      }
    }

    return quotes;
  }

  /**
   * Parse a basic (non-detailed) quote entry from E*TRADE API.
   * Uses Fundamental fields for basic price and company information.
   */
  private static parseBasicQuote(entry: any): Quote | null {
    const symbol = entry?.Product?.symbol;
    const lastTrade = entry?.Fundamental?.lastTrade;
    const price = Number(lastTrade ?? 0);
    const dateTimeUTC = entry?.dateTimeUTC;
    
    if (!symbol) return null;
    if (isNaN(price) || price <= 0) {
      console.warn(`Skipping quote for symbol ${symbol} due to invalid price: ${lastTrade}`);
      return null;
    }

    // dateTimeUTC is a Unix timestamp in seconds
    const lastUpdated = dateTimeUTC ? new Date(dateTimeUTC * 1000) : new Date();
    
    // Extract company name if present on the payload (not persisted in DB). Use null if missing.
    const rawCompany = entry?.Fundamental?.companyName ?? entry?.Fundamental?.symbolDescription ?? null;
    const companyName = rawCompany ? String(rawCompany) : null;

    // Broker responses don't supply QuoteID/AccountID; use 0 placeholders here.
    const q = new Quote(0, 0, symbol, price, lastUpdated);

    // Fields not stored in the DB:
    q.CompanyName = companyName;
    
    return q;
  }

  /**
   * Parse a detailed quote entry from E*TRADE API.
   * Prefers ExtendedHourQuoteDetail fields when available, but falls back to All (and Fundamental) values
   * when extended-hour data is not present (e.g. during regular trading hours).
   */
  private static parseDetailedQuote(entry: any): Quote | null {
    const symbol = entry?.Product?.symbol;
    if (!symbol) return null;

    const all = entry?.All ?? {};
    const extended = all?.ExtendedHourQuoteDetail ?? null;
    const dateTimeUTC = entry?.dateTimeUTC ?? null;
    const fundamentalLast = entry?.Fundamental?.lastTrade ?? null;

    // Price: prefer ExtendedHourQuoteDetail.lastPrice, then All.lastTrade, then Fundamental.lastTrade
    const price = pickNumber(extended?.lastPrice, all?.lastTrade, fundamentalLast);
    if (price === null) {
      console.warn(`Skipping quote for symbol ${symbol} due to invalid price`);
      return null;
    }

    // Timestamp: prefer ExtendedHourQuoteDetail.timeOfLastTrade, then All.timeOfLastTrade, then entry.dateTimeUTC
    const lastUpdated = pickUnixSecondsDate(extended?.timeOfLastTrade, all?.timeOfLastTrade, dateTimeUTC) ?? new Date();

    // Broker responses don't supply QuoteID/AccountID; use 0 placeholders here.
    const q = new Quote(0, 0, symbol, price, lastUpdated);

    // Fields not stored in the DB - extract from All block. Prefer extended data where applicable.
    q.CompanyName = pickString(all?.companyName, all?.symbolDescription, null);

    // Bid/Ask: prefer ExtendedHourQuoteDetail, then All
    q.Bid = pickNumber(extended?.bid, all?.bid) ?? null;
    q.Ask = pickNumber(extended?.ask, all?.ask) ?? null;

    // Daily High/Low from All
    q.DailyHigh = pickNumber(all?.high) ?? null;
    q.DailyLow = pickNumber(all?.low) ?? null;

    // Open price from All
    q.Open = pickNumber(all?.open) ?? null;

    // Previous close from All
    q.PreviousClose = pickNumber(all?.previousClose) ?? null;

    // Beta from All (beta may be zero or negative)
    q.Beta = pickNumberWithOptions([all?.beta], { allowNegative: true, allowZero: true }) ?? null;

    // Change from close: prefer ExtendedHourQuoteDetail.change, then All.changeClose (allow negative / zero)
    const change = pickNumberWithOptions([extended?.change, all?.changeClose], { allowNegative: true, allowZero: true });
    q.ChangeFromClose = (change !== null) ? Number(change) : null;

    // Change from close percentage: prefer ExtendedHourQuoteDetail.percentChange, then All.changeClosePercentage
    const changePct = pickNumberWithOptions([extended?.percentChange, all?.changeClosePercentage], { allowNegative: true, allowZero: true });
    q.ChangeFromClosePct = (changePct !== null) ? Number(changePct) : null;

    // Next earnings date from All (if numeric seconds since epoch)
    const nextEarningsNum = pickNumber(all?.nextEarningDate);
    if (nextEarningsNum !== null) {
      q.NextEarningsDate = new Date(nextEarningsNum * 1000);
    }

    // Ex-dividend date from All (if numeric seconds since epoch)
    const exDivNum = pickNumber(all?.exDividendDate);
    if (exDivNum !== null) {
      q.ExDividendDate = new Date(exDivNum * 1000);
    }

    // Close: use All.lastTrade, only set if after 4pm ET
    if (DateUtils.IsAfterMarketClose(lastUpdated)) {
      q.Close = pickNumber(all?.lastTrade) ?? null;
    }

    return q;
  }

  static mapTransactionsResponse(data: any): Transaction[] {
    const txRaw = data?.TransactionListResponse?.Transaction ?? [];
    const txArray = Array.isArray(txRaw) ? txRaw : [txRaw];
    const transactions: Transaction[] = [];

    for (const t of txArray) {
      if (!t || typeof t !== 'object') continue;

      const rawType = (t.transactionType ?? '').toString().trim();
      const typeKey = rawType.toLowerCase();

      // Only map transaction types that match our TransactionType union.
      let mappedType: TransactionType | null = null;
      if (typeKey === 'transfer' || typeKey === 'online transfer') {
        mappedType = TransactionType.Transfer;
      } 
      else if (typeKey === 'dividend'){
        mappedType = TransactionType.Dividend;
      }
      else {
        // Skip unknown/unsupported transaction types per instruction
        continue;
      }

      // Transaction date: API seems to return milliseconds in many cases. Handle both seconds and ms defensively.
      let txDate: Date = new Date();
      const dateRaw = Number(t.transactionDate ?? 0);
      if (!isNaN(dateRaw) && dateRaw > 0) {
        // If value looks like milliseconds (greater than 1e12) treat as ms, otherwise treat as seconds.
        txDate = dateRaw > 1e12 ? new Date(dateRaw) : new Date(dateRaw * 1000);
      }

      const brokerTxIdNum : number | null = Number(t.transactionId ?? null);
      const amount = Number(t.amount ?? 0);
      const description = t.description ?? '';

      // Best-effort brokerage fields
      const brokerage = t.brokerage ?? {};
      const product = brokerage.product ?? {};
      const quantityRaw = brokerage.quantity;
      const quantity = (quantityRaw === undefined || quantityRaw === null) ? null : Number(quantityRaw);

      // Prefer product.symbol if non-empty; otherwise fallback to brokerage.displaySymbol. 
      // Note: sometimes etrade returns symbol as ' ', so this extra parsing is needed.
      const productSymbol = StingUtils.ParseNotEmpty(product?.symbol ?? null);
      const displaySymbol = StingUtils.ParseNotEmpty(brokerage?.displaySymbol ?? null);
      const symbol = productSymbol ?? displaySymbol ?? null;

      const priceRaw = brokerage.price;
      const price = (priceRaw === undefined || priceRaw === null) ? null : Number(priceRaw);

      try {
        const tx = new Transaction(
          null,     // DB supplied
          brokerTxIdNum,
          txDate,
          description,
          mappedType,
          quantity,
          symbol,
          price,
          amount);

        // Use helper to decide if this mapped transaction should be included.
        if (!ETResponseMapper.shouldIncludeTransaction(tx)) {
          continue;
        }

        transactions.push(tx);
      } catch (err) {
        console.warn('Skipping malformed transaction payload', err);
        continue;
      }
    }

    return transactions;
  }

  static mapPositionsResponse(data: any): Position[] {
    const positionsRaw = data?.PortfolioResponse?.AccountPortfolio[0]?.Position ?? [];
    const positions: Position[] = [];

    for (const p of positionsRaw) {
      if (!p || typeof p !== 'object') {
        console.warn('Skipping malformed position payload');
        continue;
      }

      const symbol = p?.Product?.symbol ?? null;
      if(symbol===null) {
        console.warn('Skipping position with missing symbol');
        continue;
      }
      const qtyRaw = p?.quantity ?? null;
      if(qtyRaw===null) {
        console.warn(`Skipping position for symbol ${symbol} with missing quantity`);
        continue;
      }
      const priceRaw = p?.pricePaid ?? null;
      if(priceRaw===null) {
        console.warn(`Skipping position for symbol ${symbol} with missing price`);
        continue;
      }

      let quantity = Number(qtyRaw);
      quantity = RoundUtil.RoundForDB(quantity)!;
      let price = Number(priceRaw);
      price = RoundUtil.RoundForDB(price)!;

      positions.push(new Position(symbol, quantity, price));
    }

    return positions;
  }


  // Decide whether a mapped transaction should be included in processing.
  // Returns `true` to include, `false` to skip.
  private static shouldIncludeTransaction(tx: Transaction): boolean {
    if (!tx || !tx.Type) return false;

    // Normalize description for case-insensitive checks
    const desc = (tx.Description ?? '').toString().toLowerCase();

    // Skip internal margin/cash transfers
    if (tx.Type === TransactionType.Transfer) {
      if (desc.includes('margin to cash') || desc.includes('cash to margin')) {
        return false;
      }
    } else if (tx.Type === TransactionType.Dividend) {
      // We're only interested in re-invested dividends transactions. Represented by negative amounts. (e.g. money spent to buy new shares).
      // Usually these are paired with positive amount dividends that represent the initial cash inflow.
      if ((tx.Amount ?? 0) >= 0) {
        return false;
      }
    }

    return true;
  }

  static logQuoteMessages(data: any): void {
    const messages = data?.QuoteResponse?.Messages?.Message ?? data?.Messages?.Message ?? data?.Messages ?? [];
    const messageArray = Array.isArray(messages) ? messages : [messages];

    for (const msg of messageArray) {
      if (!msg || typeof msg !== 'object') continue;

      const type = (msg.type ?? '').toString().toLowerCase();
      const code = msg.code ?? '';
      const description = msg.description ?? '';

      const logMessage = `ETrade API: [${code}] ${description}`;

      if (type === 'error') {
        console.error(logMessage);
      } else if (type === 'warning' || type === 'warn') {
        console.warn(logMessage);
      } else {
        console.log(logMessage);
      }
    }
  }

  private static createOrderFromETradePayload(o: any, detail: any, instr: any, brokerOrderStep: number, filledOrdersOnly: boolean = true): Order | null {

    // ETrade returns all orders, regardless if they were cancelled or had a partial fill.
    // By default we only care about executed/filled orders (filledOrdersOnly=true).
    // When filledOrdersOnly is false, include zero-quantity orders as well (used when reconciling broker orders).

    let quantity : number = instr.filledQuantity;
    if(detail.status == 'EXECUTED' || detail.status == 'PARTIALLY_EXECUTED') {
      if(quantity==0 && instr.orderedQuantity>0) {
        quantity = instr.orderedQuantity;
      }
    }
    // If caller requests only filled orders, skip zero-quantity orders
    if(filledOrdersOnly && quantity==0) {
      return null;
    }

    // Sometimes non-equity orders (e.g. options) are returned as part of a combo equity/option order. Skip the options.
    if(instr.Product.securityType!="EQ") {
      console.warn(`Skipping non-equity order: BrokerOrderID=${o.orderId}, Symbol=${instr.Product.symbol}`);
      return null;
    }

    const brokerOrderId = o.orderId;
    const symbol = instr.Product?.symbol;

    let executedTime = detail.executedTime ?? detail.placedTime;  // executedTime can be null on partial fills
    if(executedTime < detail.placedTime) {
      // etrade also borks executedTime on partial fills for cancelled orders. Just use placedTime if that happens.
      executedTime = detail.placedTime;
    }

    const actionRaw = instr.orderAction;
    if (
      brokerOrderId === undefined || brokerOrderId === null || !symbol || executedTime === undefined || 
      executedTime === null || !actionRaw
    ) {
      throw new Error('Missing required order fields: BrokerOrderID, Symbol, ExecutedTime, or Action');
    }

    const action = ETResponseMapper.mapToOrderActionClass(actionRaw);
    let executedPrice: number = Number(instr.averageExecutionPrice ?? 0);
    let fees : number = Number(instr.estimatedCommission ?? 0) + Number(instr.estimatedFees ?? 0);
    let orderAmount : number = Number(quantity * executedPrice);

    // Round to 4 decimal places (use shared util)
    executedPrice = RoundUtil.RoundForDB(executedPrice)!;
    fees = RoundUtil.RoundForDB(fees)!;
    orderAmount = RoundUtil.RoundForDB(orderAmount)!;

    const status = ETResponseMapper.mapToOrderStatus(detail, instr);

    return new Order(
      brokerOrderId,
      brokerOrderStep,
      symbol,
      new Date(executedTime),
      action,
      quantity,
      executedPrice,
      orderAmount,
      fees,
      status,
      null,
      null,
      filledOrdersOnly
    );
  }

  private static mapToOrderActionClass(action: string): OrderAction {
    switch (action.trim().toUpperCase()) {
      case 'SELL_SHORT':
        return new OrderActionSellShort();
      case 'BUY_TO_COVER':
        return new OrderActionBuyToCover();
      case 'BUY':
        return new OrderActionBuy();
      case 'SELL':
        return new OrderActionSell();
      default:
        throw new Error(`Unknown order action: ${action}`);
    }
  }

  private static mapToOrderStatus(detail: any, instr: any): OrderStatus | null {
    const statusRaw = ((detail?.status ?? instr?.fillStatus ?? '') as string).toString().trim().toUpperCase();
    switch (statusRaw) {
      case 'OPEN':
        return OrderStatus.OPEN;
      case 'EXECUTED':
        return OrderStatus.EXECUTED;
      case 'PARTIALLY_EXECUTED':
      case 'PARTIALLY FILLED':
      case 'PARTIALLY_FILLED':
        return OrderStatus.INDIVIDUAL_FILLS;
      case 'CANCELLED':
      case 'CANCELED':
        return OrderStatus.CANCELLED;
      case 'CANCEL_REQUESTED':
      case 'CANCELLED_REQUESTED':
      case 'CANCEL_REQUEST':
        return OrderStatus.CANCEL_REQUESTED;
      case 'EXPIRED':
        return OrderStatus.EXPIRED;
      case 'REJECTED':
        return OrderStatus.REJECTED;
      default:
        return null;
    }
  }

  static mapOptionsChainResponse(data: any): [number | null, OptionPair[]] {
    const nearPrice = data?.OptionChainResponse?.nearPrice ?? null;
    const pairsRaw = data?.OptionChainResponse?.OptionPair || [];

    const out: OptionPair[] = [];
    for (const p of pairsRaw) {
      const call = p?.Call;
      const put = p?.Put;

      if (call) {
        const g = call?.OptionGreeks || {};
        out.push(new OptionPair(
          Number(call?.strikePrice ?? 0),
          Number(g?.rho ?? 0),
          Number(g?.vega ?? 0),
          Number(g?.theta ?? 0),
          Number(g?.delta ?? 0),
          Number(g?.gamma ?? 0), // maps to 'game' field on OptionPair
          Number(g?.iv ?? 0),
          String(call?.displaySymbol ?? ''),
          String(call?.optionType ?? 'CALL') as 'CALL' | 'PUT'
        ));
      }

      if (put) {
        const g = put?.OptionGreeks || {};
        out.push(new OptionPair(
          Number(put?.strikePrice ?? 0),
          Number(g?.rho ?? 0),
          Number(g?.vega ?? 0),
          Number(g?.theta ?? 0),
          Number(g?.delta ?? 0),
          Number(g?.gamma ?? 0),
          Number(g?.iv ?? 0),
          String(put?.displaySymbol ?? ''),
          String(put?.optionType ?? 'PUT') as 'CALL' | 'PUT'
        ));
      }
    }

    return [nearPrice, out];
  }

  static mapOptionsDatesResponse(data: any): OptionExpirationDate[] {
    const datesRaw = data?.OptionExpireDateResponse?.ExpirationDate || [];
    return datesRaw.map((d: any) => new OptionExpirationDate(
      d?.year ?? 0,
      d?.month ?? 0,
      d?.day ?? 0,
      String(d?.expiryType ?? '') as OptionExpiryType
    ));
  }

  /**
   * Extract PreviewOrderResponse content from raw E*TRADE preview response.
   * Returns a PreviewOrderResponse when both a PreviewId and an estimated amount
   * can be parsed, otherwise returns null.
   */
  static mapPreviewOrderResponse(data: any): PreviewOrderResponse | null {
    const resp = data?.PreviewOrderResponse ?? data?.previewOrderResponse ?? null;
    if (!resp) return null;

    // PreviewIds may appear as an array
    const ids = resp?.PreviewIds ?? resp?.previewIds ?? null;
    let previewId: number | null = null;
    if (Array.isArray(ids) && ids.length > 0) {
      const first = Number(ids[0].previewId);
      if (!isNaN(first) && first > 0) previewId = first;
    }
    if (previewId == null) return null;

    // estimated amount may be under Order[0].estimatedTotalAmount or estimatedOrderAmount
    const estimatedField = resp?.Order?.[0]?.estimatedTotalAmount ?? resp?.order?.[0]?.estimatedTotalAmount ?? resp?.estimatedOrderAmount ?? null;
    if (estimatedField === undefined || estimatedField === null) return null;

    let estimatedNum = Number(estimatedField);
    if (isNaN(estimatedNum)) return null;
    estimatedNum=Math.abs(estimatedNum); 

    return new PreviewOrderResponse(previewId, estimatedNum);
  }

}

