import { Request, Response } from 'express';
import { Trade, DataAccess } from 'lumostrade';
import { TradeFilter } from '../database/TradeFilter';
import { AppDataAccess } from '../database/AppDataAccess';

export type TradeResponse = {
  TradeID: number | null;
  AccountID: number;
  BrokerID: number;
  Symbol: string;
  LongTrade: boolean;
  WinningTrade: boolean | null;
  OpenDate: string;
  CloseDate: string | null;
  DurationMS: string | null;
  Closed: boolean;
  OpenQuantity: number;
  BreakEvenPrice: number;
  CurrentPrice: number | null;
  CurrentCost: number;
  CurrentValue: number;
  TotalGain: number | null;
  TotalGainPct: number | null;
  LargestRisk: number;
  TotalFees: number;
  TotalOrderCount: number;
  ManuallyAdjusted?: boolean;
  CurrentPriceDateTime?: string | null;
  RealizedGain?: number | null;
  UnrealizedGain?: number | null;
  AvgEntryPrice?: number | null;
  AvgExitPrice?: number | null;
  AccountName?: string;
  BrokerName?: string;
};

type SortState = {
  key: string;
  direction: string;
};

type TradesApiResponse = {
  asOf: string;
  trades: TradeResponse[];
  sort: SortState;
  quotesAsOf?: string | null;
};

const mapTradeToResponse = (trade: Trade): TradeResponse => {
  // Normalize WinningTrade to match the sign of TotalGain when TotalGain is available.
  // Log any inconsistencies to help diagnose root causes (should be rare).
  let winning: boolean | null = trade.WinningTrade ?? null;
  if (trade.TotalGain !== undefined && trade.TotalGain !== null) {
    const implied = (trade.TotalGain >= 0);
    if (winning !== null && winning !== implied) {
      console.warn('[tradesRequest] Inconsistent WinningTrade for TradeID', trade.TradeID, 'WinningTrade:', winning, 'TotalGain:', trade.TotalGain);
    }
    winning = implied;
  }

  return {
    TradeID: trade.TradeID,
    AccountID: trade.AccountID,
    BrokerID: (trade as any).BrokerID,
    Symbol: trade.Symbol,
    LongTrade: trade.LongTrade,
    WinningTrade: winning,
    OpenDate: trade.OpenDate ? trade.OpenDate.toISOString() : new Date().toISOString(),
    CloseDate: trade.CloseDate ? trade.CloseDate.toISOString() : null,
    DurationMS: trade.DurationMS !== null && trade.DurationMS !== undefined ? trade.DurationMS.toString() : null,
    Closed: trade.Closed,
    OpenQuantity: trade.OpenQuantity,
    BreakEvenPrice: trade.BreakEvenPrice,
    CurrentPrice: trade.CurrentPrice === undefined ? null : trade.CurrentPrice,
    CurrentCost: (trade as any).CurrentCost || 0,
    CurrentValue: (trade as any).CurrentValue || 0,
    TotalGain: trade.TotalGain === undefined ? null : trade.TotalGain,
    TotalGainPct: trade.TotalGainPct === undefined ? null : trade.TotalGainPct,
    LargestRisk: trade.LargestRisk,
    TotalFees: trade.TotalFees,
    TotalOrderCount: trade.TotalOrderCount,
    ManuallyAdjusted: (trade as any).ManuallyAdjusted ?? false,
    CurrentPriceDateTime: trade.CurrentPriceDateTime ? trade.CurrentPriceDateTime.toISOString() : null,
    RealizedGain: trade.RealizedGain ?? null,
    UnrealizedGain: trade.UnrealizedGain ?? null,
    AvgEntryPrice: trade.AvgEntryPrice ?? null,
    AvgExitPrice: trade.AvgExitPrice ?? null,
    AccountName: (trade as any).AccountName ?? undefined,
    BrokerName: (trade as any).BrokerName ?? undefined
  };
};

export default async function tradesRequest(req: Request, res: Response) {
  try {
    const { sortKey, sortDirection, longTradeFilter, winningTradeFilter, accountId, brokerId, symbol, tradeId, dateRange, closedState, groupBy } = req.query;
    
    const filter = TradeFilter.fromQueryParams(
      typeof sortKey === 'string' ? sortKey : undefined,
      typeof sortDirection === 'string' ? sortDirection : undefined,
      typeof longTradeFilter === 'string' ? longTradeFilter : undefined,
      typeof winningTradeFilter === 'string' ? winningTradeFilter : undefined,
      typeof accountId === 'string' ? accountId : undefined,
      typeof brokerId === 'string' ? brokerId : undefined,
      typeof symbol === 'string' ? symbol : undefined,
      typeof tradeId === 'string' ? tradeId : undefined,
      typeof dateRange === 'string' ? dateRange : undefined,
      typeof closedState === 'string' ? closedState : undefined,
      typeof groupBy === 'string' ? groupBy : undefined
    );

    if (typeof symbol === 'string' && symbol.startsWith('group:')) {
      const groupId = parseInt(symbol.substring(6), 10);
      if (!isNaN(groupId)) {
        const group = await AppDataAccess.GetSymbolGroup(groupId);
        if (group && group.Symbols) {
          const symbols = group.Symbols.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          if (symbols.length > 0) {
            filter.symbols = symbols;
            filter.symbol = null;
          }
        }
      }
    }

    if (typeof closedState === 'string') {
      if (closedState === 'open' || closedState === 'closed' || closedState === 'all') {
        (filter as any).closedState = closedState;
      }
    }
    
    const trades = await AppDataAccess.GetTrades(filter);
    let latestQuote: Date | null = null;
    try {
      const acct = filter.accountId != null ? { AccountID: filter.accountId } as any : null;
      latestQuote = await DataAccess.GetLatestQuoteUpdate(acct);
    } catch (err) {
      console.warn('[tradesRequest] Unable to fetch latest quote update:', err);
      latestQuote = null;
    }
    
    const payload: TradesApiResponse = {
      asOf: new Date().toISOString(),
      trades: trades.map(mapTradeToResponse),
      sort: {
        key: filter.sortColumn,
        direction: filter.sortDirection
      }
    };

    if (latestQuote) {
      payload.quotesAsOf = latestQuote.toISOString();
    } else {
      payload.quotesAsOf = null;
    }

    res.json(payload);
  } catch (error) {
    console.error('[tradesRequest] Error fetching trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
}


