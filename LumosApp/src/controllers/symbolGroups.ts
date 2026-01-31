
import { Request, Response } from 'express';
import { getSymbolGroupsData } from '../models/symbolGroupsModel';

export default async function symbolGroupsController(
  req: Request,
  res: Response,
  render: (viewName: string, data?: any) => void
) {
  const data = await getSymbolGroupsData();
  render('symbolGroups', data);
}
