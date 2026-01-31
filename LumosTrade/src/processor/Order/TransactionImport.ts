import { DataAccess } from '../../database/DataAccess';
import { Account } from '../../interfaces/Account';
import { BrokerClient } from '../../interfaces/BrokerClient';
import { Transaction, TransactionType } from '../../interfaces/Transaction';
import { Order } from '../../interfaces/Order';
import { OrderAction, OrderActionBuy, OrderActionSell } from '../../interfaces/OrderAction';
import { RoundUtil } from '../../utils/RoundUtil';
import { AccountImport } from '../Account/AccountImport';
import { loadModuleConfig } from '../../utils/moduleConfig';

export class TransactionImport {


  public static async Import(broker: BrokerClient, account: Account): Promise<Date | null> {

    // Don't re-import more then we have to.
    let fromDateUTC: Date | null = account.LatestBrokerTransactionDate ?? null;
    if(fromDateUTC == null) {
        const maxImportDays = process.env.MAX_IMPORT_DAYS ? parseInt(process.env.MAX_IMPORT_DAYS, 10) : Number(loadModuleConfig().get('LumosTrade.defaultMaxImportDays'));
        if (!maxImportDays || maxImportDays <= 0) {
          throw new Error(`maxImportDays must be a positive number. Got: ${maxImportDays}`);
        }
        const maxImportMs = maxImportDays * 24 * 60 * 60 * 1000;
        fromDateUTC = new Date(Date.now() - maxImportMs);
        
        // Limit history to the earliest date for which we have balance info from AccountHistory
        const earliestHistoryDate = await DataAccess.GetEarliestAccountHistoryDate(account);
        if (earliestHistoryDate) {
          // Use the max of fromDateUTC and earliestHistoryDate
          fromDateUTC = fromDateUTC > earliestHistoryDate ? fromDateUTC : earliestHistoryDate;
          console.log(`Using earliest AccountHistory date (${earliestHistoryDate.toISOString()}) as fromDateUTC for account ${account.Name} (${account.AccountID}).`);
        }
    }
    let latestAccountTxId: number | null = account.LatestBrokerTransactionID ?? 0;

    console.log(`Fetching transactions for account ${account.Name} (${account.AccountID}) from date ${fromDateUTC.toISOString()}.`);
    const txs : Transaction[] = await broker.GetTransactions(account,fromDateUTC);

    // Record the import start time and use that as the latest transaction date, even
    // if we didn't see transactions up to that date. This is an optimization to future
    // imports since we know we only need to look past this current time for new transactions.
    const importStartUTC: Date = new Date();
    let latestBrokerTxId: number | null = null;
    let earliestTransactionDate: Date | null = null;
    let counts = {
        transactions: 0,
        symbolTransfers: 0,
        accountTransfers: 0,
        dividends: 0
    };

    for(const tx of txs) {
        if(tx.BrokerTransactionID <= latestAccountTxId) {
            // Already processed this transaction
            continue;
        }

        if(latestBrokerTxId==null || tx.BrokerTransactionID > latestBrokerTxId) {
          latestBrokerTxId = tx.BrokerTransactionID;
        }

        // Check to make sure we're not reprocessing an existing transaction.
        if(await this.wasTransactionProcessed(account, tx)) {
            continue;
        }

        switch (tx.Type) {
          case TransactionType.Transfer:
            if(tx.Symbol!=null) {
              if(await this.processSymbolTransfer(account, tx)) {
                  counts.symbolTransfers++;
                  counts.transactions++;
                  // Track the earliest transaction date only if successfully processed
                  if(earliestTransactionDate==null || tx.TransactionDate < earliestTransactionDate) {
                    earliestTransactionDate = tx.TransactionDate;
                  }
              }
            } else {
              if(await this.processAccountFundsTransfer(account, tx)) {
                  counts.accountTransfers++;
                  counts.transactions++;
                  // Track the earliest transaction date only if successfully processed
                  if(earliestTransactionDate==null || tx.TransactionDate < earliestTransactionDate) {
                    earliestTransactionDate = tx.TransactionDate;
                  }
              }
            }
            break;
          case TransactionType.Dividend:
            if(await TransactionImport.processDividendTransaction(account, tx)) {
                counts.dividends++;
                counts.transactions++;
                // Track the earliest transaction date only if successfully processed
                if(earliestTransactionDate==null || tx.TransactionDate < earliestTransactionDate) {
                  earliestTransactionDate = tx.TransactionDate;
                }
            }
            break;
          default:
            // Should not be possible due to filtering during fetch
            console.warn(`Skipping unsupported transaction type: ${tx.Type}`);
            break;
        }
    }

    // Set latest processed transaction ID and date on account to avoid re-processing next time.
    // Use whichever BrokerTxId is greatest: the one we started with on the account
    // (latestAccountTxId) or the latest observed in this import (latestBrokerTxId).
    const finalLatestBrokerTxId: number | null = latestBrokerTxId != null
      ? Math.max(latestBrokerTxId, latestAccountTxId ?? 0)
      : (latestAccountTxId ?? 0);
    await DataAccess.SetAccountLatestBrokerTransaction(account, finalLatestBrokerTxId, importStartUTC);

    // Persist this in case this import is called again (e.g. simulation runs)
    account.LatestBrokerTransactionID = finalLatestBrokerTxId;
    account.LatestBrokerTransactionDate = importStartUTC;

    console.log(`Processed ${counts.transactions} new transactions for account ${account.Name} (${account.AccountID}): ${counts.symbolTransfers} symbol transfers, ${counts.accountTransfers} account transfers, ${counts.dividends} dividends.`);
    return earliestTransactionDate;
  }

  private static async wasTransactionProcessed(account: Account, tx: Transaction): Promise<boolean> {
    if(tx.Symbol!=null) {
      let order : Order | null = await DataAccess.GetOrderForTransaction(account, tx);
      if(order != null) {
        console.log(`Transaction (${tx.Type}) already processed, skipping. Symbol: ${tx.Symbol}, Date: ${tx.TransactionDate}, ID ${tx.BrokerTransactionID}.`);
        return true;
      }
      return false; 
    }
    return false;
  }

  private static async processSymbolTransfer(account: Account, tx: Transaction): Promise<boolean> {
    // We only get a quantity, not a price, on symbol transfers, so we need to find a "best guess".
    // We do this by looking for the most recent order on this symbol (across any account) and using that price.
    // Theoretically this should balance out because we're "selling" from one account and "buying" into another at the same price.
    // (specific trade amounts will be off, but the overall net should be the same).
    if(tx.Symbol==null) {
      throw new Error(`Symbol transfer transaction missing Symbol. TransactionID: ${tx.BrokerTransactionID}, Quantity: ${tx.Quantity}, Date: ${tx.TransactionDate}, Desc: ${tx.Description}`);
    }
    if(tx.Quantity==null || tx.Quantity==0) {
      throw new Error(`Symbol transfer transaction missing Quantity. TransactionID: ${tx.BrokerTransactionID}, Symbol: ${tx.Symbol}, Date: ${tx.TransactionDate}, Desc: ${tx.Description}`);
    }

    // Get the price we should use for the transfer order.
    // If this app ever becomes multi-tenant we'll need to scope this just to the user's tenant. but for now 
    // this works ok. Since this is an account transfer, we can assume there is an order somewhere in the history
    // with this symbol in at least one account, so we'll use the latest price from that. When the second transfer
    // transaction comes in, this call should get that same price again, balancing it out.
    let mostRecentOrderForSymbol = await DataAccess.GetLatestOrderForSymbolAllAccounts(tx.Symbol,tx.TransactionDate);
    if(mostRecentOrderForSymbol==null) {
      console.warn(`No prior orders found for symbol ${tx.Symbol} before transfer date ${tx.TransactionDate}. Skipping symbol transfer. TransactionID: ${tx.BrokerTransactionID}, Quantity: ${tx.Quantity}, Date: ${tx.TransactionDate}, Desc: ${tx.Description}`);
      return false;
    }
    let price = Math.abs(mostRecentOrderForSymbol.ExecutedPrice);

    // Adjust the account by adding or removing the transfer quantity via a simulated order
    let orderAction: OrderAction = tx.Quantity < 0 ? new OrderActionSell() : new OrderActionBuy();
    let quantity = Math.abs(tx.Quantity);

    let actionDesc: string =  `Transferred ${quantity} ${tx.Symbol} `;
    actionDesc+= tx.Quantity < 0 ? `out of account ${account.Name}.` : `into account ${account.Name}.`;
    actionDesc+= ` Used best guess price $${price} from ${mostRecentOrderForSymbol.ExecutedTime}. Broker Description: ${tx.Description}`;

    let amount = quantity * price;
    quantity = RoundUtil.RoundForDB(quantity)!;
    price = RoundUtil.RoundForDB(price)!;
    amount = RoundUtil.RoundForDB(amount)!;
    
    await this.insertAdjustmentOrder(
      account,          // account
      tx,               // transaction
      orderAction,      // action
      quantity,         // quantity
      price,            // executedPrice
      amount,           // orderAmount
      actionDesc        // adjustedComment
    );

    console.log(actionDesc);
    return true;
  }

  private static async processAccountFundsTransfer(account: Account, tx: Transaction): Promise<boolean> {
      console.log(`Processing funds transfer for Account ${account.Name} (${account.AccountID}): Amount: ${tx.Amount}, Date: ${tx.TransactionDate}, Desc: ${tx.Description}`);
      await AccountImport.AddAccountTransfer(account, tx);
      return true;
  }

  private static async processDividendTransaction(account: Account, tx: Transaction): Promise<boolean> {
    if(tx.Amount==null || tx.Amount >=0 ) {
        console.error(`Dividend transaction must have negative Amount. Got: ${tx.Amount}. TransctionID: ${tx.BrokerTransactionID}, Symbol: ${tx.Symbol}, Date: ${tx.TransactionDate}, Desc: ${tx.Description}`);
        return false;
    }
    if(tx.Symbol==null) {
        console.error(`Dividend transaction must have a Symbol. TransctionID: ${tx.BrokerTransactionID}, Amount: ${tx.Amount}, Date: ${tx.TransactionDate}, Desc: ${tx.Description}`);
        return false;
    }
    if(tx.TransactionDate==null) {
        console.error(`Dividend transaction must have a TransactionDate. TransctionID: ${tx.BrokerTransactionID}, Symbol: ${tx.Symbol}, Amount: ${tx.Amount}, Desc: ${tx.Description}`);
        return false;
    }
    let adjustedComment = `Dividend: ${tx.Description}`;

    // Calculate quantity and price to use. (Etrade sometimes returns incomplete data here).
    let amount = tx.Amount;
    let quantity : number = tx.Quantity ?? 0;
    let price : number = tx.Price ?? 0;

    // If we didn't get quantity or price, try to infer it from the other and the amount.
    if(quantity == 0 && price !=0) {
        quantity = amount / price;
    } else if (price == 0 && quantity !=0) { 
        price = amount / quantity;
    }

    // If we still don't have quantity or price, check the most recent pricing we have for that symbol anywhere and use that.
    if(price == 0) {
      let mostRecentOrderForSymbol = await DataAccess.GetLatestOrderForSymbolAllAccounts(tx.Symbol,tx.TransactionDate);
      if(mostRecentOrderForSymbol==null) {
        console.warn(`Unable to determine price for dividend transaction. Skipping. Symbol: ${tx.Symbol}, Amount: ${tx.Amount}, Date: ${tx.TransactionDate}, Desc: ${tx.Description}`);
        return false;
      }
      price = mostRecentOrderForSymbol.ExecutedPrice;
      adjustedComment+=". NOTE: price unavailable so using best guess amount of " + price + " from " + mostRecentOrderForSymbol.ExecutedTime;
      quantity = amount / price;
    }

    // Give up if we still have nothing.
    if(quantity == 0 || price == 0) {
        console.warn(`Unable to determine quantity and price for dividend transaction. Skipping. Symbol: ${tx.Symbol}, Amount: ${tx.Amount}, Date: ${tx.TransactionDate}, Desc: ${tx.Description}`);
        return false;
    }

    // Clean up the values
    quantity = Math.abs(quantity);  
    price = Math.abs(price);
    amount = Math.abs(amount);  
    quantity = RoundUtil.RoundForDB(quantity)!;
    price = RoundUtil.RoundForDB(price)!;
    amount = RoundUtil.RoundForDB(amount)!;

    // Insert new order representing this dividend
    await this.insertAdjustmentOrder(
      account,                 // account
      tx,                      // transaction
      new OrderActionBuy(),    // action
      quantity,                // quantity
      price,                   // executedPrice
      amount,                  // orderAmount
      adjustedComment          // adjustedComment
    );
    return true;
  }

  private static async insertAdjustmentOrder(
    account: Account,
    transaction: Transaction,
    action: OrderAction,
    quantity: number,
    executedPrice: number,
    orderAmount: number,
    adjustedComment: string
  ): Promise<void> {
    if(transaction.Symbol==null) {
      throw new Error('Cannot insert adjustment order with null symbol.');
    }

    const newOrder = new Order(
      null,                           // BrokerOrderID
      null,                           // BrokerOrderStep
      transaction.Symbol,             // Symbol
      transaction.TransactionDate,    // ExecutedTime
      action,                         // Action
      quantity,                       // Quantity
      executedPrice,                  // ExecutedPrice
      orderAmount,                    // OrderAmount
      0,                              // Fees
      null,                           // OrderID (optional)
      null                            // TradeID (optional)
    );
    newOrder.ManuallyAdjusted = true;
    newOrder.AdjustedComment = adjustedComment;
    newOrder.BrokerTransactionID = transaction.BrokerTransactionID;

    await DataAccess.OrderInsert(account, newOrder);
  }

  
}

