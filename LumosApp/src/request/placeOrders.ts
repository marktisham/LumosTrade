import { Request, Response } from 'express';
import { PlaceOrder, DataAccess, OrderAction, PlaceOrderHelper, BrokerManager, OrderStatus, Order, ErrorHelper } from 'lumostrade';
import { AppDataAccess } from '../database/AppDataAccess';

export type PlaceOrderResponse = {
  PlaceOrderID: number | null;
  AccountID: number;
  AccountName: string;
  BrokerOrderID: number | null;
  Symbol: string;
  Action: string;
  Price: number;
  CurrentPrice?: number | null;
  Quantity: number;
  OrderAmount: number;
  Status: string | null;
  LastUpdated: string | null;
};

export default async function placeOrdersRequest(req: Request, res: Response) {
  try {
    // Handle GET requests for listing all place orders
    if (req.method === 'GET') {
      const sort = (req.query.sort as string) || 'Symbol';
      const dir = (req.query.dir as string) || 'asc';

      const orders = await AppDataAccess.GetPlaceOrders(sort, dir as 'asc' | 'desc');
      
      // Compute latest quote LastUpdated across returned rows (if any)
      let latestQuote: Date | null = null;
      for (const o of orders) {
        if (o.QuoteLastUpdated) {
          const d = o.QuoteLastUpdated instanceof Date ? o.QuoteLastUpdated : new Date(o.QuoteLastUpdated as any);
          if (!latestQuote || d > latestQuote) latestQuote = d;
        }
      }

      const response: PlaceOrderResponse[] = orders.map(order => ({
        PlaceOrderID: order.PlaceOrderID ?? null,
        AccountID: order.AccountID,
        AccountName: order.AccountName,
        BrokerOrderID: order.BrokerOrderID ?? null,
        Symbol: order.Symbol,
        Action: typeof order.Action === 'string' ? order.Action : order.Action.GetActionType(),
        Price: order.Price,
        CurrentPrice: order.CurrentPrice ?? null,
        Quantity: order.Quantity,
        OrderAmount: order.OrderAmount,
        Status: order.Status ?? null,
        LastUpdated: order.LastUpdated ? order.LastUpdated.toString() : null
      }));
      
      res.json({
        quotesAsOf: latestQuote ? latestQuote.toISOString() : null,
        orders: response
      });
      return;
    }

    // Handle POST requests for status refresh or adding a new order
    if (req.method === 'POST') {
      // Support an action=refreshStatus for refreshing PlaceOrder statuses from brokers
      const actionParam = (req.query.action as string) || (req.body && req.body.action);
      if (actionParam === 'refreshStatus') {
        try {
          await PlaceOrderHelper.RefreshOrderStatus();
          res.json({ success: true });
        } catch (err) {
          ErrorHelper.LogErrorForGCP(err, 'Failed to refresh place order status:');
          res.status(500).json({ error: 'Failed to refresh order status' });
        }
        return;
      }

      if (actionParam === 'processOrders') {
        try {
          await PlaceOrderHelper.ProcessOrders();
          res.json({ success: true });
        } catch (err) {
          ErrorHelper.LogErrorForGCP(err, 'Failed to process orders');
          res.status(500).json({ error: 'Failed to process orders' });
        }
        return;
      }

      if (actionParam === 'clearExecuted') {
        try {
          await DataAccess.DeleteExecutedPlaceOrders();
          res.json({ success: true });
        } catch (err) {
          ErrorHelper.LogErrorForGCP(err, 'Failed to clear executed orders');
          res.status(500).json({ error: 'Failed to clear executed orders' });
        }
        return;
      }

      const { accountId, symbol, action, price, quantity } = req.body;

      // Validate required fields
      if (!accountId || isNaN(Number(accountId))) {
        res.status(400).json({ error: 'Valid AccountID is required' });
        return;
      }
      if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
        res.status(400).json({ error: 'Symbol is required' });
        return;
      }
      if (!action || typeof action !== 'string') {
        res.status(400).json({ error: 'Action is required' });
        return;
      }
      if (price == null || isNaN(Number(price)) || Number(price) <= 0) {
        res.status(400).json({ error: 'Valid Price is required' });
        return;
      }
      if (quantity == null || isNaN(Number(quantity)) || Number(quantity) <= 0) {
        res.status(400).json({ error: 'Valid Quantity is required' });
        return;
      }

      // Create new PlaceOrder object
      const orderAction = OrderAction.CreateFromActionType(action.toUpperCase());
      if (!orderAction) {
        res.status(400).json({ error: 'Invalid action type' });
        return;
      }
      
      const newOrder = new PlaceOrder(
        Number(accountId),
        symbol.trim().toUpperCase(),
        orderAction,
        Number(price),
        Number(quantity),
        null,
        null,
        null,
        new Date()
      );

      await DataAccess.UpsertPlaceOrder(newOrder);

      // Fetch back with account name
      const orders = await AppDataAccess.GetPlaceOrders('Symbol', 'asc');
      const insertedOrder = orders.find(o => o.PlaceOrderID === newOrder.PlaceOrderID);
      
      if (!insertedOrder) {
        res.status(500).json({ error: 'Failed to retrieve inserted order' });
        return;
      }

      const response: PlaceOrderResponse = {
        PlaceOrderID: insertedOrder.PlaceOrderID ?? null,
        AccountID: insertedOrder.AccountID,
        AccountName: insertedOrder.AccountName,
        BrokerOrderID: insertedOrder.BrokerOrderID ?? null,
        Symbol: insertedOrder.Symbol,
        Action: typeof insertedOrder.Action === 'string' ? insertedOrder.Action : insertedOrder.Action.GetActionType(),
        Price: insertedOrder.Price,
        Quantity: insertedOrder.Quantity,
        OrderAmount: insertedOrder.OrderAmount,
        Status: insertedOrder.Status ?? null,
        LastUpdated: insertedOrder.LastUpdated ? insertedOrder.LastUpdated.toString() : null
      };
      
      res.json(response);
      return;
    }

    // Handle PATCH requests for updating an existing order
    if (req.method === 'PATCH') {
      const pathParts = req.path.split('/');
      const id = pathParts[pathParts.length - 1];

      if (!id || isNaN(Number(id))) {
        res.status(400).json({ error: 'Invalid ID' });
        return;
      }

      const orderId = Number(id);
      const { price, quantity } = req.body;

      if (price == null || isNaN(Number(price)) || Number(price) <= 0) {
        res.status(400).json({ error: 'Valid Price is required' });
        return;
      }
      if (quantity == null || isNaN(Number(quantity)) || Number(quantity) <= 0) {
        res.status(400).json({ error: 'Valid Quantity is required' });
        return;
      }

      // Fetch the existing order
      const orders = await AppDataAccess.GetPlaceOrders('Symbol', 'asc');
      const existingOrder = orders.find(o => o.PlaceOrderID === orderId);
      
      if (!existingOrder) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      // If the client requested, cancel existing open broker orders first
      const cancelExisting = !!req.body && (req.body.cancelExisting === true || req.body.cancelExisting === 'true');
      if (cancelExisting && existingOrder && existingOrder.Status === OrderStatus.OPEN && existingOrder.BrokerOrderID) {
        try {
          const client = await BrokerManager.MapAccountToBroker(existingOrder.AccountID);
          if (client) {
            const account = await DataAccess.GetAccount(existingOrder.AccountID);
            if (account) {
              const orderToCancel = new Order(
                existingOrder.BrokerOrderID,
                null,
                existingOrder.Symbol,
                new Date(),
                existingOrder.Action,
                existingOrder.Quantity,
                existingOrder.Price,
                existingOrder.OrderAmount,
                0,
                existingOrder.Status
              );

              await client.CancelOrder(account, orderToCancel);
              console.log(`Cancelled OPEN order with BrokerOrderID=${existingOrder.BrokerOrderID} before modifying`);
            }
          }
        } catch (err) {
          ErrorHelper.LogErrorForGCP(err, 'Failed to cancel order before modifying');
        }
      }

      // Update the order with new values
      const updatedOrder = new PlaceOrder(
        existingOrder.AccountID,
        existingOrder.Symbol,
        existingOrder.Action,
        Number(price),
        Number(quantity),
        existingOrder.Status,
        existingOrder.BrokerOrderID,
        orderId,
        new Date()
      );

      await DataAccess.UpsertPlaceOrder(updatedOrder);

      // Refresh statuses from brokers to ensure current state
      try {
        await PlaceOrderHelper.RefreshOrderStatus();
      } catch (err) {
        ErrorHelper.LogErrorForGCP(err, 'Failed to refresh order status after modification');
      }

      // Fetch back the updated order
      const updatedOrders = await AppDataAccess.GetPlaceOrders('Symbol', 'asc');
      const finalOrder = updatedOrders.find(o => o.PlaceOrderID === orderId);
      
      if (!finalOrder) {
        res.status(500).json({ error: 'Failed to retrieve updated order' });
        return;
      }

      const response: PlaceOrderResponse = {
        PlaceOrderID: finalOrder.PlaceOrderID ?? null,
        AccountID: finalOrder.AccountID,
        AccountName: finalOrder.AccountName,
        BrokerOrderID: finalOrder.BrokerOrderID ?? null,
        Symbol: finalOrder.Symbol,
        Action: typeof finalOrder.Action === 'string' ? finalOrder.Action : finalOrder.Action.GetActionType(),
        Price: finalOrder.Price,
        Quantity: finalOrder.Quantity,
        OrderAmount: finalOrder.OrderAmount,
        Status: finalOrder.Status ?? null,
        LastUpdated: finalOrder.LastUpdated ? finalOrder.LastUpdated.toString() : null
      };
      
      res.json(response);
      return;
    }

    // Handle DELETE requests for deleting an order
    if (req.method === 'DELETE') {
      // Extract ID from path
      const pathParts = req.path.split('/');
      const id = pathParts[pathParts.length - 1];

      if (!id || isNaN(Number(id))) {
        res.status(400).json({ error: 'Invalid ID' });
        return;
      }

      const orderId = Number(id);

      // Fetch the existing order to check if it needs to be cancelled
      const orders = await AppDataAccess.GetPlaceOrders('Symbol', 'asc');
      const existingOrder = orders.find(o => o.PlaceOrderID === orderId);
      
      if (existingOrder && existingOrder.Status === OrderStatus.OPEN && existingOrder.BrokerOrderID) {
        try {
          const client = await BrokerManager.MapAccountToBroker(existingOrder.AccountID);
          if (client) {
            const account = await DataAccess.GetAccount(existingOrder.AccountID);
            if (account) {
              // Create Order object for CancelOrder call
              const orderToCancel = new Order(
                existingOrder.BrokerOrderID,
                null,
                existingOrder.Symbol,
                new Date(),
                existingOrder.Action,
                existingOrder.Quantity,
                existingOrder.Price,
                existingOrder.OrderAmount,
                0,
                existingOrder.Status
              );
              
              await client.CancelOrder(account, orderToCancel);
              console.log(`Cancelled OPEN order with BrokerOrderID=${existingOrder.BrokerOrderID} before deletion`);
            }
          }
        } catch (err) {
          ErrorHelper.LogErrorForGCP(err, 'Failed to cancel order before deletion');
        }
      }

      // Create a minimal PlaceOrder object for deletion
      const { OrderActionBuy } = require('lumostrade');
      const orderToDelete = new PlaceOrder(
        1, // dummy accountId
        'DUMMY', // dummy symbol
        new OrderActionBuy(), // dummy action
        1, // dummy price
        1, // dummy quantity
        null,
        null,
        orderId,
        null
      );

      await DataAccess.DeletePlaceOrder(orderToDelete);
      res.json({ success: true });
      return;
    }

    // Method not allowed
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    ErrorHelper.LogErrorForGCP(error, 'Error in placeOrdersRequest');
    res.status(500).json({ error: 'Internal server error' });
  }
}
