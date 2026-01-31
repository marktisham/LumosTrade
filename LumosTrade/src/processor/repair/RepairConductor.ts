import { Account } from '../../interfaces/Account';
import { RepairAllOpenTrades } from './RepairAllOpenTrades';
import { BrokerClient } from '../..';
import { RepairInvalidTrades } from './RepairInvalidTrades';
import { LumosStateHelper } from '../../utils/LumosStateHelper';

export class RepairConductor {

  public static async Repair(broker: BrokerClient, account: Account): Promise<boolean> {
    if (LumosStateHelper.IsDemoMode()) {
      console.log(`RepairConductor: Skipping repairs in demo mode for account ${account.Name} (${account.AccountID}).`);
      return false;
    }

    console.log(`RepairConductor: Searching for any needed repairs for account ${account.Name} (${account.AccountID}).`);
    
    let repairCount = await RepairAllOpenTrades.Repair(broker, account);
    repairCount += await RepairInvalidTrades.Repair(account);

    if(repairCount > 0) {
        console.log(`RepairConductor: Completed repairs for account ${account.Name} (${account.AccountID}). Total repairs made: ${repairCount}.`);
    } else {
        console.log(`RepairConductor: No repairs needed for account ${account.Name} (${account.AccountID}).`);
    }

    return repairCount > 0;
  }

}
