



import { BrokerClient, Order } from '../..';
import { Account } from '../../interfaces/Account';
import { Position } from '../../interfaces/Position';
import { DataAccess } from '../../database/DataAccess';
import { Trade } from '../../interfaces/Trade';
import { RepairOneOpenTrade } from './RepairOneOpenTrade';
import { RoundUtil } from '../../utils/RoundUtil';

export class RepairAllOpenTrades {

  public static async Repair(broker: BrokerClient, account: Account): Promise<number> {

    // Get open positions and trades to start comparision
    const openPositions : Position[] = await broker.GetPositions(account);
    const openPositionMap: Record<string, Position[]> = Position.MapSymbolToPositions(openPositions);
    const openTrades: Trade[] = await DataAccess.GetOpenTrades(account);
    const openTradeMap: Record<string, Trade[]> = Trade.MapSymbolToTrades(openTrades);

    // Make sure the trade data looks correct
    let repairCount : number = await this.validateBrokerPositionsAgainstOpenTrades(account, openPositionMap, openTradeMap);

    // Fix any open trades that should actually be closed. (most likely we hit a data cutoff when fetching from the broker)
    repairCount += await this.fixInvalidOpenTrades(account, openTradeMap, openPositionMap);
    return repairCount;
  }

  private static async validateBrokerPositionsAgainstOpenTrades(
    account: Account,
    openPositionMap: Record<string, Position[]>,
    openTradeMap: Record<string, Trade[]>
  ): Promise<number> {

    let repairCount : number = 0;
    for (const sym in openPositionMap) {
        // Validate the integrity of the positions list.
        const positionsForSym = openPositionMap[sym];
        if(!positionsForSym) {
            throw new Error(`No positions found for symbol ${sym} in account ${account.Name} (${account.AccountID}).`);
        }
        if(positionsForSym.length != 1) {
            throw new Error(`Found ${positionsForSym.length} open positions for symbol ${sym} in account ${account.Name} (${account.AccountID}), expecting exactly 1.`);
        }
        const positionForSym= positionsForSym[0];

        // Validate the integity of the matching trade, if any.
        const tradesForSym = openTradeMap[sym];
        if(tradesForSym && tradesForSym.length > 0) {
            if(tradesForSym.length>1) {
                throw new Error(`Found ${tradesForSym.length} open trades for symbol ${sym} in account ${account.Name} (${account.AccountID}), expecting a maximum of 1.`);
            } else {
                const tradeForSym = tradesForSym[0];
                if(!RoundUtil.EqualWithinPrecision(tradeForSym.OpenQuantity, positionForSym.Quantity)) {
                    // Quantity mismatch, synch to what's on the broker
                    if(await RepairOneOpenTrade.Repair(account, tradeForSym, positionForSym.Quantity, positionForSym.Price)) {
                        repairCount++;
                    }   
                }
            }
        } else{
            // No open trade found, but we have an open position on the broker. Create one.
            // (it's possible this position pre-dates the earliest order import date allowed)
            if(await RepairOneOpenTrade.CreateMissingOrder(account, positionForSym)) {
                repairCount++;
            }
        }
    }
    return repairCount;
  }

  private static async fixInvalidOpenTrades(
    account: Account,
    openTradeMap: Record<string, Trade[]>,
    openPositionMap: Record<string, Position[]>
  ): Promise<number> {

    let repairCount : number = 0;
    for (const sym in openTradeMap) {
      const positionsForSym = openPositionMap[sym];
      if (!positionsForSym || positionsForSym.length === 0) {
        const trades = openTradeMap[sym] ?? [];
        for (const t of trades) {
          // We have an open trade, but the broker does not. Close out ours.
          if(await RepairOneOpenTrade.Repair(account, t, 0, null)) {
            repairCount++;
          }
        }
      }
    }
    return repairCount;
  }

}
