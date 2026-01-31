
import { Request, Response } from 'express';
import { getBrokersData } from '../models/brokersModel';
import { SCHCaller, SecretManager } from 'lumostrade';

export default async function brokersController(
  req: Request,
  res: Response,
  render: (viewName: string, data?: any) => void
) {
  // Check for OAuth callback parameters
  const { code, error, error_description } = req.query;
  
  let statusMessage = '';
  let statusType: 'success' | 'error' | '' = '';

  // Build redirect URI
  // Schwab requires exact match (no encoding) with registered URI, and must be https.
  const host = req.get('host');
  const redirectUri = `https://${host}/brokers`;
  const appBaseUrl = `https://${host}`;
  
  // Handle OAuth error
  if (error) {
    statusMessage = error_description ? String(error_description) : String(error);
    statusType = 'error';
  }
  // Handle authorization code (Schwab OAuth2)
  else if (code && typeof code === 'string') {
    try {
      // Exchange code for tokens
      await SCHCaller.StoreInitialAccessToken(code, redirectUri);
      statusMessage = 'Schwab API has been authorized successfully!';
      statusType = 'success';
    } catch (err) {
      console.error('Error exchanging authorization code:', err);
      statusMessage = err instanceof Error ? err.message : 'Failed to complete authorization';
      statusType = 'error';
    }
  } 
  
  // Get page data including current auth status
  let data;
  let secretsReloaded = false;
  let secretManagerError: string | null = null;
  
  try {
    data = await getBrokersData(redirectUri);
    
    // If secrets are invalid, try clearing cache and reloading once
    if (!data.schwab.secretsValid || !data.etrade.secretsValid) {
      console.log('Broker secrets invalid, clearing SecretManager cache and reloading...');
      SecretManager.clearCache();
      
      try {
        data = await getBrokersData(redirectUri);
        secretsReloaded = true;
        
        // If still invalid after reload, note it in console
        if (!data.schwab.secretsValid || !data.etrade.secretsValid) {
          console.log('Broker secrets still invalid after cache reload');
        } else {
          console.log('Broker secrets now valid after cache reload');
        }
      } catch (reloadErr) {
        // If reload fails, capture the error but keep the original data
        console.error('Error reloading secrets:', reloadErr);
        secretManagerError = reloadErr instanceof Error ? reloadErr.message : String(reloadErr);
      }
    }
  } catch (err) {
    console.error('Error loading broker data:', err);
    secretManagerError = err instanceof Error ? err.message : String(err);
    
    // Provide minimal fallback data so page can still render
    data = {
      title: 'Broker Settings',
      schwab: {
        isAuthorized: false,
        authUrl: '#',
        timeRemaining: null,
        tokenExpired: true,
        secretsValid: false
      },
      etrade: {
        isAuthorized: false,
        authUrl: '#',
        timeRemaining: null,
        tokenExpired: true,
        secretsValid: false
      },
      anyBrokersAuthorized: false
    };
  }
  
  // Render with status message if present
  render('brokers', {
    ...data,
    statusMessage,
    statusType,
    appBaseUrl,
    secretsReloaded,
    secretManagerError
  });
}
