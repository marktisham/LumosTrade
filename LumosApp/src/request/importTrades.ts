import { Request, Response } from 'express';
import { Conductor, TradeImport} from 'lumostrade';

export default async function importTrades(req: Request, res: Response): Promise<void> {
  try {
    const conductorError = await Conductor.RefreshTheWorld(true);
    const errorMessage = conductorError.FormatFailures();
    
    if (errorMessage) {
      res.json({ 
        success: false, 
        message: 'Trades imported with errors',
        error: errorMessage
      });
    } else {
      res.json({ success: true, message: 'Trades imported successfully' });
    }
  } catch (error) {
    console.error('Trade import failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to import trades',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
