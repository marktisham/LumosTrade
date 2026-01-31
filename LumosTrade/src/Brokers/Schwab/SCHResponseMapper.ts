import { Account } from '../../interfaces/Account';
import { BrokerAccountBalance } from '../../interfaces/AccountHistory';
import { Order } from '../../interfaces/Order';
import { OrderAction } from '../../interfaces/OrderAction';
import { Quote } from '../../interfaces/Quote';
import { Transaction, TransactionType } from '../../interfaces/Transaction';
import { Position } from '../../interfaces/Position';
import { RoundUtil } from '../../utils/RoundUtil';
import { DateUtils } from '../../utils/DateUtils';
import { Instrument } from '../../interfaces/Instrument';
import { DataAccess } from '../../database/DataAccess';

//
// Response mapper for Charles Schwab API responses.
// Maps Schwab-specific API response structures to our common interfaces.
//

export class SCHResponseMapper {

  /**
   * Map Schwab accounts API response to Account[] array
   */
  static mapAccountsResponse(data: any): Account[] {
    const payload = (data && Array.isArray(data)) ? data : (data && Array.isArray(data.data) ? data.data : []);
    if (!Array.isArray(payload)) {
      return [];
    }

    const mapped: Account[] = payload.map((acct: any) => {
      const accountNumber = acct.accountNumber;
      const hashValue = acct.hashValue;

      const brokerAccountId = Number(accountNumber);
      const brokerAccountKey = String(hashValue);
      const name = String(accountNumber);

      return new Account(brokerAccountId, brokerAccountKey, '', name);
    });

    return mapped;
  }

  /**
   * Map Schwab account balance API response to BrokerAccountBalance
   */
  static mapAccountBalanceResponse(account: Account, data: any): BrokerAccountBalance {
    // Schwab response format (example):
    // {
    //   securitiesAccount: { ... },
    //   aggregatedBalance: { liquidationValue: 708464.73, currentLiquidationValue: 708464.73 }
    // }
    // We want the `liquidationValue` from `aggregatedBalance`.

    const agg = data && data.aggregatedBalance ? data.aggregatedBalance : null;
    const liquidation = agg && typeof agg.liquidationValue !== 'undefined' ? agg.liquidationValue : (agg && typeof agg.currentLiquidationValue !== 'undefined' ? agg.currentLiquidationValue : null);
    const total = liquidation != null ? Number(liquidation) : null;
    return new BrokerAccountBalance(account, total);
  }

  /**
   * Map Schwab orders API response to Order[] array
   */
  static mapOrdersResponse(data: any): Order[] {
    // Input expected to be an array of orders (or { data: [...] })
    const payload = (data && Array.isArray(data)) ? data : (data && Array.isArray(data.data) ? data.data : []);
    if (!Array.isArray(payload)) return [];

    const mapped: Order[] = [];

    for (const o of payload) {
      const brokerOrderId = o.orderId ?? null;
      const executedTime = o.closeTime ? new Date(o.closeTime) : (o.enteredTime ? new Date(o.enteredTime) : new Date());

      // For each leg in the order, only include EQUITY legs
      const legs = Array.isArray(o.orderLegCollection) ? o.orderLegCollection : [];
      for (const leg of legs) {
        if ((leg.orderLegType || '').toUpperCase() !== 'EQUITY') continue;

        const quantity = typeof leg.quantity === 'number' ? leg.quantity : (typeof leg.quantity === 'number' ? leg.quantity : 0);
        const brokerOrderStep = typeof leg.legId === 'number' ? leg.legId : 1;
        const symbol = (leg.instrument && leg.instrument.symbol) ? String(leg.instrument.symbol) : null;
        if(symbol == null) {
          console.error(`Missing symbol for order ${brokerOrderId}, leg ${brokerOrderStep}. Skipping.`);
          continue;
        }

        // Determine executed price: look in orderActivityCollection -> executionLegs for matching legId
        let executedPrice = 0;
        if (Array.isArray(o.orderActivityCollection)) {
          for (const act of o.orderActivityCollection) {
            if (!Array.isArray(act.executionLegs)) continue;
            const match = act.executionLegs.find((el: any) => el.legId === leg.legId);
            if (match && typeof match.price === 'number') {
              executedPrice = match.price;
              break;
            }
          }
        }

        // Action mapping uses leg.instruction (e.g., BUY/SELL)
        // TODO: verify Schwab instruction values for short-sale semantics and map them appropriately.
        if(leg.instruction != "BUY" && leg.instruction != "SELL") {
          console.error(`Unsupported order instruction from Schwab: ${leg.instruction} for Order ${brokerOrderId}. Skipping.`);
          continue;
        }
        const action : OrderAction | undefined = OrderAction.CreateFromActionType(leg.instruction);
        if(action==undefined) { 
          console.error(`Failed to map order action from Schwab instruction: ${leg.instruction} for Order ${brokerOrderId}. Skipping.`);
          continue;
        }

        const orderAmount = executedPrice * quantity;

        // Schwab does not appear to provide fees in the response.
        const fees = 0;

        const order = new Order(brokerOrderId, brokerOrderStep, symbol, executedTime, action, quantity, executedPrice, orderAmount, fees);
        mapped.push(order);
      }
    }

    return mapped;
  }

  // Schwab dividend transactions do not give us the symbol, so we need to store
  // a mapping of symbol to description from the orders data so we can look up later.
  static extractInstruments(data: any): Instrument[] {
    const payload = (data && Array.isArray(data)) ? data : (data && Array.isArray(data.data) ? data.data : []);
    if (!Array.isArray(payload)) return [];

    const instrumentsMap = new Map<string, Instrument>();

    for (const o of payload) {
      const legs = Array.isArray(o.orderLegCollection) ? o.orderLegCollection : [];
      for (const leg of legs) {
        if (leg.instrument) {
          const sym = leg.instrument.symbol;
          if (sym && !instrumentsMap.has(sym)) {
            instrumentsMap.set(sym, new Instrument(
              sym,
              leg.instrument.cusip || '',
              leg.instrument.description || ''
            ));
          }
        }
      }
    }
    return Array.from(instrumentsMap.values());
  }

  /**
   * Map Schwab positions API response to Position[] array
   */
  static mapPositionsResponse(data: any): Position[] {
    // Schwab payload shape (example):
    // { securitiesAccount: { positions: [ { longQuantity, shortQuantity, instrument: { symbol }, taxLotAverageLongPrice, averageLongPrice, averagePrice } ] } }
    const secAcct = data && data.securitiesAccount ? data.securitiesAccount : (data && Array.isArray(data) && data[0] && data[0].securitiesAccount ? data[0].securitiesAccount : null);
    const positionsRaw = secAcct && Array.isArray(secAcct.positions) ? secAcct.positions : [];
    if (!Array.isArray(positionsRaw)) return [];

    const positions: Position[] = [];

    for (const p of positionsRaw) {
      if (!p || typeof p !== 'object') {
        console.warn('Skipping malformed Schwab position payload');
        continue;
      }

      const instr = p.instrument ?? p.instrumentDescription ?? null;
      const symbol = instr && instr.symbol ? String(instr.symbol) : null;
      if (!symbol) {
        console.warn('Skipping Schwab position with missing symbol');
        continue;
      }

      // Determine net quantity: prefer longQuantity, fall back to quantity fields
      let quantity: number = 0;
      if (typeof p.longQuantity === 'number') {
        quantity = Number(p.longQuantity);
      } else if (typeof p.quantity === 'number') {
        quantity = Number(p.quantity);
      } else if (typeof p.shortQuantity === 'number') {
        // represent shorts as negative quantities
        quantity = -Number(p.shortQuantity);
      } else {
        console.warn(`Skipping position for ${symbol} with missing quantity`);
        continue;
      }

      // Determine cost basis / price: prefer taxLotAverageLongPrice -> averageLongPrice -> averagePrice
      let priceRaw: any = null;
      if (typeof p.taxLotAverageLongPrice === 'number') priceRaw = p.taxLotAverageLongPrice;
      else if (typeof p.averageLongPrice === 'number') priceRaw = p.averageLongPrice;
      else if (typeof p.averagePrice === 'number') priceRaw = p.averagePrice;
      else if (p.currentDayCost && typeof p.currentDayCost === 'number') priceRaw = p.currentDayCost;

      if (priceRaw === null || isNaN(Number(priceRaw))) {
        console.warn(`Skipping position for ${symbol} with missing price`);
        continue;
      }

      let qty = Number(quantity);
      let price = Number(priceRaw);
      qty = RoundUtil.RoundForDB(qty) ?? qty;
      price = RoundUtil.RoundForDB(price) ?? price;

      positions.push(new Position(symbol, qty, price));
    }

    return positions;
  }

  /**
   * Map Schwab quotes API response to Quote[] array
   */
  static mapQuotesResponse(data: any, detailedQuote: boolean = false): Quote[] {
    // Schwab returns a mapping of symbol -> quote object
    // Accept either `{ data: { AAPL: {...}, MSFT: {...} } }` or the raw mapping.
    const payload = data?.data ?? data ?? {};
    if (!payload || typeof payload !== 'object') return [];

    const quotes: Quote[] = [];

    for (const key of Object.keys(payload)) {
      if (!payload.hasOwnProperty(key)) continue;
      if (key === 'errors') continue; // skip errors block

      const entry = payload[key];
      if (!entry || typeof entry !== 'object') continue;

      const quote = detailedQuote
        ? SCHResponseMapper.parseDetailedQuote(entry, key)
        : SCHResponseMapper.parseBasicQuote(entry, key);

      if (quote) {
        quotes.push(quote);
      }
    }

    return quotes;
  }

  /**
   * Parse a basic (non-detailed) quote entry from Schwab API.
   * Uses quote block for price and basic information.
   */
  private static parseBasicQuote(entry: any, key: string): Quote | null {
    const symbol = entry.symbol ?? key;
    if (!symbol) return null;

    const quoteBlock = entry.quote;
    if (!quoteBlock) return null;

    // Get price from quote.lastPrice
    let price: number | null = null;
    if (typeof quoteBlock.lastPrice === 'number' && quoteBlock.lastPrice > 0) {
      price = Number(quoteBlock.lastPrice);
    }

    if (price === null || isNaN(price) || price <= 0) {
      return null;
    }

    // Determine last updated timestamp from quote.tradeTime or quote.quoteTime
    let lastUpdated = new Date();
    const tryTimes = [quoteBlock.tradeTime, quoteBlock.quoteTime];
    for (const t of tryTimes) {
      if (!t) continue;
      const num = Number(t);
      if (isNaN(num) || num <= 0) continue;
      // Schwab uses milliseconds epoch
      lastUpdated = new Date(num > 1e12 ? num : num * 1000);
      break;
    }

    // Round price for DB consistency
    try {
      const rounded = RoundUtil.RoundForDB(Number(price));
      price = rounded ?? price;
    } catch (err) {
      // ignore rounding errors
    }

    const q = new Quote(0, 0, String(symbol), Number(price), lastUpdated);

    // Fields not stored in the DB:
    const reference = entry.reference;
    const rawCompany = reference?.description ?? null;
    q.CompanyName = rawCompany ? String(rawCompany) : null;

    // Bid/Ask from quote
    const bid = quoteBlock.bidPrice ?? null;
    q.Bid = (bid !== null && !isNaN(Number(bid)) && Number(bid) > 0) ? Number(bid) : null;

    const ask = quoteBlock.askPrice ?? null;
    q.Ask = (ask !== null && !isNaN(Number(ask)) && Number(ask) > 0) ? Number(ask) : null;

    // Daily High/Low from quote
    const high = quoteBlock.highPrice ?? null;
    q.DailyHigh = (high !== null && !isNaN(Number(high))) ? Number(high) : null;

    const low = quoteBlock.lowPrice ?? null;
    q.DailyLow = (low !== null && !isNaN(Number(low))) ? Number(low) : null;

    // Open price from quote
    const open = quoteBlock.openPrice ?? null;
    q.Open = (open !== null && !isNaN(Number(open))) ? Number(open) : null;

    // Previous close from quote
    const prevClose = quoteBlock.closePrice ?? null;
    q.PreviousClose = (prevClose !== null && !isNaN(Number(prevClose))) ? Number(prevClose) : null;

    // Beta not available in Schwab responses
    q.Beta = null;

    // Change from close from quote.markChange and markPercentChange
    const change = quoteBlock.markChange ?? null;
    q.ChangeFromClose = (change !== null && !isNaN(Number(change))) ? Number(change) : null;

    const changePct = quoteBlock.markPercentChange ?? null;
    q.ChangeFromClosePct = (changePct !== null && !isNaN(Number(changePct))) ? Number(changePct) : null;

    // Close: use quote.mark, only set if after 4pm ET
    if (DateUtils.IsAfterMarketClose(lastUpdated)) {
      const mark = quoteBlock.mark ?? null;
      q.Close = (mark !== null && !isNaN(Number(mark))) ? Number(mark) : null;
    }

    return q;
  }

  /**
   * Parse a detailed quote entry from Schwab API.
   * Prioritizes extended block when available, falls back to quote block.
   */
  private static parseDetailedQuote(entry: any, key: string): Quote | null {
    const symbol = entry.symbol ?? key;
    if (!symbol) return null;

    const quoteBlock = entry.quote;
    const extended = entry.extended;
    const reference = entry.reference;

    if (!quoteBlock) return null;

    // Price: use quote.lastPrice
    let price: number | null = null;
    if (typeof quoteBlock.lastPrice === 'number' && quoteBlock.lastPrice > 0) {
      price = Number(quoteBlock.lastPrice);
    }

    if (price === null || isNaN(price) || price <= 0) {
      return null;
    }

    // Timestamp: prefer extended.tradeTime/quoteTime, then quote.tradeTime/quoteTime
    let lastUpdated = new Date();
    const tryTimes = [
      extended?.tradeTime,
      extended?.quoteTime,
      quoteBlock.tradeTime,
      quoteBlock.quoteTime,
    ];
    for (const t of tryTimes) {
      if (!t) continue;
      const num = Number(t);
      if (isNaN(num) || num <= 0) continue;
      // Schwab uses milliseconds epoch
      lastUpdated = new Date(num > 1e12 ? num : num * 1000);
      break;
    }

    // Round price for DB consistency
    try {
      const rounded = RoundUtil.RoundForDB(Number(price));
      price = rounded ?? price;
    } catch (err) {
      // ignore rounding errors
    }

    const q = new Quote(0, 0, String(symbol), Number(price), lastUpdated);

    // Fields not stored in the DB:
    const rawCompany = reference?.description ?? null;
    q.CompanyName = rawCompany ? String(rawCompany) : null;

    // Bid/Ask: prioritize extended if > 0, then quote
    const extendedBid = extended?.bidPrice ?? null;
    const quoteBid = quoteBlock.bidPrice ?? null;
    const bid = (extendedBid !== null && !isNaN(Number(extendedBid)) && Number(extendedBid) > 0) ? extendedBid : quoteBid;
    q.Bid = (bid !== null && !isNaN(Number(bid)) && Number(bid) > 0) ? Number(bid) : null;

    const extendedAsk = extended?.askPrice ?? null;
    const quoteAsk = quoteBlock.askPrice ?? null;
    const ask = (extendedAsk !== null && !isNaN(Number(extendedAsk)) && Number(extendedAsk) > 0) ? extendedAsk : quoteAsk;
    q.Ask = (ask !== null && !isNaN(Number(ask)) && Number(ask) > 0) ? Number(ask) : null;

    // Daily High/Low from quote
    const high = quoteBlock.highPrice ?? null;
    q.DailyHigh = (high !== null && !isNaN(Number(high))) ? Number(high) : null;

    const low = quoteBlock.lowPrice ?? null;
    q.DailyLow = (low !== null && !isNaN(Number(low))) ? Number(low) : null;

    // Open price from quote
    const open = quoteBlock.openPrice ?? null;
    q.Open = (open !== null && !isNaN(Number(open))) ? Number(open) : null;

    // Previous close from quote
    const prevClose = quoteBlock.closePrice ?? null;
    q.PreviousClose = (prevClose !== null && !isNaN(Number(prevClose))) ? Number(prevClose) : null;

    // Beta - not available in Schwab quote responses, leave as null
    q.Beta = null;

    // Change from close: use markChange (change from previous close)
    const change = quoteBlock.markChange ?? null;
    q.ChangeFromClose = (change !== null && !isNaN(Number(change))) ? Number(change) : null;

    // Change from close percentage: use markPercentChange
    const changePct = quoteBlock.markPercentChange ?? null;
    q.ChangeFromClosePct = (changePct !== null && !isNaN(Number(changePct))) ? Number(changePct) : null;

    // Next earnings date from fundamental (ISO date string)
    // Note: Schwab provides lastEarningsDate, so only use it if >= current date
    const fundamental = entry.fundamental;
    if (fundamental) {
      const lastEarnings = fundamental.lastEarningsDate ?? null;
      if (lastEarnings && String(lastEarnings).trim() !== '') {
        const parsed = new Date(lastEarnings);
        const now = new Date();
        if (!isNaN(parsed.getTime()) && parsed >= now) {
          q.NextEarningsDate = parsed;
        }
      }

      // Ex-dividend date from fundamental.nextDivExDate (ISO date string)
      const nextDivEx = fundamental.nextDivExDate ?? null;
      if (nextDivEx && String(nextDivEx).trim() !== '') {
        const parsed = new Date(nextDivEx);
        if (!isNaN(parsed.getTime())) {
          q.ExDividendDate = parsed;
        }
      }
    }

    // Close: use regular.regularMarketLastPrice
    const regular = entry.regular;
    const regularClose = regular?.regularMarketLastPrice ?? null;
    q.Close = (regularClose !== null && !isNaN(Number(regularClose))) ? Number(regularClose) : null;

    return q;
  }

  /**
   * Map Schwab transactions API response to Transaction[] array
   */
  static async mapTransactionsResponse(data: any): Promise<Transaction[]> {
    const payload = (data && Array.isArray(data)) ? data : (data && Array.isArray(data.data) ? data.data : []);
    if (!Array.isArray(payload)) {
      return [];
    }

    const transactions: Transaction[] = [];

    for (const t of payload) {
      if (!t || typeof t !== 'object') continue;

      // Map Schwab transaction type to our TransactionType enum
      const rawType = (t.type ?? '').toString().trim();
      let mappedType: TransactionType | null = null;

      if (rawType === 'DIVIDEND_OR_INTEREST' || rawType === 'RECEIVE_AND_DELIVER') {
        mappedType = TransactionType.Dividend;
      } else if (
        rawType === 'CASH_DISBURSEMENT' ||
        rawType === 'ACH_RECEIPT' ||
        rawType === 'ACH_DISBURSEMENT' ||
        rawType === 'CASH_RECEIPT' ||
        rawType === 'ELECTRONIC_FUND' ||
        rawType === 'WIRE_OUT' ||
        rawType === 'WIRE_IN'
      ) {
        mappedType = TransactionType.Transfer;
      } else {
        // Skip unsupported transaction types
        continue;
      }

      // Parse transaction date (ISO 8601 format with timezone)
      let txDate: Date = new Date();
      const timeStr = t.time ?? t.tradeDate;
      if (timeStr) {
        txDate = new Date(timeStr);
      }

      const brokerTxId = Number(t.activityId ?? 0);
      let amount = Number(t.netAmount ?? 0);
      const description = t.description ?? '';

      // Skip Schwab interest transactions, they're not really symbol-specific dividends or a fund transfer.
      if (description.includes('SCHWAB1 INT')) {
        continue;
      }

      // Schwab dividends are positive amounts, but our system expects negative for dividends (cash in)
      // So invert the amount here.
      if(mappedType === TransactionType.Dividend) {
        amount = -amount;
      }

      // Extract symbol from transferItems (if available)
      let symbol: string | null = null;
      let quantity: number | null = null;
      let price: number | null = null;

      if (Array.isArray(t.transferItems) && t.transferItems.length > 0) {
        // Look for non-CURRENCY instruments in transferItems
        for (const item of t.transferItems) {
          const instrument = item.instrument;
          if (instrument && instrument.assetType !== 'CURRENCY') {
            symbol = instrument.symbol ?? null;
            quantity = item.amount ? Number(item.amount) : null;
            price = item.price ? Number(item.price) : null;
            break; // Use first non-currency instrument
          }
        }
      }

      let tx = new Transaction(
        null,           // TransactionID (DB supplied)
        brokerTxId,
        txDate,
        description,
        mappedType,
        quantity,
        symbol,
        price,
        amount
      );

      // For dividend transactions, look up symbol from Instruments table if not found
      if (mappedType === TransactionType.Dividend && !tx.Symbol && tx.Description) {
        const resolvedSymbol = await SCHResponseMapper.resolveTransactionSymbol(tx);
        if (!resolvedSymbol) {
          // Skip this dividend transaction if symbol cannot be resolved
          continue;
        }
        // Update the constructed transaction with the resolved symbol
        tx.Symbol = resolvedSymbol;
      }

      // Apply filtering rules similar to E*TRADE
      if (!SCHResponseMapper.shouldIncludeTransaction(tx)) {
        continue;
      }

      transactions.push(tx);
    }

    return transactions;
  }

  /**
   * Resolve a symbol for a dividend transaction by looking it up in the Instruments table.
   * Returns the resolved symbol or null if not found.
   * 
   * @param tx - The Transaction object containing Description and optional Symbol
   */
  private static async resolveTransactionSymbol(tx: Transaction): Promise<string | null> {
    try {
      const description = tx.Description ?? '';
      const payloadSymbol = tx.Symbol ?? null;

      // Build search criteria: include payloadSymbol if it's non-empty, otherwise null
      const symbolToSearch = (payloadSymbol && payloadSymbol.length > 0) ? payloadSymbol : null;
      const instruments = await DataAccess.FindInstrument(new Instrument(symbolToSearch, null, description));
      
      if (instruments && instruments.length > 0) {
        // Use the symbol from the first matching instrument
        const resolvedSymbol = instruments[0].Symbol;
        if (resolvedSymbol) {
          return resolvedSymbol;
        }
      }
      
      // No match found - log error with instructions for admin
      console.error(
        `Failed to resolve symbol for dividend transaction (Payload symbol: ${payloadSymbol ?? 'null'}):\n${description}\n` +
        `ACTION REQUIRED: An admin must insert a mapping row into the Instruments table!`
      );
      return null;
    } catch (err) {
      console.error(`Error resolving symbol from description "${tx.Description}":`, err);
      return null;
    }
  }

  /**
   * Decide whether a mapped transaction should be included in processing.
   * Returns `true` to include, `false` to skip.
   */
  private static shouldIncludeTransaction(tx: Transaction): boolean {
    if (!tx || !tx.Type) return false;

    // Normalize description for case-insensitive checks
    const desc = (tx.Description ?? '').toString().toLowerCase();

    // Skip internal transfers (e.g., margin to cash)
    if (tx.Type === TransactionType.Transfer) {
      if (desc.includes('margin to cash') || desc.includes('cash to margin')) {
        return false;
      }
    } else if (tx.Type === TransactionType.Dividend) {
      // The system expects reinvested dividends to be negative amounts (e.g. buying shares)
      // Schwab only returns one dividend amount (which we set to negative), so this theoretically
      // should not fire, but add a safety just in case.
      if ((tx.Amount ?? 0) >= 0) {
        console.log("Skipping schwab dividend transaction with non-negative amount:", tx);
        return false;
      }
    }

    return true;
  }
}
