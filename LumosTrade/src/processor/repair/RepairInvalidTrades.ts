import { DataAccess } from '../../database/DataAccess';
import { Account } from '../../interfaces/Account';
import { Trade } from '../../interfaces/Trade';
import { Order } from '../../interfaces/Order';
import { RepairOneOpenTrade } from './RepairOneOpenTrade';

export interface RepairIssue {
  AccountID: number;
  BrokerOrderID: number;
  Message: string;
}

export class RepairInvalidTrades {

  // Account constants
  private static readonly ETF = 1;
  private static readonly IRA = 2;
  private static readonly TRADING = 3;
  private static readonly ALGOS = 4;


  public static getRepairList(account: Account): RepairIssue[] {
    // The repair list contains BrokerOrderIDs that should be removed and their orders marked incomplete.
    const repairList: RepairIssue[] = [
      { AccountID: this.ETF, BrokerOrderID: 116, Message: 'Trade discarded: SCHD share split invalidated totals.' },
      { AccountID: this.ALGOS, BrokerOrderID: 398, Message: 'Trade discarded: SCHD share split invalidated totals.' },
    ];

    // Only return the account we're currently processing
    const accountId = account?.AccountID ?? null;
    if (accountId == null) return [];
    return repairList.filter(e => e.AccountID === accountId);
  }


  public static async Repair(account: Account): Promise<number> {
    const issues = this.getRepairList(account);
    let successCount = 0;
    for (const issue of issues) {
        if(await this.processIssue(account, issue)) {
            successCount++;
        }
    }
    return successCount;
  }

  private static async processIssue(account: Account, issue: RepairIssue): Promise<boolean> {

    // First look up the order
    const order = await DataAccess.GetOrderFromBrokerID(account, issue.BrokerOrderID);
    if (!order) {
      console.log(`RepairInvalidTrades: Could not find order with BrokerOrderID ${issue.BrokerOrderID} for account ${account.Name} (${account.AccountID}). Skipping repair.`);
      return false;
    }

    // Check to see if we've already repaired this.
    if (order.TradeID == null) {
        return false;
    }

    // Get all the orders for this trade
    let trade : Trade = Trade.FromTradeID(order.TradeID);
    let ordersForTrade: Order[] = await DataAccess.GetOrdersForTrade(account, trade);

    // Delete the trade, it's dead to us now
    await DataAccess.DeleteTrade(account, { TradeID: order.TradeID } as any);

    // Mark up all the orders to be incomplete so they do not get reprocessed
    for (let o of ordersForTrade) {
        if(o.OrderID == null) {
            throw new Error(`Order for OrderID ${o.OrderID} in account ${account.Name} (${account.AccountID}) has null OrderID, cannot mark as incomplete.`);
        }

        o.TradeID = null;
        o.IncompleteTrade = true;
        o.ManuallyAdjusted=true;
        if (o.AdjustedComment != null && o.AdjustedComment !== undefined) {
            o.AdjustedComment += ". " + issue.Message;
        } else {
            o.AdjustedComment = issue.Message;
        }

        await DataAccess.UpdateOrder(account, o);
    }
    console.log(`Repair removed invalid trade for ${trade.Symbol}, BrokerOrderID ${issue.BrokerOrderID} in account ${account.Name} (${account.AccountID}).`);

    return true;
  }

}
