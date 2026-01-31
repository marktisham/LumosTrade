import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

// General-purpose OAuth2 client for authenticated requests. No broker-specific logic here.

export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  authUrl: string;
}

export class OAuth2Client {
  private accessToken: string;
  private refreshToken?: string;
  private tokenExpiry?: Date;
  public defaultConfig: AxiosRequestConfig;

  constructor(
    private config: OAuth2Config,
    accessToken: string,
    refreshToken?: string,
    expiresIn?: number
  ) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.defaultConfig = { timeout: 15000 };  // schwab randomly times out.
    
    if (expiresIn) {
      this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);
    }
  }

  /** Exchange authorization code for tokens. */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<OAuth2TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
    });

    const basicAuth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

    const response = await axios.post<OAuth2TokenResponse>(
      this.config.tokenUrl,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
      }
    );

    this.updateTokens(response.data);
    return response.data;
  }

  /** Refresh the access token using the refresh token. */
  async refreshAccessToken(): Promise<OAuth2TokenResponse> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
    });

    const basicAuth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

    const response = await axios.post<OAuth2TokenResponse>(
      this.config.tokenUrl,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
      }
    );

    this.updateTokens(response.data);
    return response.data;
  }

  /**
   * Check if the access token is expired or will expire soon (within 5 minutes)
   */
  isTokenExpired(): boolean {
    if (!this.tokenExpiry) {
      return false; // If we don't know expiry, assume it's valid
    }
    const bufferMs = 5 * 60 * 1000; // 5 minutes buffer
    return Date.now() >= (this.tokenExpiry.getTime() - bufferMs);
  }

  /**
   * Ensure we have a valid access token, refreshing if necessary
   */
  private async ensureValidToken(): Promise<void> {
    if (this.isTokenExpired() && this.refreshToken) {
      await this.refreshAccessToken();
    }
  }

  /**
   * Update stored tokens from token response
   */
  private updateTokens(tokenResponse: OAuth2TokenResponse): void {
    this.accessToken = tokenResponse.access_token;
    if (tokenResponse.refresh_token) {
      this.refreshToken = tokenResponse.refresh_token;
    }
    if (tokenResponse.expires_in) {
      this.tokenExpiry = new Date(Date.now() + tokenResponse.expires_in * 1000);
    }
  }

  /**
   * Get current access token (for external storage/retrieval)
   */
  getAccessToken(): string {
    return this.accessToken;
  }

  /**
   * Get current refresh token (for external storage/retrieval)
   */
  getRefreshToken(): string | undefined {
    return this.refreshToken;
  }

  /** GET request with OAuth2 bearer token. */
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    await this.ensureValidToken();
    const mergedConfig = { ...this.defaultConfig, ...(config || {}) };
    return axios.get<T>(url, {
      ...mergedConfig,
      headers: {
        ...(config && config.headers),
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
      },
    });
  }

  /** POST request with OAuth2 bearer token. */
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    await this.ensureValidToken();
    const mergedConfig = { ...this.defaultConfig, ...(config || {}) };
    return axios.post<T>(url, data, {
      ...mergedConfig,
      headers: {
        ...(config && config.headers),
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  /** PUT request with OAuth2 bearer token. */
  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    await this.ensureValidToken();
    const mergedConfig = { ...this.defaultConfig, ...(config || {}) };
    return axios.put<T>(url, data, {
      ...mergedConfig,
      headers: {
        ...(config && config.headers),
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  /** DELETE request with OAuth2 bearer token. */
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    await this.ensureValidToken();
    const mergedConfig = { ...this.defaultConfig, ...(config || {}) };
    return axios.delete<T>(url, {
      ...mergedConfig,
      headers: {
        ...(config && config.headers),
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
      },
    });
  }
}
