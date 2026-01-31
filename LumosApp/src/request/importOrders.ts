import { Request, Response } from 'express';
import { Conductor } from 'lumostrade';

export default async function importOrders(req: Request, res: Response): Promise<void> {
  try {
    const conductorError = await Conductor.RefreshTheWorld(true);
    const errorMessage = conductorError.FormatFailures();
    
    if (errorMessage) {
      res.json({ 
        success: false, 
        message: 'Orders imported with errors',
        error: errorMessage
      });
    } else {
      res.json({ success: true, message: 'Orders imported successfully' });
    }
  } catch (error) {
    console.error('Order import failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to import orders',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
