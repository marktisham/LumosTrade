import { Request, Response } from 'express';
import { getAccountHistoryData } from '../models/accountHistoryModel';

export default async function accountHistoryController(
  _req: Request,
  _res: Response,
  render: (viewName: string, data?: any) => void
) {
  try {
    const data = await getAccountHistoryData();
    render('accountHistory', data);
  } catch (error) {
    console.error('[accountHistoryController] Error loading account history:', error);
    const data = await getAccountHistoryData();
    render('accountHistory', data);
  }
}
