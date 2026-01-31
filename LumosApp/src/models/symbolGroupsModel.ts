
import { AppDataAccess } from '../database/AppDataAccess';

export async function getSymbolGroupsData() {
  try {
    const groups = await AppDataAccess.GetSymbolGroups();
    return {
      title: 'Symbol Groups',
      groups: groups
    };
  } catch (error) {
    console.error('Error fetching symbol groups:', error);
    return {
      title: 'Symbol Groups',
      groups: []
    };
  }
}
