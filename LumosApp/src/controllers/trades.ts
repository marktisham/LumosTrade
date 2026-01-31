import { Request, Response } from 'express';
import { getTradesData } from '../models/tradesModel';
import { DataAccess } from 'lumostrade';
import { AppDataAccess } from '../database/AppDataAccess';

export default async function tradesController(
  _req: Request,
  _res: Response,
  render: (viewName: string, data?: any) => void
) {
  try {
    const accounts = await DataAccess.GetAccounts();
    const symbolGroups = await AppDataAccess.GetSymbolGroups();
    const brokers = await DataAccess.GetBrokers();
    const milestones = await AppDataAccess.GetMilestones();
    const data = getTradesData(accounts, symbolGroups, brokers, milestones);
    render('trades', data);
  } catch (error) {
    console.error('[tradesController] Error loading accounts:', error);
    const data = getTradesData([], [], [], []);
    render('trades', data);
  }
}


