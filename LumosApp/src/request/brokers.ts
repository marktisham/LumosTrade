import { Request, Response } from 'express';
import { ETCaller, ETClient, SCHClient } from 'lumostrade';

export default async function brokersRequest(req: Request, res: Response) {
  const { action } = req.body;

  try {
    if (action === 'etrade-initiate-auth') {
      // Initiate OAuth1 flow and return the authorization URL and tokens
      const result = await ETCaller.InitiateOAuth1Flow();
      
      // Store request token in secure httpOnly cookies for later use
      res.cookie('etradeRequestToken', result.requestToken, {
        httpOnly: true,
        secure: true,
        maxAge: 10 * 60 * 1000, // 10 minutes
      });
      res.cookie('etradeRequestTokenSecret', result.requestTokenSecret, {
        httpOnly: true,
        secure: true,
        maxAge: 10 * 60 * 1000, // 10 minutes
      });
      
      return res.json({
        success: true,
        authUrl: result.authUrl,
      });
    } else if (action === 'etrade-complete-auth') {
      // Complete OAuth1 flow with verification code
      const { verificationCode } = req.body;
      
      if (!verificationCode) {
        return res.status(400).json({
          success: false,
          error: 'Verification code is required',
        });
      }
      
      // Retrieve request token from cookies
      const requestToken = req.cookies.etradeRequestToken;
      const requestTokenSecret = req.cookies.etradeRequestTokenSecret;
      
      if (!requestToken || !requestTokenSecret) {
        return res.status(400).json({
          success: false,
          error: 'Session expired. Please restart the authorization process.',
        });
      }
      
      await ETCaller.CompleteOAuth1Flow(verificationCode, requestToken, requestTokenSecret);
      
      // Clear cookies
      res.clearCookie('etradeRequestToken');
      res.clearCookie('etradeRequestTokenSecret');
      
      return res.json({
        success: true,
        message: 'E*TRADE API has been authorized successfully!',
      });
    } else if (action === 'import-accounts') {
      // Import accounts from the specified broker
      const { broker } = req.body;
      
      if (!broker || (broker !== 'etrade' && broker !== 'schwab')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid broker specified',
        });
      }
      
      try {
        let accounts;
        if (broker === 'etrade') {
          const etClient = new ETClient();
          accounts = await etClient.ImportAccounts();
        } else {
          const schClient = new SCHClient();
          accounts = await schClient.ImportAccounts();
        }
        
        return res.json({
          success: true,
          accountCount: accounts.length,
        });
      } catch (error: any) {
        console.error(`Error importing accounts from ${broker}:`, error);
        return res.status(500).json({
          success: false,
          error: error.message || 'Failed to import accounts',
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid action',
      });
    }
  } catch (error: any) {
    console.error('Error in brokers request handler:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred',
    });
  }
}
