import { Request, Response } from 'express';
import { getExpectedMovesData } from '../models/expectedMovesModel';

export default async function expectedMovesController(
  _req: Request,
  _res: Response,
  render: (viewName: string, data?: any) => void
) {
  try {
    const data = getExpectedMovesData();
    render('expectedMoves', data);
  } catch (error) {
    console.error('[expectedMovesController] Error loading expected moves:', error);
    const data = getExpectedMovesData();
    render('expectedMoves', data);
  }
}
