import { Request, Response } from 'express';
import { Conductor } from 'lumostrade';

export default async function importQuotes(req: Request, res: Response): Promise<void> {
  try {
    console.log('Starting quote refresh import across all accounts...');
    const conductorError = await Conductor.RefreshAllQuotes();
    const refreshErrors = conductorError.FormatFailures();
    console.log('Quote import completed');
    res.json({ 
      success: true, 
      message: 'Quotes refreshed successfully',
      refreshErrors: refreshErrors || undefined
    });
  } catch (error) {
    console.error('Quote import failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh quotes',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
