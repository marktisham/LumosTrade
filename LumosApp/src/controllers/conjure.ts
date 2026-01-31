import { Request, Response } from 'express';
import { getConjureData } from '../models/conjureModel';

export default async function conjureController(
  req: Request,
  res: Response,
  render: (viewName: string, data?: any) => void
) {
  const data: any = {
    ...getConjureData(),
  };

  render('conjure', data);
}
