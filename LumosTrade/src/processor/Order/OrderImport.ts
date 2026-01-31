import { DataAccess } from '../../database/DataAccess';
import { Account } from '../../interfaces/Account';
import { BrokerClient } from '../../interfaces/BrokerClient';
import { BrokerManager } from '../BrokerManager';
import { RepairConductor } from '../repair/RepairConductor';
import { TransactionImport } from './TransactionImport';
import { SimulationContext } from '../Simulator/SimulationContext';
import { loadModuleConfig } from '../../utils/moduleConfig';

export class OrderImport {

  public static async Import(broker: BrokerClient, account: Account): Promise<boolean> {

    // Optimize our call to the broker by only returning orders after the most recent one we have.
    // Note: this is imprecise as some brokers (like ETrade) only allow filtering by day, so
    // we use the data of the most recent order as a starting place, but then filter older orders
    // out further in the looping below.

    const maxImportDays = process.env.MAX_IMPORT_DAYS ? parseInt(process.env.MAX_IMPORT_DAYS, 10) : Number(loadModuleConfig().get('LumosTrade.defaultMaxImportDays'));
    if (!maxImportDays || maxImportDays <= 0) {
      throw new Error(`maxImportDays must be a positive number. Got: ${maxImportDays}`);
    }
    const maxImportMs = maxImportDays * 24 * 60 * 60 * 1000;
    let fromDateUTC: Date = new Date(Date.now() - maxImportMs);  
    const mostRecentOrder = await DataAccess.GetMostRecentOrder(account);
    let firstImport: boolean = false;
    if (mostRecentOrder) {
      fromDateUTC = mostRecentOrder.ExecutedTime;
    } else {
      firstImport = true;
    }

    let orders = await broker.GetOrders(account, fromDateUTC);

    // Filter out orders that already exist in the database
    const newOrders = await DataAccess.FindNewOrders(account, orders);
    console.log(`Found ${newOrders.length} new orders out of ${orders.length} fetched for account ${account.Name} (${account.AccountID}) from broker ${broker.GetBrokerName()}.`);

    // Insert the new orders in the DB. Ordering doesn't matter as the trade import
    // logic will reload in broker order sequence.
    for (const order of newOrders) {
      await DataAccess.OrderInsert(account, order);
    }

    return firstImport
  }
}
