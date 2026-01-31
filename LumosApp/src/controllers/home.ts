
import { Request, Response } from 'express';
import { getHomeData } from '../models/homeModel';
import { LumosDatastore } from 'lumostrade';

export default async function homeController(
  req: Request,
  res: Response,
  render: (viewName: string, data?: any) => void
) {
  const isDemoMode = res.locals.demoMode === true;
  let bookmarks = {
    accounts: [],
    trades: [],
    tradeHistory: [],
    accountHistory: [],
    orders: []
  };

  if (!isDemoMode) {
    const datastore = new LumosDatastore();
    
    const keys = ['AccountsViewState','TradeViewState','tradeHistory','AccountHistoryViewState','OrdersViewState'];
    const results = await Promise.allSettled(keys.map(k => datastore.Get(k)));

    const settled: any = {};
    results.forEach((r, i) => {
      const key = keys[i];
      settled[key] = (r.status === 'fulfilled') ? r.value : null;
    });

    bookmarks = {
      accounts: settled['AccountsViewState']?.bookmarks || [],
      trades: settled['TradeViewState']?.bookmarks || [],
      tradeHistory: settled['tradeHistory']?.bookmarks || [],
      accountHistory: settled['AccountHistoryViewState']?.bookmarks || [],
      orders: settled['OrdersViewState']?.bookmarks || []
    };
  }

  const data: any = {
    ...getHomeData(bookmarks),
  };

  render('home', data);
}
