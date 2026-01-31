import { OAuth2Client, OAuth2Config } from '../../utils/OAuth2Client';
import { loadModuleConfig } from '../../utils/moduleConfig';
import { LumosDatastore } from '../../utils/LumosDatastore';
import { SecretManager } from '../../utils/SecretManager';
import { BrokerCaller, TimeRemaining } from '../BrokerCaller';

export class SCHCaller extends BrokerCaller {

  //
  // OAuth2 Token Management for Scwhab API
  //

  // Callback function to persist tokens after refresh
  private static tokenUpdateCallback?: (oauthClient: OAuth2Client) => Promise<void>;
  private static get SchwabDatastoreKey(): string { return loadModuleConfig().get('brokers.schwab.oauth2.DatastoreKey'); }

  /**
   * Set the callback function to be called after token refresh.
   * This allows SCHCaller to persist updated tokens without creating circular dependencies.
   */
  public static setTokenUpdateCallback(callback: (oauthClient: OAuth2Client) => Promise<void>): void {
    SCHCaller.tokenUpdateCallback = callback;
  }

  /**
   * Initialize OAuth2 flow and store the access token in Datastore.
   * Call this method once to set up the initial OAuth2 tokens.
   *
   * Steps:
   * 1. Get the authorization URL from this method
   * 2. Navigate to that URL in a browser and authorize the app
   * 3. Copy the authorization code from the redirect URL
   * 4. Call this method with the authorization code
   *
   * @param authorizationCode The authorization code from Schwab OAuth2 redirect
   * @param redirectUri The redirect URI used in the OAuth2 flow (must match config)
   */
  public static async StoreInitialAccessToken(authorizationCode: string, redirectUri: string): Promise<void> {
    const secrets = await SecretManager.getSecrets();
    const config: OAuth2Config = {
      clientId: secrets.Brokers.schwab.appKey,
      clientSecret: secrets.Brokers.schwab.secret,
      tokenUrl: loadModuleConfig().get('brokers.schwab.oauth2.TokenURL'),
      authUrl: loadModuleConfig().get('brokers.schwab.oauth2.AuthURL'),
    };

    const tempClient = new OAuth2Client(config, '', undefined, undefined);
    const tokenResponse = await tempClient.exchangeCodeForToken(authorizationCode, redirectUri);

    const tokenExpiresDays = secrets.Brokers.schwab.tokenExpiresDays;
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + tokenExpiresDays);

    const datastoreHelper = new LumosDatastore(true);
    await datastoreHelper.Set(SCHCaller.SchwabDatastoreKey, {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
      tokenType: tokenResponse.token_type,
      scope: tokenResponse.scope,
      lastUpdated: new Date().toISOString(),
      tokenExpirationDate: expirationDate.toISOString()
    });

    console.log('Schwab OAuth2 tokens successfully stored in Datastore');

    // Reset the SCHClient's cached OAuth client to force re-initialization with new tokens
    const { SCHClient } = await import('./SCHClient');
    SCHClient.ResetOAuthClient();
  }

  /**
   * Get the authorization URL for the OAuth2 flow.
   * Navigate to this URL in a browser to authorize the application.
   * @param redirectUri The redirect URI to append to the authorization URL
   */
  public static async GetAuthorizationUrl(redirectUri?: string): Promise<string> {
    const secrets = await SecretManager.getSecrets();
    const template: string = loadModuleConfig().get('brokers.schwab.oauth2.AuthURL');
    const appKey = secrets.Brokers.schwab.appKey;

    let url = template.replace('{appKey}', String(appKey ?? ''));

    if (redirectUri) {
      // NOTE: intentionally not encoding the redirect URL. The value passed here
      // has to match exactly one of the callback url values configured in the schwab
      // developer portal app, or this flow will fail. (just pushes you back to a login
      // after authorizing the app each time).
      // Go to https://developer.schwab.com/dashboard/apps, click the app, and look
      // at the callback URLs configured.
      url = url.replace('{redirectUri}', String(redirectUri));
    } else {
      // Remove the redirect_uri parameter if no redirect URI supplied
      url = url.replace(/&?redirect_uri=\{redirectUri\}/, '');
    }

    return url;
  }

  /**
   * Check if Schwab OAuth2 tokens are stored in Datastore and return time remaining.
   * Returns TimeRemaining object if authorized and token is valid, null otherwise.
   */
  public static async IsAuthorized(): Promise<TimeRemaining | null> {
    try {
      const datastoreHelper = new LumosDatastore(true);
      const accessTokenRecord: any = await datastoreHelper.Get(SCHCaller.SchwabDatastoreKey);
      
      if (!accessTokenRecord || !accessTokenRecord.accessToken || !accessTokenRecord.refreshToken) {
        return null;
      }

      return SCHCaller.calculateTimeRemaining(accessTokenRecord.tokenExpirationDate);
    } catch (error) {
      console.error('Error checking Schwab authorization status:', error);
      return null;
    }
  }

  /**
   * Get the Schwab access token expiration date from Datastore.
   * Returns Date object if token exists, or null if not found.
   */
  public static async GetAccessTokenExpiration(): Promise<Date | null> {
    try {
      const datastoreHelper = new LumosDatastore(true);
      const accessTokenRecord: any = await datastoreHelper.Get(SCHCaller.SchwabDatastoreKey);
      
      if (!accessTokenRecord || !accessTokenRecord.tokenExpirationDate) {
        return null;
      }

      return new Date(accessTokenRecord.tokenExpirationDate);
    } catch (error) {
      console.error('Error getting Schwab token expiration:', error);
      return null;
    }
  }


  private static async refreshAccessToken(oauthClient: OAuth2Client): Promise<void> {
    console.log('Schwab access token expired, refreshing...');
    await oauthClient.refreshAccessToken();
    console.log('Access token refreshed. Retrying original request...');
    
    // Persist the updated tokens. Prefer any externally-registered callback,
    // otherwise use internal persistence helper.
    if (SCHCaller.tokenUpdateCallback) {
      await SCHCaller.tokenUpdateCallback(oauthClient);
      console.log('Updated tokens persisted via callback.');
    } else {
      await SCHCaller.UpdateStoredTokens(oauthClient);
      console.log('Updated tokens persisted to Datastore.');
    }
  }

  /**
   * Persist updated tokens into Datastore. Moved here from SCHClient so the
   * caller responsible for token refresh doesn't need to own persistence.
   */
  public static async UpdateStoredTokens(oauthClient: OAuth2Client): Promise<void> {
    try {
      const datastoreHelper = new LumosDatastore(true);
      const existingRecord: any = await datastoreHelper.Get(SCHCaller.SchwabDatastoreKey);

      await datastoreHelper.Set(SCHCaller.SchwabDatastoreKey, {
        accessToken: oauthClient.getAccessToken(),
        refreshToken: oauthClient.getRefreshToken(),
        expiresIn: existingRecord?.expiresIn,
        tokenType: existingRecord?.tokenType,
        scope: existingRecord?.scope,
        lastUpdated: new Date().toISOString(),
        tokenExpirationDate: existingRecord?.tokenExpirationDate
      });
    } catch (err) {
      console.error('SCHCaller.UpdateStoredTokens: failed to persist tokens', err);
      throw err;
    }
  }

  private static isExpiredTokenError(error: any): boolean {
    return error.response?.status === 401 || error.response?.status === 403;
  }

  //
  // Utility get/post/put/delete methods 
  //

  // GET the supplied URL, refreshing the access token if expired
  public static async Get(oauthClient: OAuth2Client, url: string, retryCount: number = 1): Promise<any> {
    let attempt = 0;
    while (attempt < retryCount) {
      try {
        const response = await oauthClient.get(url);
        return response;

      } catch (error: any) {
        if (SCHCaller.isExpiredTokenError(error)) {
          // Token expired, refresh and retry once
          await SCHCaller.refreshAccessToken(oauthClient);
          const response = await oauthClient.get(url);
          return response;
        } else {
          attempt++;
          if (attempt < retryCount) {
            console.warn(`SCHCaller.Get: Error on attempt ${attempt} of ${retryCount} for URL ${url}. Retrying in 5 seconds...`, error);
            await new Promise(res => setTimeout(res, 5000));
            continue;
          }
          console.error(`SCHCaller.Get: Failed after ${retryCount} attempts for URL ${url}.`, error);
          throw error;
        }
      }
    }
  }

  // POST the supplied URL, refreshing the access token if expired
  public static async Post(oauthClient: OAuth2Client, url: string, data?: any, responseMapper?: (data: any) => any): Promise<any> {
    try {
      const response = await oauthClient.post(url, data);
      return responseMapper ? responseMapper(response.data) : response;
    } catch (error: any) {
      if (!SCHCaller.isExpiredTokenError(error)) {
        throw error;
      }
    }
    await SCHCaller.refreshAccessToken(oauthClient);
    const response = await oauthClient.post(url, data);
    return responseMapper ? responseMapper(response.data) : response;
  }

  // PUT the supplied URL, refreshing the access token if expired
  public static async Put(oauthClient: OAuth2Client, url: string, data?: any, responseMapper?: (data: any) => any): Promise<any> {
    try {
      const response = await oauthClient.put(url, data);
      return responseMapper ? responseMapper(response.data) : response;
    } catch (error: any) {
      if (!SCHCaller.isExpiredTokenError(error)) {
        throw error;
      }
    }
    await SCHCaller.refreshAccessToken(oauthClient);
    const response = await oauthClient.put(url, data);
    return responseMapper ? responseMapper(response.data) : response;
  }

  // DELETE the supplied URL, refreshing the access token if expired
  public static async Delete(oauthClient: OAuth2Client, url: string, responseMapper?: (data: any) => any): Promise<any> {
    try {
      const response = await oauthClient.delete(url);
      return responseMapper ? responseMapper(response.data) : response;
    } catch (error: any) {
      if (!SCHCaller.isExpiredTokenError(error)) {
        throw error;
      }
    }
    await SCHCaller.refreshAccessToken(oauthClient);
    const response = await oauthClient.delete(url);
    return responseMapper ? responseMapper(response.data) : response;
  }
}
