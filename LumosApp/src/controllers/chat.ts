import { Request, Response } from 'express';
import { getChatData } from '../models/chatModel';

export default async function chatController(
  req: Request,
  res: Response,
  render: (viewName: string, data?: any) => void
) {
  const data: any = {
    ...getChatData(),
  };

  render('chat', data);
}
