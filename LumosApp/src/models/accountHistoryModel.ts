import { DataAccess } from 'lumostrade';
import { AppDataAccess } from '../database/AppDataAccess';

export async function getAccountHistoryData() {
  const accounts = await DataAccess.GetAccounts();
  const milestones = await AppDataAccess.GetMilestones();
  const brokers = await DataAccess.GetBrokers();
  
  return {
    title: 'Account History',
    accounts: accounts.map(account => ({
      AccountID: account.AccountID,
      Name: account.Name,
      BrokerID: (account as any).BrokerID
    })),
    milestones: milestones.map(m => ({
      ID: m.ID,
      Name: m.Name,
      AccountID: m.AccountID,
      DayStart: m.DayStart.toISOString().split('T')[0],
      DayEnd: m.DayEnd ? m.DayEnd.toISOString().split('T')[0] : null
    }))
    ,
    brokers: brokers.map(b => ({ BrokerID: b.BrokerID, Name: b.Name }))
  };
}
