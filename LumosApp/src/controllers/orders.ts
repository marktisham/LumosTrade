import { Request, Response } from 'express';
import { getOrdersData } from '../models/ordersModel';
import { DataAccess } from 'lumostrade';
import { AppDataAccess } from '../database/AppDataAccess';

export default async function ordersController(
  _req: Request,
  _res: Response,
  render: (viewName: string, data?: any) => void
) {
  try {
    const accounts = await DataAccess.GetAccounts();
    const symbolGroups = await AppDataAccess.GetSymbolGroups();
    const brokers = await DataAccess.GetBrokers();
    const milestones = await AppDataAccess.GetMilestones();
    const data = getOrdersData(accounts, symbolGroups, brokers, milestones);
    render('orders', data);
  } catch (error) {
    console.error('[ordersController] Error loading accounts:', error);
    const data = getOrdersData([], [], [], []);
    render('orders', data);
  }
}
