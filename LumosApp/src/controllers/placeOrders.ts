import { Request, Response } from 'express';
import { getPlaceOrdersData } from '../models/placeOrdersModel';

export default async function placeOrdersController(
  req: Request,
  res: Response,
  render: (viewName: string, data?: any) => void
) {
  const data = await getPlaceOrdersData();
  render('placeOrders', data);
}
