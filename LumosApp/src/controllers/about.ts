import { Request, Response } from 'express';

export default function aboutController(
  req: Request,
  res: Response,
  render: (viewName: string, data?: any) => void
) {
  render('about', { title: 'About' });
}
