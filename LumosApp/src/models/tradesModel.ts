import { Account, SymbolGroup, Broker, Milestone } from 'lumostrade';

type AccountMap = {
  AccountID: number | null;
  Name: string;
  BrokerID: number;
};

type SymbolGroupMap = {
  ID: number | null;
  Name: string;
  Symbols: string;
};

export function getTradesData(accounts: Account[], symbolGroups: SymbolGroup[], brokers: Broker[], milestones: Milestone[]) {
  const accountMap: AccountMap[] = accounts.map(account => ({
    AccountID: account.AccountID ?? null,
    Name: account.Name,
    BrokerID: (account as any).BrokerID
  }));

  const symbolGroupMap: SymbolGroupMap[] = symbolGroups.map(sg => ({
    ID: sg.ID ?? null,
    Name: sg.Name,
    Symbols: sg.Symbols
  }));

  return {
    title: 'Open Trades',
    accountsJson: JSON.stringify(accountMap),
    symbolGroupsJson: JSON.stringify(symbolGroupMap),
    brokers: (brokers || []).map(b => ({ BrokerID: b.BrokerID, Name: b.Name })),
    milestones: milestones.map(m => ({
      ID: m.ID,
      Name: m.Name,
      AccountID: m.AccountID,
      DayStart: m.DayStart.toISOString().split('T')[0],
      DayEnd: m.DayEnd ? m.DayEnd.toISOString().split('T')[0] : null
    }))
  };
}


