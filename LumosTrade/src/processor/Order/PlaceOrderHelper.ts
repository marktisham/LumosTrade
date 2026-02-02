import { ETClient } from '../../Brokers/ETrade/ETClient';
import { DataAccess } from '../../database/DataAccess';
import { BrokerManager } from '../BrokerManager';
import { PlaceOrderDetail } from '../../interfaces/PlaceOrderDetail';
import { PreviewOrderResponse } from '../../interfaces/PreviewOrderResponse';
import { OrderActionBuy } from '../../interfaces/OrderAction';
import { Order } from '../../interfaces/Order';
import { Account } from '../../interfaces/Account';
import { OrderStatus } from '../../interfaces/OrderStatus';
import { ErrorHelper, LogHelper } from '../..';
import { Conductor } from '../Conductor';
import { Quote } from '../../interfaces/Quote';
import { PlaceOrder } from '../../interfaces/PlaceOrder';

export class PlaceOrderHelper {


  // (re)process any configured orders that are not currently OPEN or EXECUTED
  // This will be called daily at 7:01 AM on a scheduled job to re-open expired
  // extended hours orders (since etrade only allows extended hours orders to be open
  // 1 day at a time, from 7am-8pm EST). 
  // This function is also called by the UI if user wants to open a new order immediately.
  public static async ProcessOrders(): Promise<void> {
    try {
      console.log('Starting ProcessOrders of any pending PlaceOrders...');

      // First get latest order status from broker before attemting to reprocess
      await this.RefreshOrderStatus();  
      const orders = (await DataAccess.GetAllPlaceOrders()).filter(o => this.AllowReprocess(o.Status));
      if (!orders || orders.length === 0) {
        console.log('No pending PlaceOrders to process.');
        return;
      }

      const quotesMap = await this.FetchQuotesForOrders(orders);

      const placedOrders: Array<{accountName: string; symbol: string; action: string; quantity: number; price: number; orderAmount: number; currentPrice?: number}> = [];
      const placementErrors: string[] = [];
      for (const order of orders) {
        try {
          // Load account and broker client
          const acct = await DataAccess.GetAccount(order.AccountID);
          if (!acct) {
            console.warn(`Skipping PlaceOrder ${order.PlaceOrderID}: Account ${order.AccountID} not found`);
            continue;
          }

          const client = await BrokerManager.MapAccountToBroker(order.AccountID);
          if (!client) {
            console.warn(`Skipping PlaceOrder ${order.PlaceOrderID}: No broker client for account ${order.AccountID}`);
            continue;
          }

          // Build PlaceOrderDetail from PlaceOrder row
          const clientOrderId = Date.now(); // always using date for this to avoid etrade order duplication errros.
          await new Promise(resolve => setTimeout(resolve, 5)); // slight delay to ensure unique client order IDs on next loop
          const pod = new PlaceOrderDetail(clientOrderId, order.Symbol, order.Price, order.Quantity, order.Action);

          // Preview the order
          const preview: PreviewOrderResponse | null = await client.PreviewOrder(acct as Account, pod);
          if (!preview) {
            const msg = `PreviewOrder returned null for PlaceOrder ${order.PlaceOrderID} - Account=${acct?.Name || order.AccountID}, Action=${order.Action?.GetActionType?.() || order.Action}, Symbol=${order.Symbol}, Quantity=${order.Quantity}, Amount=${order.OrderAmount}`;
            placementErrors.push(msg);
            continue;
          }

          // Place the order with the broker
          const placeResp = await client.PlaceOrder(acct as Account, pod, preview);
          if (!placeResp) {
            const msg = `PlaceOrder failed or returned null for PlaceOrder ${order.PlaceOrderID} - Account=${acct?.Name || order.AccountID}, Action=${order.Action?.GetActionType?.() || order.Action}, Symbol=${order.Symbol}, Quantity=${order.Quantity}, Amount=${order.OrderAmount}`;
            placementErrors.push(msg);
            continue;
          }
          console.log(`Successfully placed order, AccountID=${order.AccountID}, BrokerOrderID=${placeResp.BrokerOrderID}, Symbol=${order.Symbol}, Action=${order.Action.GetActionType()}, Quantity=${order.Quantity}, Price=${order.Price}`);

          // Capture placed order info for email summary
          const quote = quotesMap.get(order.Symbol);
          placedOrders.push({
            accountName: acct?.Name || '',
            symbol: order.Symbol,
            action: order.Action.GetActionType(),
            quantity: order.Quantity,
            price: order.Price,
            orderAmount: order.OrderAmount,
            currentPrice: quote?.Price,
          });

          // Update PlaceOrder row from response
          order.BrokerOrderID = placeResp.BrokerOrderID;
          order.Status = OrderStatus.OPEN;
          order.LastUpdated = new Date();
          await DataAccess.UpsertPlaceOrder(order);

        } catch (err) {
          const errText = err instanceof Error ? err.message : String(err);
          const errMsg = `Error processing PlaceOrder ${order.PlaceOrderID} - Account=${order.AccountID}, Action=${order.Action?.GetActionType?.() || order.Action}, Symbol=${order.Symbol}, Quantity=${order.Quantity}, Amount=${order.OrderAmount}, Error=${errText}`;
          placementErrors.push(errMsg);
        }
      }

      if (placementErrors.length > 0) {
        const combined = 'PlaceOrder processing encountered the following errors:\n' + placementErrors.map((m, i) => `${i + 1}. ${m}`).join('\n');
        ErrorHelper.LogErrorForGCP(new Error(combined), 'ProcessOrders.PlaceOrderErrors');
      }
      console.log(`ProcessOrders complete. Added ${placedOrders.length} orders.`);

      // If any orders were placed, send an email-style log with details
      if (placedOrders.length > 0) {
        const { subject, body } = PlaceOrderHelper.BuildPlacedOrdersEmail(placedOrders);
        LogHelper.LogForEmail(body, subject);
      }

    } catch (err) {
      ErrorHelper.LogErrorForGCP(err, 'ProcessOrders');
    }
  }

  private static async FetchQuotesForOrders(orders: PlaceOrder[]): Promise<Map<string, Quote>> {
    try {
      await Conductor.RefreshAllQuotes();
      
      const quotesMap = new Map<string, Quote>();
      const accountsToQuery = new Set<number>();
      
      for (const order of orders) {
        accountsToQuery.add(order.AccountID);
      }
      
      for (const accountId of accountsToQuery) {
        const account = await DataAccess.GetAccount(accountId);
        if (account) {
          const accountQuotes = await DataAccess.GetQuotesMap(account);
          for (const [symbol, quote] of accountQuotes) {
            quotesMap.set(symbol, quote);
          }
        }
      }
      
      return quotesMap;
    } catch (err) {
      console.warn('Failed to refresh quotes for orders:', err);
      return new Map<string, Quote>();
    }
  }

  public static async RefreshOrderStatus(): Promise<void> {
    try {
      const ordersToProcess = await DataAccess.GetAllPlaceOrders();
      if (!ordersToProcess || ordersToProcess.length === 0) return;
      const ordersCache = new Map<number, Order[] | null>();

      for (const order of ordersToProcess) {
        if (!order.BrokerOrderID) continue; // nothing to match against
        const acctId = order.AccountID;

        // Ensure we only call GetOrders once per account
        await this.EnsureOrdersCachedForAccount(acctId, ordersCache);
        const acctOrders = ordersCache.get(acctId);
        if (!acctOrders || acctOrders.length === 0) continue;

        // Only update orders that have a BrokerOrderID (meaning we already placed an order w/ broker)
        const match = acctOrders.find(o => o.BrokerOrderID != null && o.BrokerOrderID === order.BrokerOrderID);
        if (!match) continue;

        const newStatus: OrderStatus | null = match.Status ? (match.Status as any) : null;
        order.Status = newStatus;
        order.LastUpdated = new Date();
        await DataAccess.UpsertPlaceOrder(order);
      }
    } catch (err) {
      console.error('RefreshOrderStatus failed:', err);
    }
  }

  /**
   * Return true if an order with the given status should be reprocessed.
   * Orders with status OPEN, EXECUTED, or INDIVIDUAL_FILLS should NOT be reprocessed.
   */
  private static AllowReprocess(status?: OrderStatus | null): boolean {
    if (status == null) return true;
    return !(status === OrderStatus.OPEN || status === OrderStatus.EXECUTED || status === OrderStatus.INDIVIDUAL_FILLS);
  }

  /**
   * Refresh the status of pending PlaceOrder rows by querying each account's broker
   * for recent orders (only one GetOrders call per account).
   */
  private static async EnsureOrdersCachedForAccount(accountId: number, ordersCache: Map<number, Order[] | null>): Promise<void> {
    if (ordersCache.has(accountId)) return;

    const acct = await DataAccess.GetAccount(accountId);
    if (!acct) {
      ordersCache.set(accountId, null);
      return;
    }

    const client = await BrokerManager.MapAccountToBroker(accountId);
    if (!client) {
      ordersCache.set(accountId, null);
      return;
    }

    try {
      // We should be issuing a new extended hours order every trading day, so theoretically
      // we need only look back 1 day to get the status. However, to account for non-trading days
      // (weekends/holidays), we need to look back a few days more. 1 week should be more then enough.
      const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 1 week ago
      const acctOrders = await client.GetOrders(acct as Account, fromDate, false);
      ordersCache.set(accountId, acctOrders);
    } catch (err) {
      console.error(`Failed to fetch orders for account ${accountId}:`, err);
      ordersCache.set(accountId, null);
    }
  }

  /**
   * Build the email subject and body for a list of placed orders.
   */
  private static BuildPlacedOrdersEmail(placedOrders: Array<{accountName: string; symbol: string; action: string; quantity: number; price: number; orderAmount: number; currentPrice?: number}>): { subject: string; body: string } {
    const count = placedOrders.length;
    const subject = `Placed ${count} new order${count === 1 ? '' : 's'}`;

    // Build a Markdown-formatted body for clarity when rendered in email or rich viewers
    const escape = (s: string) => (s || '')
      .replace(/`/g, "'")
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/#/g, '\\#')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const mdLines: string[] = [];
    // Use a Markdown ordered list (each item starts with '1.' to allow renderers to auto-number)
    for (const p of placedOrders) {
      const price = Number.isFinite(p.price) ? `$${p.price.toFixed(2)}` : String(p.price);
      const amount = Number.isFinite(p.orderAmount) ? `$${p.orderAmount.toFixed(2)}` : String(p.orderAmount);
      const currentPrice = p.currentPrice != null && Number.isFinite(p.currentPrice) ? `$${p.currentPrice.toFixed(2)}` : null;
      
      const fields: string[] = [
        `1. **Account:** ${escape(p.accountName)}`,
        `   **Symbol:** \`${escape(p.symbol)}\``,
        `   **Action:** ${escape(p.action)}`,
        `   **Qty:** ${p.quantity}`,
        `   **Order Price:** ${price}`,
        `   **Amount:** ${amount}`,
      ];
      
      if (currentPrice) {
        fields.push(`   **Current Price:** ${currentPrice}`);
      }
      
      mdLines.push(fields.join('  \n'));
    }

    const body = mdLines.join('\n\n');
    return { subject, body };
  }
}

