import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { loadModuleConfig } from './moduleConfig';

/**
 * Secrets configuration structure matching the JSON stored in Google Secret Manager.
 * Secret name is configured via LUMOS_SECRET_NAME environment variable.
 * Contains database connection details, LumosApp authentication credentials, and broker API credentials.
 */
export interface LumosSecrets {
  database: {
    user: string;
    password: string;
  };
  LumosApp: {
    auth: {
      password: string;
      cronToken: string;
    };
  };
  Brokers: {
    etrade: {
      consumerKey: string;
      consumerSecret: string;
      tokenExpiresDays: number;
    };
    schwab: {
      appKey: string;
      secret: string;
      tokenExpiresDays: number;
    };
  };
}

/**
 * SecretManager provides centralized access to secrets stored in Google Secret Manager.
 * 
 * Secrets are lazy-loaded on first access and cached for the lifetime of the process.
 * This utility replaces config file-based secret storage with secure Secret Manager access.
 * 
 * **Usage:**
 * ```typescript
 * const secrets = await SecretManager.getSecrets();
 * const dbPassword = secrets.database.password;
 * ```
 * 
 * **Requirements:**
 * - Service account must have `roles/secretmanager.secretAccessor` role
 * - For local development, authenticate via: `gcloud auth application-default login`
 * - Secrets must be uploaded to Secret Manager via: `./dev secrets upload` or `./prod secrets upload`
 * 
 * **Secret Structure:**
 * Secrets are stored as JSON in Google Secret Manager. The secret name is configured
 * via LUMOS_SECRET_NAME environment variable (for example, in config/development.env or config/production.env). Structure:
 * ```json
 * {
 *   "database": {
 *     "user": "...",
 *     "password": "..."
 *   },
 *   "LumosApp": {
 *     "auth": {
 *       "password": "...",
 *       "cronToken": "..."
 *     }
 *   }
 * }
 * ```
 */
export class SecretManager {
  private static client: SecretManagerServiceClient | null = null;
  private static cachedSecrets: LumosSecrets | null = null;
  private static loadPromise: Promise<LumosSecrets> | null = null;

  /**
   * Get or create the Secret Manager client instance.
   */
  private static getClient(): SecretManagerServiceClient {
    if (!this.client) {
      this.client = new SecretManagerServiceClient();
    }
    return this.client;
  }

  /**
   * Get the GCP project ID from PROJECT_ID environment variable.
   * Throws an error if the environment variable is not set.
   */
  private static getProjectId(): string {
    const projectId = process.env.PROJECT_ID;
    if (!projectId) {
      throw new Error(
        'PROJECT_ID environment variable is not set. ' +
        'This variable must be configured in the environment (for example, config/development.env or config/production.env).'
      );
    }
    return projectId;
  }

  /**
   * Get the Secret Manager secret name from LUMOS_SECRET_NAME environment variable.
   * Throws an error if the environment variable is not set.
   */
  private static getSecretName(): string {
    const secretName = process.env.LUMOS_SECRET_NAME;
    if (!secretName) {
      throw new Error(
        'LUMOS_SECRET_NAME environment variable is not set. ' +
        'This variable must be configured in the environment (for example, config/development.env or config/production.env).'
      );
    }
    return secretName;
  }

  /**
   * Load secrets from Google Secret Manager.
   * Fetches the latest version of the secret and parses it as JSON.
   */
  private static async loadSecrets(): Promise<LumosSecrets> {
    const client = this.getClient();
    const projectId = this.getProjectId();
    const secretName = this.getSecretName();
    const secretPath = `projects/${projectId}/secrets/${secretName}/versions/latest`;

    try {
      const [version] = await client.accessSecretVersion({ name: secretPath });
      const payload = version.payload?.data?.toString();

      if (!payload) {
        throw new Error(`Secret ${secretName} is empty or missing payload`);
      }

      const secrets = JSON.parse(payload) as LumosSecrets;

      // Validate required fields
      if (!secrets.database?.user || !secrets.database?.password) {
        throw new Error(`Secret ${secretName} is missing required database fields (user, password)`);
      }
      if (!secrets.LumosApp?.auth?.password || !secrets.LumosApp?.auth?.cronToken) {
        throw new Error(`Secret ${secretName} is missing required LumosApp auth fields`);
      }
      if (!secrets.Brokers?.etrade?.consumerKey || !secrets.Brokers?.etrade?.consumerSecret) {
        throw new Error(`Secret ${secretName} is missing required E*TRADE broker fields`);
      }
      if (!secrets.Brokers?.schwab?.appKey || !secrets.Brokers?.schwab?.secret) {
        throw new Error(`Secret ${secretName} is missing required Schwab broker fields`);
      }

      return secrets;
    } catch (error) {
      throw new Error(
        `Failed to load secrets from Google Secret Manager (${secretPath}): ${
          error instanceof Error ? error.message : String(error)
        }\n\n` +
        `Ensure:\n` +
        `1. Secrets have been uploaded via './dev secrets upload' or './prod secrets upload'\n` +
        `2. Service account has 'roles/secretmanager.secretAccessor' role\n` +
        `3. For local dev, authenticate via 'gcloud auth application-default login'`
      );
    }
  }

  /**
   * Get secrets from Google Secret Manager.
   * Secrets are lazy-loaded on first call and cached for subsequent calls.
   * 
   * Multiple concurrent calls will share the same load promise to avoid
   * redundant Secret Manager API calls.
   * 
   * @returns Promise resolving to the secrets object
   * @throws Error if secrets cannot be loaded from Secret Manager
   */
  public static async getSecrets(): Promise<LumosSecrets> {
    // Return cached secrets if already loaded
    if (this.cachedSecrets) {
      return this.cachedSecrets;
    }

    // If a load is already in progress, return that promise
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // Start loading secrets
    this.loadPromise = this.loadSecrets();

    try {
      this.cachedSecrets = await this.loadPromise;
      return this.cachedSecrets;
    } finally {
      this.loadPromise = null;
    }
  }

  /**
   * Clear cached secrets (primarily for testing purposes).
   * Forces the next getSecrets() call to reload from Secret Manager.
   */
  public static clearCache(): void {
    this.cachedSecrets = null;
    this.loadPromise = null;
  }

  /**
   * Close the Secret Manager client and clear cached secrets.
   * Call this during application shutdown for clean resource cleanup.
   */
  public static async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.clearCache();
  }
}
