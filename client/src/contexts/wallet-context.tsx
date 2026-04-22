import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { browserStorage } from '@/lib/browser-storage';
import { useSubscription, getWalletLimitsForTier, computeWalletOverage, type WalletLimits, type WalletOverageInfo } from '@/hooks/useSubscription';
import { useSync } from '@/hooks/useSync';
import { syncManager } from '@/lib/sync-manager';
import { useAuth } from '@/hooks/useAuth';
import type { Wallet, Transaction, Trustline } from '@shared/schema';

interface WalletContextType {
  currentWallet: Wallet | null;
  setCurrentWallet: (wallet: Wallet) => void;
  wallets: {
    data: Wallet[] | undefined;
    isLoading: boolean;
    error: Error | null;
  };
  walletCounts: {
    signing: number;
    watchOnly: number;
    total: number;
  };
  walletLimits: WalletLimits;
  walletOverage: WalletOverageInfo;
  isWalletActive: (wallet: Wallet) => boolean;
  createWallet: {
    mutateAsync: (data: { address: string; hardwareWalletType?: string; publicKey?: string; network?: 'mainnet' | 'testnet'; name?: string; walletType?: 'full' | 'watchOnly' }) => Promise<Wallet>;
    isPending: boolean;
  };
  updateWallet: {
    mutateAsync: (data: { id: number; updates: Partial<Wallet> }) => Promise<Wallet | null>;
    isPending: boolean;
  };
  deleteWallet: {
    mutateAsync: (walletId: number) => Promise<{ remainingWallets: Wallet[]; newCurrentWallet: Wallet | null; wasCurrentWallet: boolean }>;
    isPending: boolean;
  };
  reorderWallets: {
    mutateAsync: (orderedIds: number[]) => Promise<Wallet[]>;
    isPending: boolean;
  };
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [currentWallet, setCurrentWalletState] = useState<Wallet | null>(() => {
    const stored = localStorage.getItem('xrpl_current_wallet_id');
    if (stored) {
      const walletId = parseInt(stored, 10);
      return browserStorage.getWallet(walletId) || null;
    }
    return null;
  });

  const queryClient = useQueryClient();
  const { syncOptIn } = useSync();
  const { isAuthenticated } = useAuth();
  const { tier, isPremium } = useSubscription();

  const triggerSync = useCallback((immediate = false) => {
    if (!isAuthenticated || !syncOptIn || !syncManager.isUnlocked()) {
      return;
    }
    syncManager.schedulePush(immediate ? 0 : undefined);
  }, [isAuthenticated, syncOptIn]);

  const walletsQuery = useQuery<Wallet[]>({
    queryKey: ['browser-wallets'],
    queryFn: () => Promise.resolve(browserStorage.getAllWallets()),
    staleTime: 0,
  });

  // Listen for sync updates and refresh wallet data
  useEffect(() => {
    const handleSyncUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['browser-wallets'] });
      // Also refresh current wallet from localStorage
      const stored = localStorage.getItem('xrpl_current_wallet_id');
      if (stored) {
        const walletId = parseInt(stored, 10);
        const wallet = browserStorage.getWallet(walletId);
        if (wallet && wallet.id !== currentWallet?.id) {
          setCurrentWalletState(wallet);
        }
      }
    };
    
    const handleSyncDeleted = () => {
      // Data was deleted from another device - clear local state and reload
      // Use setTimeout to avoid calling during React render cycle
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['browser-wallets'] });
        setCurrentWalletState(null);
        window.location.href = '/';
      }, 0);
    };
    
    window.addEventListener('sync-data-updated', handleSyncUpdate);
    window.addEventListener('sync-data-deleted', handleSyncDeleted);
    return () => {
      window.removeEventListener('sync-data-updated', handleSyncUpdate);
      window.removeEventListener('sync-data-deleted', handleSyncDeleted);
    };
  }, [queryClient, currentWallet?.id]);

  const walletCounts = useMemo(() => {
    const wallets = walletsQuery.data || [];
    // Only count mainnet wallets toward limits (testnet is unlimited)
    const signing = wallets.filter(w => w.walletType === 'full' && w.network === 'mainnet').length;
    const watchOnly = wallets.filter(w => w.walletType === 'watchOnly' && w.network === 'mainnet').length;
    return { signing, watchOnly, total: signing + watchOnly };
  }, [walletsQuery.data]);

  const walletLimits = useMemo(() => {
    const limits = getWalletLimitsForTier(tier, isPremium);
    return {
      maxSigningWallets: limits.maxSigning,
      maxWatchOnlyWallets: limits.maxWatchOnly,
      canAddSigningWallet: walletCounts.signing < limits.maxSigning,
      canAddWatchOnlyWallet: walletCounts.watchOnly < limits.maxWatchOnly,
      currentSigningWallets: walletCounts.signing,
      currentWatchOnlyWallets: walletCounts.watchOnly,
    };
  }, [tier, isPremium, walletCounts]);

  const walletOverage = useMemo(() => {
    return computeWalletOverage(walletCounts.signing, walletCounts.watchOnly, tier, isPremium);
  }, [walletCounts, tier, isPremium]);

  const isWalletActive = useMemo(() => {
    return (wallet: Wallet): boolean => {
      if (isPremium) return true;
      
      // Testnet wallets are always active (limits only apply to mainnet)
      if (wallet.network === 'testnet') return true;
      
      const wallets = walletsQuery.data || [];
      const limits = getWalletLimitsForTier(tier, isPremium);
      
      // Only count mainnet wallets toward limits
      if (wallet.walletType === 'watchOnly') {
        const mainnetWatchOnlyWallets = wallets.filter(w => w.walletType === 'watchOnly' && w.network === 'mainnet');
        const walletIndex = mainnetWatchOnlyWallets.findIndex(w => w.id === wallet.id);
        return walletIndex < limits.maxWatchOnly;
      } else {
        const mainnetSigningWallets = wallets.filter(w => w.walletType === 'full' && w.network === 'mainnet');
        const walletIndex = mainnetSigningWallets.findIndex(w => w.id === wallet.id);
        return walletIndex < limits.maxSigning;
      }
    };
  }, [walletsQuery.data, tier, isPremium]);

  // Helper to set wallet with query invalidation (used for initial load/reconciliation)
  const setWalletWithInvalidation = (wallet: Wallet) => {
    setCurrentWalletState(wallet);
    localStorage.setItem('xrpl_current_wallet_id', wallet.id.toString());
    queryClient.invalidateQueries({ queryKey: ['accountInfo'] });
    queryClient.invalidateQueries({ queryKey: ['accountTransactions'] });
    queryClient.invalidateQueries({ queryKey: ['accountLines'] });
    syncManager.schedulePush();
  };

  // Auto-select first active wallet on initial load or when current wallet becomes inactive
  useEffect(() => {
    if (!walletsQuery.data || walletsQuery.data.length === 0) return;
    
    const wallets = walletsQuery.data;
    
    // If no current wallet, select first active one
    if (!currentWallet) {
      const firstActiveWallet = wallets.find(w => isWalletActive(w));
      if (firstActiveWallet) {
        setWalletWithInvalidation(firstActiveWallet);
      } else {
        // No active wallets available, select first one but it will be restricted
        setWalletWithInvalidation(wallets[0]);
      }
      return;
    }
    
    // If current wallet is inactive (due to tier downgrade), switch to first active wallet
    if (!isWalletActive(currentWallet)) {
      const firstActiveWallet = wallets.find(w => isWalletActive(w));
      if (firstActiveWallet && firstActiveWallet.id !== currentWallet.id) {
        setWalletWithInvalidation(firstActiveWallet);
      }
    }
  }, [walletsQuery.data, currentWallet, isWalletActive, queryClient]);

  const setCurrentWallet = (wallet: Wallet, bypassActiveCheck = false) => {
    // Block switching to inactive wallets unless bypassing (for internal use during tier reconciliation)
    if (!bypassActiveCheck && !isWalletActive(wallet)) {
      console.warn('Cannot switch to inactive wallet:', wallet.id);
      return false;
    }
    
    setCurrentWalletState(wallet);
    localStorage.setItem('xrpl_current_wallet_id', wallet.id.toString());
    
    // Immediately invalidate and refetch account data for the new wallet
    queryClient.invalidateQueries({ queryKey: ['accountInfo'] });
    queryClient.invalidateQueries({ queryKey: ['accountTransactions'] });
    queryClient.invalidateQueries({ queryKey: ['accountLines'] });
    syncManager.schedulePush();
    return true;
  };

  const createWallet = useMutation({
    mutationFn: async (walletData: { address: string; hardwareWalletType?: string; publicKey?: string; network?: 'mainnet' | 'testnet'; name?: string; walletType?: 'full' | 'watchOnly' }) => {
      const isWatchOnly = walletData.walletType === 'watchOnly';
      const limits = getWalletLimitsForTier(tier, isPremium);
      
      if (isWatchOnly) {
        if (walletCounts.watchOnly >= limits.maxWatchOnly) {
          throw new Error(`Watch-only wallet limit reached. Upgrade to Premium for unlimited wallets.`);
        }
      } else {
        if (walletCounts.signing >= limits.maxSigning) {
          throw new Error(`Signing wallet limit reached. Upgrade to Premium for unlimited wallets.`);
        }
      }

      const wallet = browserStorage.createWallet({
        address: walletData.address,
        publicKey: walletData.publicKey,
        hardwareWalletType: walletData.hardwareWalletType,
        walletType: walletData.walletType,
        network: walletData.network,
        name: walletData.name,
        isConnected: false
      });
      return wallet;
    },
    onSuccess: (newWallet) => {
      setCurrentWallet(newWallet);
      queryClient.invalidateQueries({ queryKey: ['browser-wallets'] });
      // Clear any "wallets cleared" marker since we now have wallets
      syncManager.clearWalletsClearedMarker();
      triggerSync();
    },
  });

  const updateWallet = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Wallet> }) => {
      const wallet = browserStorage.updateWallet(id, updates);
      return wallet;
    },
    onSuccess: (updatedWallet) => {
      queryClient.invalidateQueries({ queryKey: ['browser-wallets'] });
      // If network was changed, invalidate all XRPL data queries
      if (updatedWallet && currentWallet?.id === updatedWallet.id) {
        setCurrentWalletState(updatedWallet);
        queryClient.invalidateQueries({ queryKey: ['accountInfo'] });
        queryClient.invalidateQueries({ queryKey: ['accountTransactions'] });
        queryClient.invalidateQueries({ queryKey: ['accountLines'] });
        queryClient.invalidateQueries({ queryKey: ['accountOffers'] });
      }
      triggerSync();
    },
  });

  const deleteWalletMutation = useMutation({
    mutationFn: async (walletId: number) => {
      const wasCurrentWallet = currentWallet?.id === walletId;
      
      // Delete the wallet and all associated data from storage
      browserStorage.deleteWallet(walletId);
      
      // Get fresh list of remaining wallets from storage
      const remainingWallets = browserStorage.getAllWallets();
      
      let newCurrentWallet: Wallet | null = null;
      
      if (wasCurrentWallet && remainingWallets.length > 0) {
        // Find the first active wallet to switch to
        const limits = getWalletLimitsForTier(tier, isPremium);
        const firstActiveWallet = remainingWallets.find(w => {
          if (isPremium || w.network === 'testnet') return true;
          if (w.walletType === 'watchOnly') {
            const mainnetWatchOnly = remainingWallets.filter(rw => rw.walletType === 'watchOnly' && rw.network === 'mainnet');
            return mainnetWatchOnly.indexOf(w) < limits.maxWatchOnly;
          } else {
            const mainnetSigning = remainingWallets.filter(rw => rw.walletType === 'full' && rw.network === 'mainnet');
            return mainnetSigning.indexOf(w) < limits.maxSigning;
          }
        });
        newCurrentWallet = firstActiveWallet || remainingWallets[0];
      } else if (!wasCurrentWallet) {
        // Keep the current wallet if we didn't delete it
        newCurrentWallet = currentWallet;
      }
      
      return { remainingWallets, newCurrentWallet, wasCurrentWallet };
    },
    onSuccess: ({ newCurrentWallet, wasCurrentWallet }) => {
      // Update current wallet state synchronously
      if (wasCurrentWallet) {
        if (newCurrentWallet) {
          setCurrentWalletState(newCurrentWallet);
          localStorage.setItem('xrpl_current_wallet_id', newCurrentWallet.id.toString());
        } else {
          setCurrentWalletState(null);
          localStorage.removeItem('xrpl_current_wallet_id');
        }
      }
      
      // Invalidate all queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['browser-wallets'] });
      queryClient.invalidateQueries({ queryKey: ['accountInfo'] });
      queryClient.invalidateQueries({ queryKey: ['accountTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['accountLines'] });
      queryClient.invalidateQueries({ queryKey: ['accountOffers'] });
      queryClient.invalidateQueries({ queryKey: ['browser-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['browser-trustlines'] });
      
      triggerSync();
    },
  });

  const reorderWalletsMutation = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      // Validate reordering doesn't bypass wallet limits
      const currentWallets = browserStorage.getAllWallets();
      const limits = getWalletLimitsForTier(tier, isPremium);
      
      // Build a map of wallet id to wallet for quick lookup
      const walletMap = new Map(currentWallets.map(w => [w.id, w]));
      
      // Reconstruct the new order
      const newOrder = orderedIds.map(id => walletMap.get(id)).filter(Boolean) as Wallet[];
      
      // Check if any inactive wallet would become active after reorder
      // For signing wallets (mainnet only)
      const oldMainnetSigning = currentWallets.filter(w => w.walletType === 'full' && w.network === 'mainnet');
      const newMainnetSigning = newOrder.filter(w => w.walletType === 'full' && w.network === 'mainnet');
      
      // Get the IDs of wallets that were active before
      const oldActiveSigningIds = new Set(oldMainnetSigning.slice(0, limits.maxSigning).map(w => w.id));
      // Get the IDs of wallets that would be active after
      const newActiveSigningIds = new Set(newMainnetSigning.slice(0, limits.maxSigning).map(w => w.id));
      
      // Check if any wallet that wasn't active before would become active
      const newActiveSigningArray = Array.from(newActiveSigningIds);
      for (let i = 0; i < newActiveSigningArray.length; i++) {
        if (!oldActiveSigningIds.has(newActiveSigningArray[i])) {
          throw new Error('Cannot reorder: this would activate a wallet that exceeds your account limit. Upgrade to Premium to use all your accounts.');
        }
      }
      
      // For watch-only wallets (mainnet only)
      const oldMainnetWatchOnly = currentWallets.filter(w => w.walletType === 'watchOnly' && w.network === 'mainnet');
      const newMainnetWatchOnly = newOrder.filter(w => w.walletType === 'watchOnly' && w.network === 'mainnet');
      
      const oldActiveWatchOnlyIds = new Set(oldMainnetWatchOnly.slice(0, limits.maxWatchOnly).map(w => w.id));
      const newActiveWatchOnlyIds = new Set(newMainnetWatchOnly.slice(0, limits.maxWatchOnly).map(w => w.id));
      
      const newActiveWatchOnlyArray = Array.from(newActiveWatchOnlyIds);
      for (let i = 0; i < newActiveWatchOnlyArray.length; i++) {
        if (!oldActiveWatchOnlyIds.has(newActiveWatchOnlyArray[i])) {
          throw new Error('Cannot reorder: this would activate a wallet that exceeds your account limit. Upgrade to Premium to use all your accounts.');
        }
      }
      
      const wallets = browserStorage.reorderWallets(orderedIds);
      return wallets;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['browser-wallets'] });
      triggerSync(true); // Immediate sync for reorder changes
    },
  });

  return (
    <WalletContext.Provider
      value={{
        currentWallet,
        setCurrentWallet,
        wallets: {
          data: walletsQuery.data,
          isLoading: walletsQuery.isLoading,
          error: walletsQuery.error,
        },
        walletCounts,
        walletLimits,
        walletOverage,
        isWalletActive,
        createWallet: {
          mutateAsync: createWallet.mutateAsync,
          isPending: createWallet.isPending,
        },
        updateWallet: {
          mutateAsync: updateWallet.mutateAsync,
          isPending: updateWallet.isPending,
        },
        deleteWallet: {
          mutateAsync: deleteWalletMutation.mutateAsync,
          isPending: deleteWalletMutation.isPending,
        },
        reorderWallets: {
          mutateAsync: reorderWalletsMutation.mutateAsync,
          isPending: reorderWalletsMutation.isPending,
        },
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}

export function useTransactions(walletId: number | null) {
  return useQuery<Transaction[]>({
    queryKey: ['browser-transactions', walletId],
    queryFn: () => Promise.resolve(walletId ? browserStorage.getTransactionsByWallet(walletId) : []),
    enabled: !!walletId,
    staleTime: 0,
  });
}

export function useTrustlines(walletId: number | null) {
  return useQuery<Trustline[]>({
    queryKey: ['browser-trustlines', walletId],
    queryFn: () => Promise.resolve(walletId ? browserStorage.getTrustlinesByWallet(walletId) : []),
    enabled: !!walletId,
    staleTime: 0,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (transactionData: {
      walletId: number;
      type: string;
      amount: string;
      currency?: string;
      fromAddress?: string;
      toAddress?: string;
      destinationTag?: string;
    }) => {
      const transaction = browserStorage.createTransaction(transactionData);
      return transaction;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['browser-transactions', variables.walletId] });
    },
  });
}

export function useCreateTrustline() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (trustlineData: {
      walletId: number;
      currency: string;
      issuer: string;
      issuerName: string;
      limit: string;
    }) => {
      const trustline = browserStorage.createTrustline(trustlineData);
      return trustline;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['browser-trustlines', variables.walletId] });
    },
  });
}
