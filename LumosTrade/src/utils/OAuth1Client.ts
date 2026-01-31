import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

//
// General purpose OAuth 1.0a client for making signed requests.
// DO NOT ADD ANY BROKER SPECIFIC LOGIC HERE!
//

export class OAuth1Client {
  private oauth: OAuth;
  private token: { key: string; secret: string };
  public defaultConfig: AxiosRequestConfig;

  constructor(
    private consumerKey: string,
    private consumerSecret: string,
    accessToken: string,
    accessTokenSecret: string
  ) {
    this.oauth = new OAuth({
      consumer: { key: consumerKey, secret: consumerSecret },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      },
    });
    this.token = { key: accessToken, secret: accessTokenSecret };
    this.defaultConfig = { timeout: 15000 };
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    const requestData = { url, method: 'GET' };
    const authHeader = this.oauth.toHeader(this.oauth.authorize(requestData, this.token));
    const MargedConfig = { ...this.defaultConfig, ...(config || {}) };
    return axios.get<T>(url, {
      ...MargedConfig,
      headers: {
        ...(config && config.headers),
        ...authHeader,
        Accept: 'application/json',
      },
    });
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    const requestData = { url, method: 'POST' };
    const authHeader = this.oauth.toHeader(this.oauth.authorize(requestData, this.token));
    const MargedConfig = { ...this.defaultConfig, ...(config || {}) };
    return axios.post<T>(url, data, {
      ...MargedConfig,
      headers: {
        ...(config && config.headers),
        ...authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    const requestData = { url, method: 'PUT' };
    const authHeader = this.oauth.toHeader(this.oauth.authorize(requestData, this.token));
    const MargedConfig = { ...this.defaultConfig, ...(config || {}) };
    return axios.put<T>(url, data, {
      ...MargedConfig,
      headers: {
        ...(config && config.headers),
        ...authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    const requestData = { url, method: 'DELETE' };
    const authHeader = this.oauth.toHeader(this.oauth.authorize(requestData, this.token));
    const MargedConfig = { ...this.defaultConfig, ...(config || {}) };
    return axios.delete<T>(url, {
      ...MargedConfig,
      headers: {
        ...(config && config.headers),
        ...authHeader,
        Accept: 'application/json',
      },
    });
  }
}
