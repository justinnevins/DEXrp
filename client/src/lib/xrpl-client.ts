import { Client } from 'xrpl';
import { browserStorage } from './browser-storage';
import { XRPL_ENDPOINTS } from './constants';
import {
  XRPLConnector,
  WebSocketConnector,
  ClientState,
  createConnector,
} from './xrpl-connectors';
import {
  formatXRPAmount as formatXRP,
  convertXRPToDrops as toDrops,
  encodeCurrency as encode,
  decodeCurrency as decode,
} from './xrpl-currency';
import {
  isValidAddress as validateAddress,
  generateTestWallet as genWallet,
} from './xrpl-address-utils';

export type XRPLNetwork = 'mainnet' | 'testnet';

class XRPLClient {
  private clients: Map<XRPLNetwork, ClientState> = new Map();

  private defaultEndpoints = {
    mainnet: XRPL_ENDPOINTS.MAINNET_WS,
    testnet: XRPL_ENDPOINTS.TESTNET_WS
  };

  private defaultFullHistoryEndpoints = {
    mainnet: XRPL_ENDPOINTS.MAINNET_WS_FULL_HISTORY,
    testnet: XRPL_ENDPOINTS.TESTNET_WS_FULL_HISTORY
  };

  private customEndpoints: {
    mainnet?: string;
    testnet?: string;
  } = {};

  private fullHistoryEndpoints: {
    mainnet?: string;
    testnet?: string;
  } = {};

  private persistentMode: boolean = false;
  private heartbeatIntervals: Map<XRPLNetwork, ReturnType<typeof setInterval>> = new Map();
  private reconnectTimeouts: Map<XRPLNetwork, ReturnType<typeof setTimeout>> = new Map();
  private reconnectAttempts: Map<XRPLNetwork, number> = new Map();
  private readonly HEARTBEAT_INTERVAL_MS = 30000;
  private readonly MAX_RECONNECT_DELAY_MS = 60000;
  private readonly BASE_RECONNECT_DELAY_MS = 1000;

  constructor() {
    this.loadCustomEndpoints();
    this.loadPersistentMode();
    this.initializeClientState('mainnet');
    this.initializeClientState('testnet');
  }

  private loadPersistentMode(): void {
    const settings = browserStorage.getSettings();
    this.persistentMode = settings.persistentConnection === true;
  }

  private loadCustomEndpoints(): void {
    const settings = browserStorage.getSettings();
    
    if (settings.customMainnetNode) {
      this.customEndpoints.mainnet = settings.customMainnetNode;
    } else {
      delete this.customEndpoints.mainnet;
    }
    if (settings.customTestnetNode) {
      this.customEndpoints.testnet = settings.customTestnetNode;
    } else {
      delete this.customEndpoints.testnet;
    }
    
    if (settings.fullHistoryMainnetNode) {
      this.fullHistoryEndpoints.mainnet = settings.fullHistoryMainnetNode;
    } else {
      delete this.fullHistoryEndpoints.mainnet;
    }
    if (settings.fullHistoryTestnetNode) {
      this.fullHistoryEndpoints.testnet = settings.fullHistoryTestnetNode;
    } else {
      delete this.fullHistoryEndpoints.testnet;
    }
  }

  private getNetworkEndpoint(network: XRPLNetwork): string {
    return this.customEndpoints[network] || this.defaultEndpoints[network];
  }

  private initializeClientState(network: XRPLNetwork): void {
    const existingState = this.clients.get(network);
    if (existingState) {
      existingState.connector.disconnect().catch(() => {});
    }
    
    this.stopHeartbeat(network);
    this.clearReconnectTimeout(network);
    this.reconnectAttempts.delete(network);
    
    const endpoint = this.getNetworkEndpoint(network);
    this.clients.set(network, {
      connector: createConnector(endpoint),
      isConnected: false,
      connectionPromise: null,
      endpoint
    });
  }

  getClient(network: XRPLNetwork): Client {
    const state = this.clients.get(network);
    if (!state) {
      throw new Error(`Client not initialized for network: ${network}`);
    }
    if (state.connector instanceof WebSocketConnector) {
      return (state.connector as WebSocketConnector).getClient();
    }
    throw new Error('Client only available for WebSocket connections');
  }

  getEndpoint(network: XRPLNetwork): string {
    return this.getNetworkEndpoint(network);
  }

  setCustomEndpoint(network: XRPLNetwork, endpoint: string | null): void {
    if (endpoint && endpoint.trim()) {
      this.customEndpoints[network] = endpoint.trim();
    } else {
      delete this.customEndpoints[network];
    }

    const settings = browserStorage.getSettings();
    if (network === 'mainnet') {
      if (endpoint && endpoint.trim()) {
        settings.customMainnetNode = endpoint.trim();
      } else {
        delete settings.customMainnetNode;
      }
    } else {
      if (endpoint && endpoint.trim()) {
        settings.customTestnetNode = endpoint.trim();
      } else {
        delete settings.customTestnetNode;
      }
    }
    browserStorage.saveSettings(settings);

    this.initializeClientState(network);
  }

  reloadFullHistoryEndpoints(): void {
    this.loadCustomEndpoints();
  }

  async connect(network: XRPLNetwork): Promise<void> {
    const state = this.clients.get(network);
    if (!state) {
      throw new Error(`Client not initialized for network: ${network}`);
    }

    if (state.connectionPromise) {
      return state.connectionPromise;
    }

    if (state.isConnected) {
      return Promise.resolve();
    }

    state.connectionPromise = this.performConnection(network);
    return state.connectionPromise;
  }

  private async performConnection(network: XRPLNetwork): Promise<void> {
    const state = this.clients.get(network);
    if (!state) {
      throw new Error(`Client not initialized for network: ${network}`);
    }

    try {
      await state.connector.connect();
      state.isConnected = true;
      
      if (this.persistentMode) {
        this.startHeartbeat(network);
      }
    } catch (error) {
      state.isConnected = false;
      throw error;
    } finally {
      state.connectionPromise = null;
    }
  }

  async disconnect(network: XRPLNetwork): Promise<void> {
    const state = this.clients.get(network);
    if (!state) {
      return;
    }

    this.stopHeartbeat(network);
    this.clearReconnectTimeout(network);
    this.reconnectAttempts.delete(network);

    try {
      if (state.isConnected) {
        await state.connector.disconnect();
      }
    } catch {
    } finally {
      state.isConnected = false;
      state.connectionPromise = null;
    }
  }

  private startHeartbeat(network: XRPLNetwork): void {
    this.stopHeartbeat(network);
    
    const interval = setInterval(async () => {
      const state = this.clients.get(network);
      if (!state || !state.isConnected) {
        this.stopHeartbeat(network);
        if (this.persistentMode) {
          this.scheduleReconnect(network);
        }
        return;
      }

      try {
        await state.connector.request({ command: 'ping' });
      } catch (error) {
        console.log(`[XRPL] Heartbeat failed for ${network}, connection may be lost`);
        state.isConnected = false;
        this.stopHeartbeat(network);
        if (this.persistentMode) {
          this.scheduleReconnect(network);
        }
      }
    }, this.HEARTBEAT_INTERVAL_MS);

    this.heartbeatIntervals.set(network, interval);
  }

  private stopHeartbeat(network: XRPLNetwork): void {
    const interval = this.heartbeatIntervals.get(network);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(network);
    }
  }

  private clearReconnectTimeout(network: XRPLNetwork): void {
    const timeout = this.reconnectTimeouts.get(network);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(network);
    }
  }

  private scheduleReconnect(network: XRPLNetwork): void {
    if (!this.persistentMode) return;
    
    this.clearReconnectTimeout(network);
    
    const attempts = this.reconnectAttempts.get(network) || 0;
    const delay = Math.min(
      this.BASE_RECONNECT_DELAY_MS * Math.pow(2, attempts),
      this.MAX_RECONNECT_DELAY_MS
    );

    console.log(`[XRPL] Scheduling reconnect for ${network} in ${delay}ms (attempt ${attempts + 1})`);

    const timeout = setTimeout(async () => {
      this.reconnectTimeouts.delete(network);
      
      if (!this.persistentMode) return;
      
      try {
        this.reconnectAttempts.set(network, attempts + 1);
        await this.performConnection(network);
        this.reconnectAttempts.set(network, 0);
        console.log(`[XRPL] Reconnected to ${network}`);
      } catch (error) {
        console.log(`[XRPL] Reconnect failed for ${network}, will retry`);
        this.scheduleReconnect(network);
      }
    }, delay);

    this.reconnectTimeouts.set(network, timeout);
  }

  isPersistentModeEnabled(): boolean {
    return this.persistentMode;
  }

  setPersistentMode(enabled: boolean): void {
    this.persistentMode = enabled;
    
    const settings = browserStorage.getSettings();
    settings.persistentConnection = enabled;
    browserStorage.saveSettings(settings);

    if (enabled) {
      (['mainnet', 'testnet'] as XRPLNetwork[]).forEach(network => {
        this.reconnectAttempts.delete(network);
        const state = this.clients.get(network);
        if (state?.isConnected) {
          this.startHeartbeat(network);
        }
      });
    } else {
      (['mainnet', 'testnet'] as XRPLNetwork[]).forEach(network => {
        this.stopHeartbeat(network);
        this.clearReconnectTimeout(network);
        this.reconnectAttempts.delete(network);
      });
    }
  }

  getNetworkInfo(network: XRPLNetwork) {
    const state = this.clients.get(network);
    const realTimeConnected = state?.connector?.isConnected() || false;
    if (state && state.isConnected !== realTimeConnected) {
      state.isConnected = realTimeConnected;
    }
    return {
      network,
      endpoint: this.getNetworkEndpoint(network),
      isConnected: realTimeConnected
    };
  }

  async getAccountInfo(address: string, network: XRPLNetwork) {
    await this.connect(network);
    const state = this.clients.get(network);
    if (!state) {
      throw new Error(`Client not initialized for network: ${network}`);
    }
    
    try {
      const response = await state.connector.request({
        command: 'account_info',
        account: address,
        ledger_index: 'validated'
      });
      return response.result;
    } catch (error: any) {
      if (error.data?.error === 'actNotFound' || error.error === 'actNotFound') {
        return {
          account_not_found: true,
          address,
          error: 'Account not found on the ledger'
        };
      }
      throw error;
    }
  }

  async getServerInfo(network: XRPLNetwork): Promise<{ reserve_base_xrp: number; reserve_inc_xrp: number }> {
    await this.connect(network);
    const state = this.clients.get(network);
    if (!state) {
      throw new Error(`Client not initialized for network: ${network}`);
    }
    
    try {
      const response = await state.connector.request({
        command: 'server_info'
      });
      
      const validatedLedger = response.result?.info?.validated_ledger;
      if (!validatedLedger) {
        return { reserve_base_xrp: 1, reserve_inc_xrp: 0.2 };
      }
      
      return {
        reserve_base_xrp: validatedLedger.reserve_base_xrp || 1,
        reserve_inc_xrp: validatedLedger.reserve_inc_xrp || 0.2
      };
    } catch {
      return { reserve_base_xrp: 1, reserve_inc_xrp: 0.2 };
    }
  }

  private async hasCompleteHistory(connector: XRPLConnector): Promise<boolean> {
    try {
      const response = await connector.request({ command: 'server_info' });
      const completeLedgers = response.result?.info?.complete_ledgers;
      
      if (!completeLedgers || completeLedgers === 'empty') {
        return false;
      }
      
      const firstRangeStart = parseInt(completeLedgers.split('-')[0].split(',')[0], 10);
      return !isNaN(firstRangeStart) && firstRangeStart < 1000000;
    } catch {
      return false;
    }
  }

  async getAccountTransactions(address: string, network: XRPLNetwork, limit: number = 20, marker?: unknown) {
    const customFullHistory = this.fullHistoryEndpoints[network];
    const customNode = this.customEndpoints[network];
    const defaultFullHistory = this.defaultFullHistoryEndpoints[network];
    
    const makeRequest = async (connector: XRPLConnector) => {
      const request: any = {
        command: 'account_tx',
        account: address,
        limit,
        ledger_index_min: -1,
        ledger_index_max: -1
      };
      if (marker) {
        request.marker = marker;
      }
      const response = await connector.request(request);
      return response.result;
    };
    
    if (customFullHistory) {
      let connector: XRPLConnector | null = null;
      try {
        connector = createConnector(customFullHistory);
        await connector.connect();
        return await makeRequest(connector);
      } catch (error: any) {
        if (error.data?.error === 'actNotFound' || error.error === 'actNotFound') {
          return { transactions: [], account: address, marker: undefined };
        }
        throw error;
      } finally {
        if (connector) {
          try { await connector.disconnect(); } catch {}
        }
      }
    }
    
    if (customNode) {
      try {
        await this.connect(network);
        const state = this.clients.get(network);
        if (state) {
          const hasFullHistory = await this.hasCompleteHistory(state.connector);
          
          if (hasFullHistory) {
            try {
              return await makeRequest(state.connector);
            } catch (error: any) {
              if (error.data?.error === 'actNotFound' || error.error === 'actNotFound') {
                return { transactions: [], account: address, marker: undefined };
              }
              throw error;
            }
          }
        }
      } catch (error: any) {
        if (error.data?.error === 'actNotFound' || error.error === 'actNotFound') {
          return { transactions: [], account: address, marker: undefined };
        }
      }
      
      let fallbackConnector: XRPLConnector | null = null;
      try {
        fallbackConnector = createConnector(defaultFullHistory);
        await fallbackConnector.connect();
        return await makeRequest(fallbackConnector);
      } catch (wsError: any) {
        if (wsError.data?.error === 'actNotFound' || wsError.error === 'actNotFound') {
          return { transactions: [], account: address, marker: undefined };
        }
        throw wsError;
      } finally {
        if (fallbackConnector) {
          try { await fallbackConnector.disconnect(); } catch {}
        }
      }
    }
    
    let connector: XRPLConnector | null = null;
    try {
      connector = createConnector(defaultFullHistory);
      await connector.connect();
      return await makeRequest(connector);
    } catch (error: any) {
      if (error.data?.error === 'actNotFound' || error.error === 'actNotFound') {
        return { transactions: [], account: address, marker: undefined };
      }
      throw error;
    } finally {
      if (connector) {
        try { await connector.disconnect(); } catch {}
      }
    }
  }

  async getAccountLines(address: string, network: XRPLNetwork) {
    await this.connect(network);
    const state = this.clients.get(network);
    if (!state) {
      throw new Error(`Client not initialized for network: ${network}`);
    }
    
    try {
      const response = await state.connector.request({
        command: 'account_lines',
        account: address,
        ledger_index: 'validated'
      });
      const result = response.result;
      if (!Array.isArray(result?.lines)) result.lines = [];
      return result;
    } catch (error: any) {
      if (error.data?.error === 'actNotFound' || error.error === 'actNotFound') {
        return { lines: [], account: address, marker: undefined };
      }
      
      if (error.name === 'DisconnectedError' || error.message?.includes('disconnected')) {
        await this.connect(network);
        const response = await state.connector.request({
          command: 'account_lines',
          account: address,
          ledger_index: 'validated'
        });
        const result = response.result;
        if (!Array.isArray(result?.lines)) result.lines = [];
        return result;
      }
      
      throw error;
    }
  }

  async getAccountOffers(address: string, network: XRPLNetwork) {
    await this.connect(network);
    const state = this.clients.get(network);
    if (!state) {
      throw new Error(`Client not initialized for network: ${network}`);
    }
    
    try {
      const response = await state.connector.request({
        command: 'account_offers',
        account: address,
        ledger_index: 'validated'
      });
      return response.result;
    } catch (error: any) {
      if (error.data?.error === 'actNotFound' || error.error === 'actNotFound') {
        return { offers: [], account: address };
      }
      throw error;
    }
  }

  async getOrderBook(takerPays: any, takerGets: any, network: XRPLNetwork, limit = 10) {
    await this.connect(network);
    const state = this.clients.get(network);
    if (!state) {
      throw new Error(`Client not initialized for network: ${network}`);
    }
    
    try {
      const response = await state.connector.request({
        command: 'book_offers',
        taker_pays: takerPays,
        taker_gets: takerGets,
        limit,
        ledger_index: 'validated'
      });
      return response.result;
    } catch (error) {
      throw error;
    }
  }

  isValidAddress(address: string): boolean {
    return validateAddress(address);
  }

  formatXRPAmount(drops: string): string {
    return formatXRP(drops);
  }

  convertXRPToDrops(xrp: string): string {
    return toDrops(xrp);
  }

  encodeCurrency(currencyCode: string): string {
    return encode(currencyCode);
  }

  decodeCurrency(currencyCode: string): string {
    return decode(currencyCode);
  }

  generateTestWallet(): { address: string; seed: string } {
    return genWallet();
  }

  async getOrderBookPrice(
    network: XRPLNetwork,
    takerGets: { currency: string; issuer?: string },
    takerPays: { currency: string; issuer?: string }
  ): Promise<{ bidPrice: number | null; askPrice: number | null; spread: number | null }> {
    await this.connect(network);
    const state = this.clients.get(network);
    if (!state) {
      throw new Error(`Client not initialized for network: ${network}`);
    }

    try {
      const [bidsResponse, asksResponse] = await Promise.all([
        state.connector.request({
          command: 'book_offers',
          taker_gets: takerGets.currency === 'XRP' 
            ? { currency: 'XRP' }
            : { currency: takerGets.currency, issuer: takerGets.issuer },
          taker_pays: takerPays.currency === 'XRP'
            ? { currency: 'XRP' }
            : { currency: takerPays.currency, issuer: takerPays.issuer },
          limit: 1
        }),
        state.connector.request({
          command: 'book_offers',
          taker_gets: takerPays.currency === 'XRP'
            ? { currency: 'XRP' }
            : { currency: takerPays.currency, issuer: takerPays.issuer },
          taker_pays: takerGets.currency === 'XRP'
            ? { currency: 'XRP' }
            : { currency: takerGets.currency, issuer: takerGets.issuer },
          limit: 1
        })
      ]);

      const bids = bidsResponse?.result?.offers || [];
      const asks = asksResponse?.result?.offers || [];

      let bidPrice: number | null = null;
      let askPrice: number | null = null;

      if (bids.length > 0) {
        const topBid = bids[0];
        const getsAmount = typeof topBid.TakerGets === 'string' 
          ? parseFloat(this.formatXRPAmount(topBid.TakerGets))
          : parseFloat(topBid.TakerGets.value);
        const paysAmount = typeof topBid.TakerPays === 'string'
          ? parseFloat(this.formatXRPAmount(topBid.TakerPays))
          : parseFloat(topBid.TakerPays.value);
        
        if (getsAmount > 0) {
          bidPrice = paysAmount / getsAmount;
        }
      }

      if (asks.length > 0) {
        const topAsk = asks[0];
        const getsAmount = typeof topAsk.TakerPays === 'string'
          ? parseFloat(this.formatXRPAmount(topAsk.TakerPays))
          : parseFloat(topAsk.TakerPays.value);
        const paysAmount = typeof topAsk.TakerGets === 'string'
          ? parseFloat(this.formatXRPAmount(topAsk.TakerGets))
          : parseFloat(topAsk.TakerGets.value);
        
        if (getsAmount > 0) {
          askPrice = paysAmount / getsAmount;
        }
      }

      const spread = bidPrice && askPrice ? askPrice - bidPrice : null;

      return { bidPrice, askPrice, spread };
    } catch {
      return { bidPrice: null, askPrice: null, spread: null };
    }
  }

  async getReserveRequirements(network: XRPLNetwork): Promise<{ baseReserve: number; incrementReserve: number }> {
    await this.connect(network);
    const state = this.clients.get(network);
    if (!state) {
      throw new Error(`Client not initialized for network: ${network}`);
    }
    
    try {
      const response = await state.connector.request({ command: 'server_state' });
      
      if (response?.result?.state?.validated_ledger) {
        const ledger = response.result.state.validated_ledger;
        const baseReserveDrops = ledger.reserve_base || ledger.reserve_base_xrp * 1000000;
        const incrementReserveDrops = ledger.reserve_inc || ledger.reserve_inc_xrp * 1000000;
        
        return {
          baseReserve: baseReserveDrops / 1000000,
          incrementReserve: incrementReserveDrops / 1000000
        };
      }
      
      return {
        baseReserve: 20,
        incrementReserve: 2
      };
    } catch {
      return {
        baseReserve: 20,
        incrementReserve: 2
      };
    }
  }

  async submitTransaction(txBlob: string, network: XRPLNetwork): Promise<{
    success: boolean;
    hash?: string;
    engineResult: string;
    engineResultMessage?: string;
  }> {
    await this.connect(network);
    const state = this.clients.get(network);
    if (!state) {
      throw new Error(`Client not initialized for network: ${network}`);
    }
    
    try {
      const response = await state.connector.request({
        command: 'submit',
        tx_blob: txBlob
      });
      
      const result = response.result;
      
      const engineResult = result.engine_result || 'unknown';
      const engineResultMessage = result.engine_result_message || '';
      
      const isSuccess = engineResult === 'tesSUCCESS' || 
                        engineResult.startsWith('ter') || 
                        engineResult.startsWith('tec');
      
      if (!isSuccess) {
        throw new Error(`Transaction failed: ${engineResultMessage || engineResult}`);
      }
      
      return {
        success: isSuccess,
        hash: result.tx_json?.hash || result.hash,
        engineResult,
        engineResultMessage
      };
    } catch (error) {
      throw error;
    }
  }
}

export const xrplClient = new XRPLClient();
