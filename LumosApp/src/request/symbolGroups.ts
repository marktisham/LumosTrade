import { Request, Response } from 'express';
import { SymbolGroup } from 'lumostrade';
import { AppDataAccess } from '../database/AppDataAccess';
import { SymbolGroupFilter } from '../database/SymbolGroupFilter';

export type SymbolGroupResponse = {
  ID: number | null;
  Name: string;
  Symbols: string;
  LastUpdated: string;
  RollupGroup: boolean;
};

const mapToResponse = (group: SymbolGroup): SymbolGroupResponse => {
  return {
    ID: group.ID ?? null,
    Name: group.Name,
    Symbols: group.Symbols,
    LastUpdated: group.LastUpdated.toISOString(),
    RollupGroup: !!group.RollupGroup,
  };
};

const validateRollupSymbols = async (symbols: string, rollup: boolean, excludeGroupId?: number): Promise<string | null> => {
  if (!rollup) {
    return null;
  }

  const symbolArray = symbols.split(',').map(s => s.trim().toUpperCase()).filter(s => s !== '');
  const allGroups = await AppDataAccess.GetSymbolGroups();
  const otherRollupGroups = allGroups.filter(g => 
    g.RollupGroup && g.ID !== excludeGroupId
  );

  const conflicts: { symbol: string; groupName: string }[] = [];
  
  for (const symbol of symbolArray) {
    for (const group of otherRollupGroups) {
      const groupSymbols = group.Symbols.split(',').map(s => s.trim().toUpperCase());
      if (groupSymbols.includes(symbol)) {
        conflicts.push({ symbol, groupName: group.Name });
      }
    }
  }

  if (conflicts.length > 0) {
    const conflictMessages = conflicts.map(c => `${c.symbol} (in "${c.groupName}")`);
    return `Each symbol can only belong to exactly one rollup symbol group. Conflicting symbols: ${conflictMessages.join(', ')}`;
  }

  return null;
};

export default async function symbolGroupsRequest(req: Request, res: Response) {
  try {
    const isDemoMode = process.env.DEMO_MODE === 'True' || process.env.DEMO_MODE === 'true';
    const allowDemoEdits = process.env.DEMO_ALLOW_EDITS === 'True' || process.env.DEMO_ALLOW_EDITS === 'true';
    if (req.method !== 'GET' && isDemoMode && !allowDemoEdits) {
      res.status(403).json({ error: 'Edits are disabled in demo mode' });
      return;
    }
    // Handle GET requests for listing all symbol groups
    if (req.method === 'GET') {
      const sort = (req.query.sort as string) || 'Name';
      const dir = (req.query.dir as string) || 'asc';
      const search = (req.query.search as string) || '';

      const filter = new SymbolGroupFilter(
        sort as any,
        dir as any,
        search
      );

      const groups = await AppDataAccess.GetSymbolGroups(filter);
      const response: SymbolGroupResponse[] = groups.map(mapToResponse);
      res.json(response);
      return;
    }

    // Handle POST requests for adding a new symbol group
    if (req.method === 'POST') {
      const { name, symbols, rollup } = req.body;

      // Validate required fields
      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      if (!symbols || typeof symbols !== 'string' || symbols.trim() === '') {
        res.status(400).json({ error: 'Symbols is required' });
        return;
      }

      // Validate rollup symbols don't conflict with other rollup groups
      const rollupError = await validateRollupSymbols(symbols, !!rollup);
      if (rollupError) {
        res.status(400).json({ error: rollupError });
        return;
      }

      // Create new SymbolGroup object
      const newGroup = new SymbolGroup(
        symbols.trim(),
        name.trim(),
        new Date(),
        null,
        !!rollup
      );

      const insertedGroup = await AppDataAccess.AddSymbolGroup(newGroup);
      const response: SymbolGroupResponse = mapToResponse(insertedGroup);
      res.json(response);
      return;
    }

    // Handle PUT requests for updating a symbol group
    if (req.method === 'PUT') {
      // Extract ID from path
      const pathParts = req.path.split('/');
      const id = pathParts[pathParts.length - 1];

      if (!id || isNaN(Number(id))) {
        res.status(400).json({ error: 'Invalid ID' });
        return;
      }

      const groupId = Number(id);
      const { name, symbols, rollup } = req.body;

      // Validate required fields
      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      if (!symbols || typeof symbols !== 'string' || symbols.trim() === '') {
        res.status(400).json({ error: 'Symbols is required' });
        return;
      }

      // Validate rollup symbols don't conflict with other rollup groups
      const rollupError = await validateRollupSymbols(symbols, !!rollup, groupId);
      if (rollupError) {
        res.status(400).json({ error: rollupError });
        return;
      }

      // Create updated SymbolGroup object
      const updatedGroup = new SymbolGroup(
        symbols.trim(),
        name.trim(),
        new Date(), // LastUpdated set to now
        groupId,
        !!rollup
      );

      await AppDataAccess.UpdateSymbolGroup(updatedGroup);
      res.json({ success: true });
      return;
    }

    // Handle DELETE requests for deleting a symbol group
    if (req.method === 'DELETE') {
      // Extract ID from path
      const pathParts = req.path.split('/');
      const id = pathParts[pathParts.length - 1];

      if (!id || isNaN(Number(id))) {
        res.status(400).json({ error: 'Invalid ID' });
        return;
      }

      const groupId = Number(id);

      // Create a minimal SymbolGroup object for deletion
      const groupToDelete = new SymbolGroup('', '', new Date(), groupId);

      await AppDataAccess.DeleteSymbolGroup(groupToDelete);
      res.json({ success: true });
      return;
    }

    // Method not allowed
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in symbolGroupsRequest:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}