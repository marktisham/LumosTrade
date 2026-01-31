import { Request, Response } from 'express';
import { getTradeHistoryData } from '../models/tradeHistoryModel';
import { DataAccess } from 'lumostrade';
import { AppDataAccess } from '../database/AppDataAccess';

export default async function tradeHistoryController(
  _req: Request,
  _res: Response,
  render: (viewName: string, data?: any) => void
) {
  try {
    const accounts = await DataAccess.GetAccounts();
    const symbolGroups = await AppDataAccess.GetSymbolGroups();
    const data = await getTradeHistoryData(accounts, symbolGroups);
    render('tradeHistory', data);
  } catch (error) {
    console.error('[tradeHistoryController] Error loading trade history:', error);
    const data = await getTradeHistoryData([], []);
    render('tradeHistory', data);
  }
}
