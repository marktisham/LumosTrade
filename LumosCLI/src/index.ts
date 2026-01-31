#!/usr/bin/env node

/*
 * Copyright 2026 Mark Isham
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Conductor, SCHClient, AccountImport, DataAccess, Order, OrderActionSellShort, OrderActionBuyToCover, Trade, TradeRollup, AccountRollup, Quote, OrderActionBuy, OrderActionSell, Account, ETClient, PlaceOrderDetail, PreviewOrderResponse, AccountRollupBackfill, BrokerCaller, LogHelper, TransactionImport } from 'lumostrade';
import { ETClientExtended } from 'lumostrade/dist/Brokers/ETrade/ETClientExtended';
import { OptionExpectedMove } from 'lumostrade';
import { SimulateQuotes } from 'lumostrade/dist/Brokers/Simulator/SimulateQuotes';

// Helper constants and functions for ad-hoc testing
const AAPL_SYMBOL = 'AAPL';
const MOCK_ACCOUNT_ID = 42;
const mockAccount = () => ({ AccountID: MOCK_ACCOUNT_ID } as any);
const mockQuote = (price: number) => new Quote(0, MOCK_ACCOUNT_ID, AAPL_SYMBOL, price, new Date());

async function main() {

  // 
  // Use this CLI for ad-hoc testing of various LumosTrade functions
  //

  await Conductor.RefreshTheWorld();
  process.exit(0);
}

if (require.main === module) {
  main();
}
