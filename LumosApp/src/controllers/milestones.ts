import { Request, Response } from 'express';
import { getMilestonesData } from '../models/milestonesModel';

export default async function milestonesController(
  req: Request,
  res: Response,
  render: (viewName: string, data?: any) => void
) {
  const data = await getMilestonesData();
  render('milestones', data);
}
