import { xrplClient } from './xrpl-client';

class ConnectionManager {
  private isStable = false;
  private switchingNetwork = false;

  async switchNetwork(network: 'mainnet' | 'testnet'): Promise<void> {
    this.switchingNetwork = true;
    this.isStable = false;
    
    try {
      await xrplClient.switchNetwork(network);
      // Wait for connection to stabilize
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.isStable = true;
    } finally {
      this.switchingNetwork = false;
    }
  }

  isConnectionStable(): boolean {
    return this.isStable && !this.switchingNetwork;
  }

  isSwitchingNetwork(): boolean {
    return this.switchingNetwork;
  }

  setStable(stable: boolean): void {
    this.isStable = stable;
  }
}

export const connectionManager = new ConnectionManager();