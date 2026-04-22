import { Client } from 'xrpl';

export interface XRPLConnector {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  request(params: any): Promise<any>;
  isConnected(): boolean;
}

export class WebSocketConnector implements XRPLConnector {
  private client: Client;
  private connected: boolean = false;

  constructor(endpoint: string) {
    this.client = new Client(endpoint);
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  async request(params: any): Promise<any> {
    return this.client.request(params);
  }

  isConnected(): boolean {
    return this.connected && this.client.isConnected();
  }

  getClient(): Client {
    return this.client;
  }
}

export interface ClientState {
  connector: XRPLConnector;
  isConnected: boolean;
  connectionPromise: Promise<void> | null;
  endpoint: string;
}

export function createConnector(endpoint: string): XRPLConnector {
  const protocol = endpoint.split('://')[0].toLowerCase();
  
  if (protocol === 'ws' || protocol === 'wss') {
    return new WebSocketConnector(endpoint);
  } else {
    throw new Error(`Unsupported protocol: ${protocol}. Only WebSocket (ws/wss) connections are supported.`);
  }
}
