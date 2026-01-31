import { Request, Response } from 'express';
import { AppDataAccess, ExpectedMoveRow } from '../database/AppDataAccess';
import { ExpectedMovesFilter } from '../database/ExpectedMovesFilter';
import { OptionExpectedMove } from 'lumostrade';

type SortState = {
  key: string;
  direction: string;
};

type ExpectedMovesApiResponse = {
  asOf: string;
  expectedMoves: ExpectedMoveRow[];
  sort: SortState;
  symbols: string[];
};

export default async function expectedMovesRequest(req: Request, res: Response) {
  try {
    // Handle refresh endpoint
    if (req.path.endsWith('/refresh') && req.method === 'POST') {
      await OptionExpectedMove.UpdateExpectedMoves();
      res.json({ success: true });
      return;
    }

    if (req.method === 'GET') {
      const { sortKey, sortDirection, initialValue, expiryTypes } = req.query;
      const filter = ExpectedMovesFilter.fromQueryParams(
        typeof sortKey === 'string' ? sortKey : undefined,
        typeof sortDirection === 'string' ? sortDirection : undefined,
        typeof initialValue === 'string' ? initialValue : undefined,
        typeof expiryTypes === 'string' ? expiryTypes : undefined,
        typeof req.query.symbol === 'string' ? req.query.symbol : undefined
      );

      const expectedMoves = await AppDataAccess.GetExpectedMoves(filter);
      const symbols = await AppDataAccess.GetExpectedMoveSymbols();

      // Determine latest quote LastUpdated among returned rows, if any
      let latestQuote: Date | null = null;
      for (const em of expectedMoves) {
        if ((em as any).QuoteLastUpdated) {
          const d = (em as any).QuoteLastUpdated instanceof Date ? (em as any).QuoteLastUpdated : new Date((em as any).QuoteLastUpdated);
          if (!latestQuote || d > latestQuote) latestQuote = d;
        }
      }

      const payload: ExpectedMovesApiResponse = {
        asOf: latestQuote ? latestQuote.toISOString() : null as any,
        expectedMoves,
        sort: {
          key: filter.sortColumn,
          direction: filter.sortDirection
        },
        symbols
      };
      res.json(payload);
      return;
    }

    if (req.method === 'POST') {
      const { symbol } = req.body as { symbol?: string };
      const value = (symbol || '').trim().toUpperCase();
      if (!value) {
        res.status(400).json({ error: 'Symbol is required' });
        return;
      }
      // Validate only A-Z characters
      if (!/^[A-Z]+$/.test(value)) {
        res.status(400).json({ error: 'Symbol must contain only letters (A-Z)' });
        return;
      }
      // Check for duplicates
      const filter = ExpectedMovesFilter.fromQueryParams();
      const existing = await AppDataAccess.GetExpectedMoves(filter);
      if (existing.some(row => row.Symbol.toUpperCase() === value)) {
        res.status(400).json({ error: `Symbol "${value}" already exists` });
        return;
      }
      await AppDataAccess.AddExpectedMoveSymbol(value);
      res.json({ success: true });
      return;
    }

    if (req.method === 'DELETE') {
      const pathParts = req.path.split('/');
      const symbol = pathParts[pathParts.length - 1];
      if (!symbol || symbol.trim() === '') {
        res.status(400).json({ error: 'Symbol is required' });
        return;
      }
      const value = decodeURIComponent(symbol).trim().toUpperCase();
      await AppDataAccess.DeleteExpectedMoveSymbol(value);
      res.json({ success: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[expectedMovesRequest] Error handling expected moves request:', error);
    res.status(500).json({ error: 'Failed to process expected moves request' });
  }
}
