import { Account, SymbolGroup, DataAccess } from 'lumostrade';
import { AppDataAccess } from '../database/AppDataAccess';

type AccountMap = {
  AccountID: number | null;
  Name: string;
  BrokerID?: number | null;
  BrokerName?: string | null;
};

type SymbolGroupMap = {
  ID: number | null;
  Name: string;
  Symbols: string;
};

export async function getTradeHistoryData(accounts: Account[], symbolGroups: SymbolGroup[]) {
  const brokers = await DataAccess.GetBrokers();
  const brokerMap = new Map(brokers.map(b => [b.BrokerID, b.Name]));
  
  const accountMap: AccountMap[] = accounts.map(account => {
    const accountRaw = account as any;
    const brokerId = accountRaw.BrokerID ?? null;
    return {
      AccountID: account.AccountID ?? null,
      Name: account.Name,
      BrokerID: brokerId,
      BrokerName: brokerId ? (brokerMap.get(brokerId) ?? null) : null
    };
  });

  const symbolGroupMap: SymbolGroupMap[] = symbolGroups.map(sg => ({
    ID: sg.ID ?? null,
    Name: sg.Name,
    Symbols: sg.Symbols
  }));

  const milestones = await AppDataAccess.GetMilestones();

  return {
    title: 'Trade History',
    accountsJson: JSON.stringify(accountMap),
    symbolGroupsJson: JSON.stringify(symbolGroupMap),
    brokersJson: JSON.stringify((brokers || []).map(b => ({ BrokerID: b.BrokerID, Name: b.Name }))),
    milestones: milestones.map(m => ({
      ID: m.ID,
      Name: m.Name,
      AccountID: m.AccountID,
      DayStart: m.DayStart.toISOString().split('T')[0],
      DayEnd: m.DayEnd ? m.DayEnd.toISOString().split('T')[0] : null
    }))
  };
}
