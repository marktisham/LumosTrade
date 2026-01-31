
import { SCHCaller, ETCaller, TimeRemaining, SecretManager } from 'lumostrade';

interface BrokerData {
  isAuthorized: boolean;
  authUrl: string;
  timeRemaining: TimeRemaining | null;
  tokenExpired: boolean;
  secretsValid: boolean;
}

function isSecretValid(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  
  // Check for placeholder text (case insensitive)
  const upper = trimmed.toUpperCase();
  if (upper.includes('ETRADE') || upper.includes('SCHWAB') || upper.includes('YOUR_')) {
    return false;
  }
  
  return true;
}

export async function getBrokersData(redirectUri: string) {
  // Get secrets to validate
  const secrets = await SecretManager.getSecrets();
  
  // Validate Schwab secrets
  const schwabSecretsValid = 
    isSecretValid(secrets.Brokers.schwab.appKey) &&
    isSecretValid(secrets.Brokers.schwab.secret);
  
  // Get Schwab data
  const schwabTimeRemaining = await SCHCaller.IsAuthorized();
  const schwabAuthUrl = await SCHCaller.GetAuthorizationUrl(redirectUri);

  const schwab: BrokerData = {
    isAuthorized: schwabTimeRemaining !== null,
    authUrl: schwabAuthUrl,
    timeRemaining: schwabTimeRemaining,
    tokenExpired: schwabTimeRemaining === null,
    secretsValid: schwabSecretsValid
  };

  // Validate E*TRADE secrets
  const etradeSecretsValid = 
    isSecretValid(secrets.Brokers.etrade.consumerKey) &&
    isSecretValid(secrets.Brokers.etrade.consumerSecret);
  
  // Get E*TRADE data
  const etradeTimeRemaining = await ETCaller.IsAuthorized();
  // For OAuth1 flow, auth is initiated via JavaScript (no direct URL)
  const etradeAuthUrl = '#';

  const etrade: BrokerData = {
    isAuthorized: etradeTimeRemaining !== null,
    authUrl: etradeAuthUrl,
    timeRemaining: etradeTimeRemaining,
    tokenExpired: etradeTimeRemaining === null,
    secretsValid: etradeSecretsValid
  };

  // Check if any brokers are authorized (with valid secrets)
  const anyBrokersAuthorized = 
    (schwab.isAuthorized && schwab.secretsValid) || 
    (etrade.isAuthorized && etrade.secretsValid);

  return {
    title: 'Broker Settings',
    schwab,
    etrade,
    anyBrokersAuthorized
  };
}
