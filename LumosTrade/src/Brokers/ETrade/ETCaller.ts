

import { OAuth1Client } from '../../utils/OAuth1Client';
import { loadModuleConfig } from '../../utils/moduleConfig';
import { BrokerCaller, TimeRemaining } from '../BrokerCaller';
import { LumosDatastore } from '../../utils/LumosDatastore';
import { DateUtils } from '../../utils/DateUtils';
import { SecretManager } from '../../utils/SecretManager';
import axios from 'axios';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

export class ETCaller extends BrokerCaller {

  private static get EtradeDatastoreKey(): string { return loadModuleConfig().get('brokers.etrade.oauth1.DatastoreKey'); }

  /**
   * Initiate OAuth1 flow by getting a request token from E*TRADE.
   * Returns the authorization URL that the user should visit to authorize the app.
   * The request token is stored temporarily in-memory for the next step.
   */
  public static async InitiateOAuth1Flow(): Promise<{ authUrl: string; requestToken: string; requestTokenSecret: string }> {
    const secrets = await SecretManager.getSecrets();
    const consumerKey = secrets.Brokers.etrade.consumerKey;
    const consumerSecret = secrets.Brokers.etrade.consumerSecret;
    const config = loadModuleConfig();
    const requestTokenUrl: string = config.get('brokers.etrade.oauth1.getRequestToken');
    const authorizeUrl: string = config.get('brokers.etrade.oauth1.authorize');

    const oauth = new OAuth({
      consumer: { key: consumerKey, secret: consumerSecret },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      },
    });

    const requestData = {
      url: requestTokenUrl,
      method: 'GET',
      data: { oauth_callback: 'oob' }, // out-of-band: manual verification code entry
    };

    const authHeader = oauth.toHeader(oauth.authorize(requestData));

    try {
      const response = await axios.get(requestTokenUrl, {
        headers: {
          ...authHeader,
        },
      });

      const params = new URLSearchParams(response.data);
      const requestToken = params.get('oauth_token');
      const requestTokenSecret = params.get('oauth_token_secret');

      if (!requestToken || !requestTokenSecret) {
        throw new Error('Failed to get request token from E*TRADE');
      }

      const authUrl = `${authorizeUrl}?key=${consumerKey}&token=${encodeURIComponent(requestToken)}`;

      return { authUrl, requestToken, requestTokenSecret };
    } catch (error: any) {
      console.error('Error initiating E*TRADE OAuth1 flow:', error);
      throw error;
    }
  }

  /**
   * Complete OAuth1 flow by exchanging the verification code for an access token.
   * Stores the access token in Datastore with an expiration date.
   * @param verificationCode The verification code provided by E*TRADE after user authorization
   * @param requestToken The request token from the initiate step
   * @param requestTokenSecret The request token secret from the initiate step
   */
  public static async CompleteOAuth1Flow(
    verificationCode: string,
    requestToken: string,
    requestTokenSecret: string
  ): Promise<void> {
    const secrets = await SecretManager.getSecrets();
    const consumerKey = secrets.Brokers.etrade.consumerKey;
    const consumerSecret = secrets.Brokers.etrade.consumerSecret;
    const tokenExpiresDays = secrets.Brokers.etrade.tokenExpiresDays;
    const config = loadModuleConfig();
    const accessTokenUrl: string = config.get('brokers.etrade.oauth1.getAccessToken');

    const oauth = new OAuth({
      consumer: { key: consumerKey, secret: consumerSecret },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      },
    });

    const requestData = {
      url: `${accessTokenUrl}?oauth_verifier=${verificationCode}`,
      method: 'GET',
    };

    const token = { key: requestToken, secret: requestTokenSecret };
    const authHeader = oauth.toHeader(oauth.authorize(requestData, token));

    try {
      const response = await axios.get(requestData.url, {
        headers: {
          ...authHeader,
        },
      });

      const params = new URLSearchParams(response.data);
      const accessToken = params.get('oauth_token');
      const accessTokenSecret = params.get('oauth_token_secret');

      if (!accessToken || !accessTokenSecret) {
        throw new Error('Failed to get access token from E*TRADE');
      }

      // Calculate token expiration date (midnight Eastern Time of expiration day)
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + tokenExpiresDays);
      const expirationDateString = DateUtils.ToDateStringInTimeZone(expirationDate, 'America/New_York');
      const midnightEastern = DateUtils.GetEasternStartOfDayUTC(expirationDateString!);

      // Store the access token in Datastore
      const datastoreHelper = new LumosDatastore(true);
      await datastoreHelper.Set(ETCaller.EtradeDatastoreKey, {
        accessToken,
        accessTokenSecret,
        tokenExpirationDate: midnightEastern.toISOString(),
        LastUpdate: new Date().toISOString()
      });

      console.log('E*TRADE OAuth1 tokens successfully stored in Datastore');

      // Reset the ETClient's cached OAuth client to force re-initialization with new tokens
      const { ETClient } = await import('./ETClient');
      ETClient.ResetOAuthClient();
    } catch (error: any) {
      console.error('Error completing E*TRADE OAuth1 flow:', error);
      throw error;
    }
  }

  /**
   * Check if E*TRADE OAuth tokens are stored in Datastore and return time remaining.
   * Returns TimeRemaining object if authorized and token is valid, null otherwise.
   */
  public static async IsAuthorized(): Promise<TimeRemaining | null> {
    try {
      const datastoreHelper = new LumosDatastore(true);
      const accessTokenRecord: any = await datastoreHelper.Get(ETCaller.EtradeDatastoreKey);
      
      if (!accessTokenRecord || !accessTokenRecord.accessToken || !accessTokenRecord.accessTokenSecret) {
        return null;
      }

      return ETCaller.calculateTimeRemaining(accessTokenRecord.tokenExpirationDate);
    } catch (error) {
      console.error('Error checking E*TRADE authorization status:', error);
      return null;
    }
  }

  /**
   * Get the E*TRADE access token expiration date from Datastore.
   * Returns Date object if token exists, or null if not found.
   */
  public static async GetAccessTokenExpiration(): Promise<Date | null> {
    try {
      const datastoreHelper = new LumosDatastore(true);
      const accessTokenRecord: any = await datastoreHelper.Get(ETCaller.EtradeDatastoreKey);
      
      if (!accessTokenRecord) {
        return null;
      }

      if (accessTokenRecord.tokenExpirationDate) {
        return new Date(accessTokenRecord.tokenExpirationDate);
      }

      // Fallback: if tokenExpirationDate is not set, calculate from LastUpdate + TokenExpiresDays
      if (accessTokenRecord.LastUpdate) {
        const secrets = await SecretManager.getSecrets();
        const tokenExpiresDays = secrets.Brokers.etrade.tokenExpiresDays;
        const lastUpdate = new Date(accessTokenRecord.LastUpdate);
        lastUpdate.setDate(lastUpdate.getDate() + tokenExpiresDays);
        const expirationDateString = DateUtils.ToDateStringInTimeZone(lastUpdate, 'America/New_York');
        const midnightEastern = DateUtils.GetEasternStartOfDayUTC(expirationDateString!);
        return midnightEastern;
      }

      return null;
    } catch (error) {
      console.error('Error getting E*TRADE token expiration:', error);
      return null;
    }
  }

  // GET the supplied URL, renewing the access token if expired
  public static async Get(oauthClient: OAuth1Client, url: string, retryCount: number = 1): Promise<any> {
    let attempt = 0;
    while (attempt < retryCount) {
      try {
        const response = await oauthClient.get(url);
        return response;

      } catch (error: any) {
        if (ETCaller.isExpiredTokenError(error)) {
          // Token expired, renew and retry once
          await ETCaller.renewAccessToken(oauthClient);
          const response = await oauthClient.get(url);
          return response;
        } else {
          attempt++;
          if (attempt < retryCount) {
            console.warn(`ETCaller.Get: Error on attempt ${attempt} of ${retryCount} for URL ${url}. Retrying in 5 seconds...`, error);
            await new Promise(res => setTimeout(res, 5000));
            continue;
          }
          console.error(`ETCaller.Get: Failed after ${retryCount} attempts for URL ${url}.`, error);
          throw error;
        }
      }
    }
  }

  // POST the supplied URL, renewing the access token if expired
  public static async Post(oauthClient: OAuth1Client, url: string, data?: any, responseMapper?: (data: any) => any): Promise<any> {
    try {
      const response = await oauthClient.post(url, data);
      return responseMapper ? responseMapper(response.data) : response;
    } catch (error: any) {
      if (!ETCaller.isExpiredTokenError(error)) {
        throw error;
      }
    }
    await ETCaller.renewAccessToken(oauthClient);
    const response = await oauthClient.post(url, data);
    return responseMapper ? responseMapper(response.data) : response;
  }

  // PUT the supplied URL, renewing the access token if expired
  public static async Put(oauthClient: OAuth1Client, url: string, data?: any, responseMapper?: (data: any) => any): Promise<any> {
    try {
      const response = await oauthClient.put(url, data);
      return responseMapper ? responseMapper(response.data) : response;
    } catch (error: any) {
      if (!ETCaller.isExpiredTokenError(error)) {
        throw error;
      }
    }
    await ETCaller.renewAccessToken(oauthClient);
    const response = await oauthClient.put(url, data);
    return responseMapper ? responseMapper(response.data) : response;
  }

  // DELETE the supplied URL, renewing the access token if expired
  public static async Delete(oauthClient: OAuth1Client, url: string, responseMapper?: (data: any) => any): Promise<any> {
    try {
      const response = await oauthClient.delete(url);
      return responseMapper ? responseMapper(response.data) : response;
    } catch (error: any) {
      if (!ETCaller.isExpiredTokenError(error)) {
        throw error;
      }
    }
    await ETCaller.renewAccessToken(oauthClient);
    const response = await oauthClient.delete(url);
    return responseMapper ? responseMapper(response.data) : response;
  }

  private static async renewAccessToken(oauthClient: OAuth1Client): Promise<void> {
    console.log('E*TRADE access token expired, renewing...');
    const renewUrl = loadModuleConfig().get('brokers.etrade.url.renewAccessToken');
    await oauthClient.get(renewUrl);
    console.log('Access token renewed. Retrying original request...');
  }

  private static isExpiredTokenError(error: any): boolean {
    return error.status === 401 && error.response?.data?.includes("token_rejected");
  }
}
