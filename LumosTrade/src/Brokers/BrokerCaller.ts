export interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
}

import { DateUtils } from '../utils/DateUtils';
import { ErrorHelper } from '../utils/ErrorHelper';

export abstract class BrokerCaller {

  /**
   * Check if the broker is authorized and return time remaining until token expires.
   * Returns TimeRemaining object if authorized, or null if not authorized or expired.
   */
  public static async IsAuthorized(): Promise<TimeRemaining | null> {
    throw new Error('IsAuthorized must be implemented by derived class');
  }

  /**
   * Get the access token expiration date from Datastore.
   * Returns Date object if token exists, or null if not found.
   */
  public static async GetAccessTokenExpiration(): Promise<Date | null> {
    throw new Error('GetAccessTokenExpiration must be implemented by derived class');
  }

  /**
   * Check if access tokens for any broker expire within the next 2 days.
   * Logs a console.error with details if any tokens are expiring soon.
   */
  public static async CheckIfAccessTokensExpireSoon(): Promise<void> {
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

    try {
      // Format a Date in America/New_York (Eastern) time using DateUtils
      const formatEastern = (d: Date): string => {
        const dateTime = DateUtils.ToDateTimeStringInTimeZone(d, 'America/New_York');
        return `${dateTime} ET`;
      };

      // Helper to check a single broker's expiration and log appropriate messages
      const checkExpiration = (brokerName: string, exp: Date | null): boolean => {
        if (exp === null) {
          ErrorHelper.LogErrorForGCP(`⚠️  ${brokerName} access token not found or has no expiration date set`, 'CheckIfAccessTokensExpireSoon');
          return true;
        }

        const now = new Date();
        if (exp.getTime() <= now.getTime()) {
          const daysAgo = Math.ceil((now.getTime() - exp.getTime()) / (1000 * 60 * 60 * 24));
          ErrorHelper.LogErrorForGCP(`⚠️  ${brokerName} access token has expired! Expiration: ${formatEastern(exp)} (${daysAgo} day(s) ago)`, 'CheckIfAccessTokensExpireSoon');
          return true;
        }

        if (exp <= twoDaysFromNow) {
          const daysRemaining = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          ErrorHelper.LogErrorForGCP(`⚠️  ${brokerName} access token expires soon. Expiration: ${formatEastern(exp)} (${daysRemaining} day(s) remaining)`, 'CheckIfAccessTokensExpireSoon');
          return true;
        }

        return false;
      };

      // Dynamically import to avoid circular dependencies
      const { ETCaller } = await import('./ETrade/ETCaller');
      const etradeExpiration = await ETCaller.GetAccessTokenExpiration();
      const etError = checkExpiration('E*TRADE', etradeExpiration);

      const { SCHCaller } = await import('./Schwab/SCHCaller');
      const schwabExpiration = await SCHCaller.GetAccessTokenExpiration();
      const schError = checkExpiration('Schwab', schwabExpiration);

      if (!etError && !schError) {
        console.log('✅  All broker access tokens are valid for more than 2 days');
      }
    } catch (error) {
      ErrorHelper.LogErrorForGCP(error, 'CheckIfAccessTokensExpireSoon');
    }
  }

  /**
   * Calculate time remaining from a token expiration date string.
   * Returns TimeRemaining object if still valid, or null if expired or invalid.
   */
  protected static calculateTimeRemaining(tokenExpirationDate: string | null | undefined): TimeRemaining | null {
    if (!tokenExpirationDate || typeof tokenExpirationDate !== 'string' || tokenExpirationDate.trim() === '') {
      return null;
    }

    const now = new Date();
    const exp = new Date(tokenExpirationDate);
    
    if (isNaN(exp.getTime())) {
      return null;
    }
    
    const diffMs = exp.getTime() - now.getTime();
    if (diffMs <= 0) {
      return null;
    }

    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    return { days, hours, minutes };
  }
}
