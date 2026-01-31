import { Request, Response } from 'express';
import { getAccountsData } from '../models/accountsModel';

export default async function accountsController(
  _req: Request,
  _res: Response,
  render: (viewName: string, data?: any) => void
) {
  try {
    const data = await getAccountsData();
    render('accounts', data);
  } catch (error) {
    console.error('[accountsController] Error loading accounts:', error);
    const data = await getAccountsData();
    render('accounts', data);
  }
}
