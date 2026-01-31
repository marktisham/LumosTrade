import { AppDataAccess } from '../database/AppDataAccess';
import { DataAccess } from 'lumostrade';

export async function getMilestonesData() {
  try {
    const milestones = await AppDataAccess.GetMilestones();
    const accounts = await DataAccess.GetAccounts();
    return {
      title: 'Milestones',
      milestones: milestones,
      accounts: accounts
    };
  } catch (error) {
    console.error('Error fetching milestones:', error);
    return {
      title: 'Milestones',
      milestones: [],
      accounts: []
    };
  }
}
