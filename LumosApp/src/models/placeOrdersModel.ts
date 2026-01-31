import { AppDataAccess } from '../database/AppDataAccess';
import { DataAccess } from 'lumostrade';

export async function getPlaceOrdersData() {
  try {
    const accounts = await DataAccess.GetAccounts();
    return {
      title: 'Place Orders',
      accounts: accounts
    };
  } catch (error) {
    console.error('Error fetching place orders data:', error);
    return {
      title: 'Place Orders',
      accounts: []
    };
  }
}
