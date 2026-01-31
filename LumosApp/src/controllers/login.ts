import { Request, Response } from 'express';

export default function loginController(req: Request, res: Response, render: (viewName: string, data?: any) => void) {
  const error = req.query.error;
  render('login', { error });
}
