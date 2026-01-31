import { ETClient } from './ETClient';
import { Account } from '../../interfaces/Account';
import { loadModuleConfig } from '../../utils/moduleConfig';
import { ETCaller } from './ETCaller';
import { ETResponseMapper } from './ETResponseMapper';
import { OptionExpirationDate } from '../../interfaces/OptionExpirationDate';

//
// ETrade specific functions that are not part of the generic BrokerClient interface
//
export class ETClientExtended extends ETClient {


  async GetOptionsChain(symbol: string, expiry?: OptionExpirationDate, numberOfStriks: number = 1): Promise<[number | null, import('../../interfaces/OptionPair').OptionPair[]]> {
    try {
      await this.initialize();
      let url = loadModuleConfig().get('brokers.etrade.url.getOptionsChain');
      let urlWithParams = url.replace('{symbol}', encodeURIComponent(symbol));
      urlWithParams = urlWithParams.replace('{strikes}', encodeURIComponent(String(numberOfStriks)));

      if (expiry) {
        const qs = `expiryYear=${encodeURIComponent(String(expiry.year))}&expiryMonth=${encodeURIComponent(String(expiry.month))}&expiryDay=${encodeURIComponent(String(expiry.day))}`;
        urlWithParams = urlWithParams + (urlWithParams.includes('?') ? '&' : '?') + qs;
      }

      const response = await ETCaller.Get(ETClient.oauthClient!, urlWithParams);
      return ETResponseMapper.mapOptionsChainResponse(response.data);
    } catch (err) {
      const msg = this.formatETradeError(err);
      console.error('Failed to fetch E*TRADE options chain:', msg);
      throw new Error(msg); 
    }
  }

  async GetOptionsDates(symbol: string): Promise<OptionExpirationDate[]> {
    try {
      await this.initialize();
      const url = loadModuleConfig().get('brokers.etrade.url.getOptionsDates');
      const urlWithParams = url.replace('{symbol}', encodeURIComponent(symbol));
      const response = await ETCaller.Get(ETClient.oauthClient!, urlWithParams);
      return ETResponseMapper.mapOptionsDatesResponse(response.data);
    } catch (err) {
      const msg = this.formatETradeError(err);
      console.error('Failed to fetch E*TRADE options dates:', msg);
      throw new Error(msg);
    }
  }
}
