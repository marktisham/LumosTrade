import { Request, Response } from 'express';
import { Conductor } from 'lumostrade';

export default async function fullResync(req: Request, res: Response): Promise<void> {
  try {
    const conductorError = await Conductor.RefreshTheWorld(false, 5);
    const errorMessage = conductorError.FormatFailures();
    
    if (errorMessage) {
      res.json({ 
        success: false, 
        message: 'Full resync completed with errors',
        error: errorMessage
      });
    } else {
      res.json({ success: true, message: 'Full resync completed successfully' });
    }
  } catch (error) {
    console.error('Full resync failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to complete full resync',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
