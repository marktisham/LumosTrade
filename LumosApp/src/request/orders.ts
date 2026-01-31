import { Request, Response } from 'express';
import { Order, DataAccess } from 'lumostrade';
import { OrderFilter } from '../database/OrderFilter';
import { AppDataAccess } from '../database/AppDataAccess';

export type OrderResponse = {
  OrderID: number | null;
  AccountID: number;
  BrokerID: number;
  BrokerOrderID: number | null;
  BrokerOrderStep: number | null;
  TradeID: number | null;
  TradeCloseDate: string | null;
  Symbol: string;
  Action: string;
  Quantity: number;
  Price: number;
  Fees: number;
  TotalFees: number;
  OrderAmount: number;
  ExecutedTime: string;
  IncompleteTrade: boolean;
  ManuallyAdjusted?: boolean;
  AdjustedComment?: string | null;
};

type SortState = {
  key: string;
  direction: string;
};

type OrdersApiResponse = {
  asOf: string;
  orders: OrderResponse[];
  sort: SortState;
};

const mapOrderToResponse = (order: Order): OrderResponse => {
  return {
    OrderID: order.OrderID ?? null,
    AccountID: (order as any).AccountID,
    BrokerID: (order as any).BrokerID,
    BrokerOrderID: order.BrokerOrderID,
    BrokerOrderStep: order.BrokerOrderStep,
    TradeID: (order as any).TradeID ?? null,
    TradeCloseDate: (order as any).TradeCloseDate ? (order as any).TradeCloseDate instanceof Date ? (order as any).TradeCloseDate.toISOString() : String((order as any).TradeCloseDate) : null,
    Symbol: order.Symbol,
    Action: order.Action.GetActionType(),
    Quantity: order.Quantity,
    Price: order.ExecutedPrice,
    Fees: order.Fees,
    TotalFees: order.Fees,
    OrderAmount: order.OrderAmount,
    ExecutedTime: order.ExecutedTime.toISOString(),
    IncompleteTrade: (order as any).IncompleteTrade ?? false,
    ManuallyAdjusted: (order as any).ManuallyAdjusted ?? false,
    AdjustedComment: (order as any).AdjustedComment ?? null
  };
};

export default async function ordersRequest(req: Request, res: Response) {
  try {
    const { 
      sortKey, 
      sortDirection, 
      actionFilter, 
      tradeStatusFilter, 
      accountId, 
      brokerId,
      symbol, 
      tradeId,
      brokerOrderId,
      orderId,
      dateRange,
      executedDate
    } = req.query;
    
    // Create OrderFilter with validated parameters (SQL injection protection built-in)
    const filter = OrderFilter.fromQueryParams(
      typeof sortKey === 'string' ? sortKey : undefined,
      typeof sortDirection === 'string' ? sortDirection : undefined,
      typeof actionFilter === 'string' ? actionFilter : undefined,
      typeof tradeStatusFilter === 'string' ? tradeStatusFilter : undefined,
      typeof accountId === 'string' ? accountId : undefined,
      typeof brokerId === 'string' ? brokerId : undefined,
      typeof symbol === 'string' ? symbol : undefined,
      typeof tradeId === 'string' ? tradeId : undefined,
      typeof brokerOrderId === 'string' ? brokerOrderId : undefined,
      typeof orderId === 'string' ? orderId : undefined,
      typeof dateRange === 'string' ? dateRange : undefined,
      typeof executedDate === 'string' ? executedDate : undefined
    );

    // Handle Symbol Group filtering
    if (typeof symbol === 'string' && symbol.startsWith('group:')) {
      const groupId = parseInt(symbol.substring(6), 10);
      if (!isNaN(groupId)) {
        const group = await AppDataAccess.GetSymbolGroup(groupId);
        if (group && group.Symbols) {
          // Split CSV and trim whitespace
          const symbols = group.Symbols.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          if (symbols.length > 0) {
            filter.symbols = symbols;
            // Clear the single symbol filter so it doesn't conflict
            filter.symbol = null;
          }
        }
      }
    }
    
    // Fetch orders from database
    const orders = await AppDataAccess.GetOrders(filter);
    
    const payload: OrdersApiResponse = {
      asOf: new Date().toISOString(),
      orders: orders.map(mapOrderToResponse),
      sort: {
        key: filter.sortColumn,
        direction: filter.sortDirection
      }
    };

    res.json(payload);
  } catch (error) {
    console.error('[ordersRequest] Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
}
