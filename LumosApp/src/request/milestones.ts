import { Request, Response } from 'express';
import { Milestone } from 'lumostrade';
import { AppDataAccess } from '../database/AppDataAccess';
import { MilestoneFilter } from '../database/MilestoneFilter';

export type MilestoneResponse = {
  ID: number | null;
  AccountID: number | null;
  DayStart: string;
  DayEnd: string | null;
  Name: string;
};

const mapToResponse = (milestone: Milestone): MilestoneResponse => {
  return {
    ID: milestone.ID ?? null,
    AccountID: milestone.AccountID ?? null,
    DayStart: milestone.DayStart.toISOString().split('T')[0], // Date only
    DayEnd: milestone.DayEnd ? milestone.DayEnd.toISOString().split('T')[0] : null,
    Name: milestone.Name,
  };
};

export default async function milestonesRequest(req: Request, res: Response) {
  try {
    const isDemoMode = process.env.DEMO_MODE === 'True' || process.env.DEMO_MODE === 'true';
    const allowDemoEdits = process.env.DEMO_ALLOW_EDITS === 'True' || process.env.DEMO_ALLOW_EDITS === 'true';
    if (req.method !== 'GET' && isDemoMode && !allowDemoEdits) {
      res.status(403).json({ error: 'Edits are disabled in demo mode' });
      return;
    }
    // Handle GET requests for listing all milestones
    if (req.method === 'GET') {
      const sort = (req.query.sort as string) || 'DayStart';
      const dir = (req.query.dir as string) || 'desc';

      const filter = new MilestoneFilter(
        sort as any,
        dir as any
      );

      const milestones = await AppDataAccess.GetMilestones(filter);
      const response: MilestoneResponse[] = milestones.map(mapToResponse);
      res.json(response);
      return;
    }

    // Handle POST requests for adding a new milestone
    if (req.method === 'POST') {
      const { name, dayStart, dayEnd, accountId } = req.body;

      // Validate required fields
      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      if (!dayStart) {
        res.status(400).json({ error: 'DayStart is required' });
        return;
      }

      const dayStartDate = new Date(dayStart);
      if (isNaN(dayStartDate.getTime())) {
        res.status(400).json({ error: 'Invalid DayStart date' });
        return;
      }

      let dayEndDate: Date | null = null;
      if (dayEnd) {
        dayEndDate = new Date(dayEnd);
        if (isNaN(dayEndDate.getTime())) {
          res.status(400).json({ error: 'Invalid DayEnd date' });
          return;
        }
      }

      const accId = accountId ? Number(accountId) : null;

      // Create new Milestone object
      const newMilestone = new Milestone(
        dayStartDate,
        name.trim(),
        accId,
        dayEndDate
      );

      const insertedMilestone = await AppDataAccess.AddMilestone(newMilestone);
      const response: MilestoneResponse = mapToResponse(insertedMilestone);
      res.json(response);
      return;
    }

    // Handle PUT requests for updating a milestone
    if (req.method === 'PUT') {
      // Extract ID from path
      const pathParts = req.path.split('/');
      const id = pathParts[pathParts.length - 1];

      if (!id || isNaN(Number(id))) {
        res.status(400).json({ error: 'Invalid ID' });
        return;
      }

      const milestoneId = Number(id);
      const { name, dayStart, dayEnd, accountId } = req.body;

      // Validate required fields
      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'Name is required' });
        return;
      }
      if (!dayStart) {
        res.status(400).json({ error: 'DayStart is required' });
        return;
      }

      const dayStartDate = new Date(dayStart);
      if (isNaN(dayStartDate.getTime())) {
        res.status(400).json({ error: 'Invalid DayStart date' });
        return;
      }

      let dayEndDate: Date | null = null;
      if (dayEnd) {
        dayEndDate = new Date(dayEnd);
        if (isNaN(dayEndDate.getTime())) {
          res.status(400).json({ error: 'Invalid DayEnd date' });
          return;
        }
      }

      const accId = accountId ? Number(accountId) : null;

      // Create updated Milestone object
      const updatedMilestone = new Milestone(
        dayStartDate,
        name.trim(),
        accId,
        dayEndDate,
        milestoneId
      );

      await AppDataAccess.UpdateMilestone(updatedMilestone);
      res.json({ success: true });
      return;
    }

    // Handle DELETE requests for deleting a milestone
    if (req.method === 'DELETE') {
      // Extract ID from path
      const pathParts = req.path.split('/');
      const id = pathParts[pathParts.length - 1];

      if (!id || isNaN(Number(id))) {
        res.status(400).json({ error: 'Invalid ID' });
        return;
      }

      const milestoneId = Number(id);

      // Create a minimal Milestone object for deletion
      // We need to provide required fields for constructor, but they won't be used for delete
      const milestoneToDelete = new Milestone(new Date(), '', null, null, milestoneId);

      await AppDataAccess.DeleteMilestone(milestoneToDelete);
      res.json({ success: true });
      return;
    }

    // Method not allowed
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in milestonesRequest:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
