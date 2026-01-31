import { DataAccess } from 'lumostrade';
import { AppDataAccess } from '../database/AppDataAccess';

export async function getAccountsData() {
  const brokers = await DataAccess.GetBrokers();
  return {
    title: 'Account Balances',
    brokers: (brokers || []).map(b => ({ BrokerID: b.BrokerID, Name: b.Name }))
  };
}
