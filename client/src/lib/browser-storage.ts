import type { 
  Wallet, 
  Transaction, 
  Trustline, 
  InsertWallet, 
  InsertTransaction, 
  InsertTrustline
} from "@shared/schema";
import type { StoredOffer, OfferFill } from './dex-types';

export interface XRPLSettings {
  customMainnetNode?: string;
  customTestnetNode?: string;
  fullHistoryMainnetNode?: string;
  fullHistoryTestnetNode?: string;
  persistentConnection?: boolean;
}

class BrowserStorage {
  private readonly STORAGE_KEYS = {
    WALLETS: 'xrpl_wallets',
    TRANSACTIONS: 'xrpl_transactions',
    TRUSTLINES: 'xrpl_trustlines',
    COUNTERS: 'xrpl_counters',
    SETTINGS: 'xrpl_settings',
    OFFERS: 'xrpl_dex_offers'
  };

  private getCounters() {
    const stored = localStorage.getItem(this.STORAGE_KEYS.COUNTERS);
    return stored ? JSON.parse(stored) : {
      walletId: 1,
      transactionId: 1,
      trustlineId: 1
    };
  }

  private saveCounters(counters: any) {
    localStorage.setItem(this.STORAGE_KEYS.COUNTERS, JSON.stringify(counters));
  }

  private getStoredData<T>(key: string): T[] {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  }

  private saveData<T>(key: string, data: T[]) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // Wallet operations
  getAllWallets(): Wallet[] {
    let wallets = this.getStoredData<Wallet>(this.STORAGE_KEYS.WALLETS);
    let needsSave = false;
    
    // Migration: Add network field to legacy wallets that don't have one
    const networkMigrationCompleted = localStorage.getItem('xrpl_wallet_network_migration_v1');
    
    if (!networkMigrationCompleted) {
      const legacyWallets = wallets.filter(w => !w.network);
      
      if (legacyWallets.length > 0) {
        const legacyNetwork = localStorage.getItem('xrpl-network') as 'mainnet' | 'testnet' | null;
        const inferredNetwork = legacyNetwork || 'mainnet';
        
        wallets = wallets.map(wallet => {
          if (!wallet.network) {
            return { ...wallet, network: inferredNetwork };
          }
          return wallet;
        });
        needsSave = true;
      }
      localStorage.setItem('xrpl_wallet_network_migration_v1', 'completed');
    }
    
    // Migration: Add walletType field to legacy wallets that don't have one
    const walletTypeMigrationCompleted = localStorage.getItem('xrpl_wallet_type_migration_v1');
    
    if (!walletTypeMigrationCompleted) {
      const legacyWallets = wallets.filter(w => !w.walletType);
      
      if (legacyWallets.length > 0) {
        wallets = wallets.map(wallet => {
          if (!wallet.walletType) {
            return { ...wallet, walletType: 'full' as const };
          }
          return wallet;
        });
        needsSave = true;
      }
      localStorage.setItem('xrpl_wallet_type_migration_v1', 'completed');
    }
    
    // Migration: Remove deprecated balance and reservedBalance fields
    const balanceFieldsMigrationCompleted = localStorage.getItem('xrpl_wallet_remove_balance_fields_v1');
    
    if (!balanceFieldsMigrationCompleted) {
      wallets = wallets.map(wallet => {
        const { balance, reservedBalance, ...cleanWallet } = wallet as any;
        return cleanWallet;
      });
      needsSave = true;
      localStorage.setItem('xrpl_wallet_remove_balance_fields_v1', 'completed');
    }
    
    if (needsSave) {
      this.saveData(this.STORAGE_KEYS.WALLETS, wallets);
    }
    
    return wallets;
  }

  getWallet(id: number): Wallet | undefined {
    const wallets = this.getAllWallets();
    return wallets.find(w => w.id === id);
  }

  getWalletByAddress(address: string): Wallet | undefined {
    const wallets = this.getAllWallets();
    return wallets.find(w => w.address === address);
  }

  createWallet(insertWallet: InsertWallet): Wallet {
    const counters = this.getCounters();
    const wallets = this.getAllWallets();
    
    // Check if wallet with this address AND network combination already exists
    const network = insertWallet.network || 'mainnet';
    const existingWallet = wallets.find(w => 
      w.address === insertWallet.address && w.network === network
    );
    if (existingWallet) {
      throw new Error(`Account with address ${insertWallet.address} already exists on ${network}`);
    }
    
    // Generate a default name if not provided
    const networkLabel = network === 'mainnet' ? 'Mainnet' : 'Testnet';
    const defaultName = `Account ${wallets.length + 1} (${networkLabel})`;
    
    const wallet: Wallet = {
      id: counters.walletId++,
      name: insertWallet.name || defaultName,
      address: insertWallet.address,
      publicKey: insertWallet.publicKey || null,
      balance: null,
      reservedBalance: null,
      hardwareWalletType: insertWallet.hardwareWalletType || null,
      walletType: (insertWallet.walletType || 'full') as 'full' | 'watchOnly',
      network: network as 'mainnet' | 'testnet',
      isConnected: insertWallet.isConnected || false,
      createdAt: new Date()
    };

    wallets.push(wallet);
    this.saveData(this.STORAGE_KEYS.WALLETS, wallets);
    this.saveCounters(counters);
    
    return wallet;
  }

  updateWallet(id: number, updates: Partial<Wallet>): Wallet | null {
    const wallets = this.getAllWallets();
    const index = wallets.findIndex(w => w.id === id);
    
    if (index === -1) return null;
    
    const currentWallet = wallets[index];
    
    // If network is being changed, check for duplicate address/network combination
    if (updates.network && updates.network !== currentWallet.network) {
      const duplicateExists = wallets.some(w => 
        w.id !== id && 
        w.address === currentWallet.address && 
        w.network === updates.network
      );
      
      if (duplicateExists) {
        throw new Error(`An account with address ${currentWallet.address} already exists on ${updates.network}`);
      }
    }
    
    // Merge updates with existing wallet
    wallets[index] = {
      ...wallets[index],
      ...updates,
      id: wallets[index].id, // Ensure id cannot be changed
      address: wallets[index].address, // Ensure address cannot be changed
    };
    
    this.saveData(this.STORAGE_KEYS.WALLETS, wallets);
    return wallets[index];
  }

  deleteWallet(id: number): boolean {
    const wallets = this.getAllWallets();
    const index = wallets.findIndex(w => w.id === id);
    
    if (index === -1) return false;
    
    wallets.splice(index, 1);
    this.saveData(this.STORAGE_KEYS.WALLETS, wallets);
    
    // Also clean up associated data
    const transactions = this.getAllTransactions().filter(t => t.walletId !== id);
    this.saveData(this.STORAGE_KEYS.TRANSACTIONS, transactions);
    
    const trustlines = this.getAllTrustlines().filter(t => t.walletId !== id);
    this.saveData(this.STORAGE_KEYS.TRUSTLINES, trustlines);
    
    return true;
  }

  reorderWallets(orderedIds: number[]): Wallet[] {
    const wallets = this.getAllWallets();
    
    // Create a map for quick lookup
    const walletMap = new Map(wallets.map(w => [w.id, w]));
    
    // Reorder based on the provided ID order
    const reorderedWallets: Wallet[] = [];
    for (const id of orderedIds) {
      const wallet = walletMap.get(id);
      if (wallet) {
        reorderedWallets.push(wallet);
        walletMap.delete(id);
      }
    }
    
    // Add any wallets that weren't in the orderedIds (shouldn't happen, but safety)
    walletMap.forEach(wallet => {
      reorderedWallets.push(wallet);
    });
    
    this.saveData(this.STORAGE_KEYS.WALLETS, reorderedWallets);
    return reorderedWallets;
  }

  // Transaction operations
  getAllTransactions(): Transaction[] {
    return this.getStoredData<Transaction>(this.STORAGE_KEYS.TRANSACTIONS);
  }

  getTransaction(id: number): Transaction | undefined {
    const transactions = this.getAllTransactions();
    return transactions.find(t => t.id === id);
  }

  getTransactionsByWallet(walletId: number): Transaction[] {
    const transactions = this.getAllTransactions();
    return transactions.filter(t => t.walletId === walletId);
  }

  createTransaction(insertTransaction: InsertTransaction): Transaction {
    const counters = this.getCounters();
    const transactions = this.getAllTransactions();
    
    const transaction: Transaction = {
      id: counters.transactionId++,
      walletId: insertTransaction.walletId,
      type: insertTransaction.type,
      amount: insertTransaction.amount,
      currency: insertTransaction.currency || 'XRP',
      fromAddress: insertTransaction.fromAddress || null,
      toAddress: insertTransaction.toAddress || null,
      destinationTag: insertTransaction.destinationTag || null,
      status: insertTransaction.status || 'pending',
      txHash: insertTransaction.txHash || null,
      createdAt: new Date()
    };

    transactions.push(transaction);
    this.saveData(this.STORAGE_KEYS.TRANSACTIONS, transactions);
    this.saveCounters(counters);
    
    return transaction;
  }

  updateTransaction(id: number, updates: Partial<Transaction>): Transaction | undefined {
    const transactions = this.getAllTransactions();
    const index = transactions.findIndex(t => t.id === id);
    
    if (index === -1) return undefined;
    
    transactions[index] = { ...transactions[index], ...updates };
    this.saveData(this.STORAGE_KEYS.TRANSACTIONS, transactions);
    
    return transactions[index];
  }

  // Trustline operations
  getAllTrustlines(): Trustline[] {
    return this.getStoredData<Trustline>(this.STORAGE_KEYS.TRUSTLINES);
  }

  getTrustline(id: number): Trustline | undefined {
    const trustlines = this.getAllTrustlines();
    return trustlines.find(t => t.id === id);
  }

  getTrustlinesByWallet(walletId: number): Trustline[] {
    const trustlines = this.getAllTrustlines();
    return trustlines.filter(t => t.walletId === walletId && t.isActive);
  }

  createTrustline(insertTrustline: InsertTrustline): Trustline {
    const counters = this.getCounters();
    const trustlines = this.getAllTrustlines();
    
    const trustline: Trustline = {
      id: counters.trustlineId++,
      walletId: insertTrustline.walletId,
      currency: insertTrustline.currency,
      issuer: insertTrustline.issuer,
      issuerName: insertTrustline.issuerName,
      limit: insertTrustline.limit,
      balance: insertTrustline.balance || '0',
      isActive: insertTrustline.isActive !== false,
      createdAt: new Date()
    };

    trustlines.push(trustline);
    this.saveData(this.STORAGE_KEYS.TRUSTLINES, trustlines);
    this.saveCounters(counters);
    
    return trustline;
  }

  updateTrustline(id: number, updates: Partial<Trustline>): Trustline | undefined {
    const trustlines = this.getAllTrustlines();
    const index = trustlines.findIndex(t => t.id === id);
    
    if (index === -1) return undefined;
    
    trustlines[index] = { ...trustlines[index], ...updates };
    this.saveData(this.STORAGE_KEYS.TRUSTLINES, trustlines);
    
    return trustlines[index];
  }

  // Clear all data
  clearAllData(): void {
    Object.values(this.STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  }

  // Sync data from server (for initial load or updates)
  syncFromServer(data: {
    wallets?: Wallet[];
    transactions?: Transaction[];
    trustlines?: Trustline[];
  }) {
    if (data.wallets) {
      this.saveData(this.STORAGE_KEYS.WALLETS, data.wallets);
    }
    if (data.transactions) {
      this.saveData(this.STORAGE_KEYS.TRANSACTIONS, data.transactions);
    }
    if (data.trustlines) {
      this.saveData(this.STORAGE_KEYS.TRUSTLINES, data.trustlines);
    }
  }

  // Settings operations
  getSettings(): XRPLSettings {
    const stored = localStorage.getItem(this.STORAGE_KEYS.SETTINGS);
    return stored ? JSON.parse(stored) : {};
  }

  saveSettings(settings: XRPLSettings): void {
    localStorage.setItem(this.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }

  // DEX Offer operations
  getAllOffers(): StoredOffer[] {
    return this.getStoredData<StoredOffer>(this.STORAGE_KEYS.OFFERS);
  }

  getOffersByWallet(walletAddress: string, network: 'mainnet' | 'testnet'): StoredOffer[] {
    const offers = this.getAllOffers();
    return offers.filter(o => o.walletAddress === walletAddress && o.network === network);
  }

  getOffer(walletAddress: string, network: 'mainnet' | 'testnet', sequence: number): StoredOffer | undefined {
    const offers = this.getAllOffers();
    return offers.find(o => 
      o.walletAddress === walletAddress && 
      o.network === network && 
      o.sequence === sequence
    );
  }

  saveOffer(offer: StoredOffer): void {
    const offers = this.getAllOffers();
    const existingIndex = offers.findIndex(o => 
      o.walletAddress === offer.walletAddress && 
      o.network === offer.network && 
      o.sequence === offer.sequence
    );
    
    if (existingIndex >= 0) {
      offers[existingIndex] = offer;
    } else {
      offers.push(offer);
    }
    
    this.saveData(this.STORAGE_KEYS.OFFERS, offers);
  }

  addOfferFill(walletAddress: string, network: 'mainnet' | 'testnet', sequence: number, fill: OfferFill): void {
    let offer = this.getOffer(walletAddress, network, sequence);
    
    if (!offer) {
      offer = {
        sequence,
        walletAddress,
        network,
        // These will be unknown for historical fills, so use the fill amounts as best guess
        originalTakerGets: fill.takerGotAmount,
        originalTakerPays: fill.takerPaidAmount,
        createdAt: fill.timestamp,
        createdTxHash: '',
        createdLedgerIndex: fill.ledgerIndex,
        fills: []
      };
    }
    
    const existingFill = offer.fills.find(f => f.txHash === fill.txHash);
    if (existingFill) {
      return;
    }
    
    offer.fills.push(fill);
    this.saveOffer(offer);
  }

  deleteOffer(walletAddress: string, network: 'mainnet' | 'testnet', sequence: number): void {
    const offers = this.getAllOffers();
    const filtered = offers.filter(o => 
      !(o.walletAddress === walletAddress && o.network === network && o.sequence === sequence)
    );
    this.saveData(this.STORAGE_KEYS.OFFERS, filtered);
  }
}

export const browserStorage = new BrowserStorage();