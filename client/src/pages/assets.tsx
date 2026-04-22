import { useState, useCallback, useMemo, useEffect } from 'react';
import { Plus, Coins, Trash2, RefreshCw, Eye, EyeOff, AlertCircle, Wallet, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useWallet, useTrustlines } from '@/hooks/use-wallet';
import { useAccountLines, useAccountInfo } from '@/hooks/use-xrpl';
import { xrplClient } from '@/lib/xrpl-client';
import { TrustlineModal } from '@/components/modals/trustline-modal';
import { useToast } from '@/hooks/use-toast';
import { browserStorage } from '@/lib/browser-storage';
import { useQueryClient, useQueries } from '@tanstack/react-query';
import { KeystoneTransactionSigner } from '@/components/keystone-transaction-signer';
import { useXRPPrice } from '@/hooks/use-xrp-price';
import { formatPrice } from '@/lib/xrp-price';
import { AddressFormat } from '@/lib/format-address';
import type { Wallet as WalletType } from '@shared/schema';

interface AssetData {
  id: string;
  currency: string;
  rawCurrency?: string;
  issuer: string;
  issuerName: string;
  balance: string;
  limit: string;
  isActive: boolean;
  isNative: boolean;
  walletAddress?: string;
  walletName?: string;
  network: 'mainnet' | 'testnet';
}

export default function Assets() {
  const [trustlineModalOpen, setTrustlineModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [trustlineToDelete, setTrustlineToDelete] = useState<AssetData | null>(null);
  const [removeTrustlineData, setRemoveTrustlineData] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hideValues, setHideValues] = useState(() => {
    return localStorage.getItem('assets_hide_values') === 'true';
  });
  // Load saved preferences from localStorage
  const [viewMode, setViewMode] = useState<'all' | 'current'>(() => {
    const saved = localStorage.getItem('assets_view_mode');
    return (saved === 'all' || saved === 'current') ? saved : 'current';
  });
  const [selectedNetwork, setSelectedNetwork] = useState<'mainnet' | 'testnet'>(() => {
    const saved = localStorage.getItem('assets_selected_network');
    return (saved === 'mainnet' || saved === 'testnet') ? saved : 'mainnet';
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentWallet, wallets, isWalletActive } = useWallet();

  // Get XRP price from DEX
  const { data: xrpPriceData } = useXRPPrice(selectedNetwork);
  const xrpPrice = xrpPriceData?.price || 0;

  // Filter wallets by selected network
  const networkWallets = useMemo(() => {
    if (!wallets.data) return [];
    return wallets.data.filter(w => w.network === selectedNetwork);
  }, [wallets.data, selectedNetwork]);

  // Get wallets to display based on view mode
  const walletsToShow = useMemo(() => {
    if (viewMode === 'current' && currentWallet) {
      return currentWallet.network === selectedNetwork ? [currentWallet] : [];
    }
    return networkWallets;
  }, [viewMode, currentWallet, networkWallets, selectedNetwork]);

  // Fetch account info for all wallets in the selected network
  const accountInfoQueries = useQueries({
    queries: walletsToShow.map(wallet => ({
      queryKey: ['accountInfo', wallet.address, wallet.network],
      queryFn: async () => {
        if (!wallet.address) return null;
        try {
          return await xrplClient.getAccountInfo(wallet.address, wallet.network);
        } catch (error: any) {
          if (error?.data?.error === 'actNotFound') {
            return { account_not_found: true, address: wallet.address };
          }
          throw error;
        }
      },
      enabled: !!wallet.address,
      refetchInterval: 30000,
      refetchOnMount: 'always' as const,
      retry: 3,
      retryDelay: (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 8000),
      staleTime: 10000,
    })),
  });

  // Fetch account lines for all wallets
  const accountLinesQueries = useQueries({
    queries: walletsToShow.map(wallet => ({
      queryKey: ['accountLines', wallet.address, wallet.network],
      queryFn: async () => {
        if (!wallet.address) return { lines: [] };
        try {
          return await xrplClient.getAccountLines(wallet.address, wallet.network);
        } catch (error: any) {
          if (error?.data?.error === 'actNotFound') {
            return { lines: [] };
          }
          throw error;
        }
      },
      enabled: !!wallet.address,
      refetchInterval: 30000,
      refetchOnMount: 'always' as const,
      retry: 3,
      retryDelay: (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 8000),
      staleTime: 10000,
    })),
  });

  const isLoading = accountInfoQueries.some(q => q.isLoading) || accountLinesQueries.some(q => q.isLoading);
  const hasError = accountInfoQueries.some(q => q.isError) || accountLinesQueries.some(q => q.isError);
  const isFetching = accountInfoQueries.some(q => q.isFetching) || accountLinesQueries.some(q => q.isFetching);

  // Aggregate all assets from all wallets
  const allAssets = useMemo(() => {
    const assets: AssetData[] = [];

    walletsToShow.forEach((wallet, index) => {
      const accountInfo = accountInfoQueries[index]?.data;
      const accountLines = accountLinesQueries[index]?.data;

      // Add XRP balance
      const xrpBalance = (accountInfo && 'account_data' in accountInfo && accountInfo.account_data?.Balance)
        ? xrplClient.formatXRPAmount(accountInfo.account_data.Balance)
        : '0.000000';

      assets.push({
        id: `xrp-${wallet.address}`,
        currency: 'XRP',
        issuer: 'Native',
        issuerName: 'XRP Ledger',
        balance: xrpBalance,
        limit: 'Native',
        isActive: true,
        isNative: true,
        walletAddress: wallet.address,
        walletName: wallet.name || `Account ${index + 1}`,
        network: wallet.network,
      });

      // Add token trustlines
      if (Array.isArray(accountLines?.lines)) {
        accountLines.lines.forEach((line: any) => {
          if (parseFloat(line.limit) === 0) return;

          const decodedCurrency = xrplClient.decodeCurrency(line.currency);
          assets.push({
            id: `${line.account}-${line.currency}-${wallet.address}`,
            currency: decodedCurrency,
            rawCurrency: line.currency,
            issuer: line.account,
            issuerName: 'XRPL Network',
            balance: line.balance,
            limit: line.limit,
            isActive: true,
            isNative: false,
            walletAddress: wallet.address,
            walletName: wallet.name || `Account ${index + 1}`,
            network: wallet.network,
          });
        });
      }
    });

    return assets;
  }, [walletsToShow, accountInfoQueries, accountLinesQueries]);

  // Aggregate assets by currency (combine same tokens across wallets)
  const aggregatedAssets = useMemo(() => {
    const aggregated = new Map<string, { 
      currency: string;
      rawCurrency?: string;
      issuer: string;
      issuerName: string;
      totalBalance: number;
      isNative: boolean;
      wallets: { address: string; name: string; balance: string }[];
    }>();

    allAssets.forEach(asset => {
      const key = asset.isNative ? 'XRP' : `${asset.currency}-${asset.issuer}`;
      
      if (aggregated.has(key)) {
        const existing = aggregated.get(key)!;
        existing.totalBalance += parseFloat(asset.balance);
        existing.wallets.push({
          address: asset.walletAddress || '',
          name: asset.walletName || '',
          balance: asset.balance,
        });
      } else {
        aggregated.set(key, {
          currency: asset.currency,
          rawCurrency: asset.rawCurrency,
          issuer: asset.issuer,
          issuerName: asset.issuerName,
          totalBalance: parseFloat(asset.balance),
          isNative: asset.isNative,
          wallets: [{
            address: asset.walletAddress || '',
            name: asset.walletName || '',
            balance: asset.balance,
          }],
        });
      }
    });

    return Array.from(aggregated.values());
  }, [allAssets]);

  // Calculate total portfolio value in RLUSD
  const totalPortfolioValue = useMemo(() => {
    let total = 0;

    aggregatedAssets.forEach(asset => {
      if (asset.isNative && xrpPrice > 0) {
        total += asset.totalBalance * xrpPrice;
      }
      // For RLUSD, value is 1:1
      if (asset.currency === 'RLUSD') {
        total += asset.totalBalance;
      }
    });

    return total;
  }, [aggregatedAssets, xrpPrice]);

  // Manual refresh
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    
    try {
      await queryClient.refetchQueries({ 
        predicate: (query) => 
          query.queryKey[0] === 'accountInfo' || 
          query.queryKey[0] === 'accountLines'
      });
      await queryClient.refetchQueries({ queryKey: ['xrp-price-dex'] });
    } catch {
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, queryClient]);

  const formatBalance = (balance: number | string) => {
    const num = typeof balance === 'string' ? parseFloat(balance) : balance;
    return num.toFixed(2);
  };

  const isWatchOnly = currentWallet?.walletType === 'watchOnly';

  const getCurrencyColor = (currency: string) => {
    const colors: Record<string, string> = {
      'XRP': 'bg-primary',
      'USD': 'bg-blue-500',
      'RLUSD': 'bg-blue-600',
      'BTC': 'bg-orange-500',
      'ETH': 'bg-purple-500',
      'EUR': 'bg-green-500',
    };
    return colors[currency] || 'bg-gray-500';
  };

  const handleDeleteClick = (asset: any) => {
    if (isWatchOnly || viewMode === 'all') return;
    
    // Find the full asset data
    const fullAsset = allAssets.find(a => 
      a.currency === asset.currency && 
      a.issuer === asset.issuer &&
      !a.isNative
    );
    if (fullAsset) {
      setTrustlineToDelete(fullAsset);
      setDeleteDialogOpen(true);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!trustlineToDelete || !currentWallet || isWatchOnly) return;

    // Check if wallet is active (within tier limits)
    if (!isWalletActive(currentWallet)) {
      toast({
        title: "Wallet Inactive",
        description: "This wallet exceeds your plan limits. Upgrade to Premium or remove other wallets to manage trustlines.",
        variant: "destructive",
      });
      setDeleteDialogOpen(false);
      setTrustlineToDelete(null);
      return;
    }

    try {
      const balance = parseFloat(trustlineToDelete.balance);
      if (balance !== 0) {
        toast({
          title: "Cannot remove trustline",
          description: "You must have a zero balance before removing a trustline.",
          variant: "destructive",
        });
        setDeleteDialogOpen(false);
        setTrustlineToDelete(null);
        return;
      }

      const accountInfo = await xrplClient.getAccountInfo(currentWallet.address, currentWallet.network);
      
      if (!accountInfo || !('account_data' in accountInfo)) {
        throw new Error('Failed to fetch account information');
      }

      const sequence = accountInfo.account_data?.Sequence || 1;
      const ledgerIndex = accountInfo.ledger_current_index || accountInfo.ledger_index || 1000;
      const currencyCode = trustlineToDelete.rawCurrency || trustlineToDelete.currency;

      // Validate publicKey is present for Keystone signing
      if (!currentWallet.publicKey) {
        throw new Error('Public key is required for signing. Please reconnect your Keystone wallet.');
      }

      const trustSetTx = {
        TransactionType: 'TrustSet',
        Account: currentWallet.address,
        LimitAmount: {
          currency: currencyCode,
          issuer: trustlineToDelete.issuer,
          value: "0"
        },
        Sequence: sequence,
        LastLedgerSequence: ledgerIndex + 1000,
        Fee: "12",
        SigningPubKey: currentWallet.publicKey
      };

      const { prepareXrpSignRequest } = await import('@/lib/keystone-client');
      const { type, cbor } = prepareXrpSignRequest(trustSetTx);

      setDeleteDialogOpen(false);
      setRemoveTrustlineData({
        transactionUR: { type, cbor },
        unsignedTransaction: trustSetTx,
        walletId: currentWallet.id,
        currency: trustlineToDelete.currency
      });
    } catch (error: any) {
      toast({
        title: "Failed to remove trustline",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveTrustlineSuccess = async () => {
    setRemoveTrustlineData(null);
    setTrustlineToDelete(null);
    
    toast({
      title: "Trustline Removed",
      description: "Your trustline has been removed. Refreshing data...",
    });
    
    await new Promise(resolve => setTimeout(resolve, 4000));
    await handleRefresh();
  };

  // Save view mode preference to localStorage
  useEffect(() => {
    localStorage.setItem('assets_view_mode', viewMode);
  }, [viewMode]);

  // Save selected network preference to localStorage
  useEffect(() => {
    localStorage.setItem('assets_selected_network', selectedNetwork);
  }, [selectedNetwork]);

  // Update selected network when current wallet changes (in current wallet mode)
  useEffect(() => {
    if (currentWallet && viewMode === 'current') {
      setSelectedNetwork(currentWallet.network);
    }
  }, [currentWallet, viewMode]);

  if ((isLoading || (isFetching && allAssets.length === 0)) && walletsToShow.length > 0) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Assets</h1>
        </div>
        
        <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Loading assets...</span>
        </div>

        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-card border border-border rounded-xl p-4 animate-pulse">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-muted rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded w-24 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-32"></div>
                </div>
                <div>
                  <div className="h-4 bg-muted rounded w-16 mb-1"></div>
                  <div className="h-3 bg-muted rounded w-12"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (hasError && allAssets.length === 0 && walletsToShow.length > 0) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Assets</h1>
        </div>
        
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">Unable to load assets</p>
          <p className="text-sm text-muted-foreground mb-4">
            Could not connect to the XRPL network. Check your internet connection and try again.
          </p>
          <Button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Assets</h1>
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="button-refresh-assets"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          {currentWallet && !isWatchOnly && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setTrustlineModalOpen(true)}
              data-testid="button-add-token"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Token
            </Button>
          )}
        </div>
      </div>
      {/* Portfolio Value Card */}
      <div className="bg-gradient-to-r from-primary to-primary/80 text-white rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm opacity-80 mb-1">Total Portfolio Value</p>
            {hideValues ? (
              <p className="text-3xl font-bold" data-testid="text-portfolio-value">
                ••••••
              </p>
            ) : (
              <p className="text-3xl font-bold" data-testid="text-portfolio-value">
                {formatPrice(totalPortfolioValue)}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const newValue = !hideValues;
              setHideValues(newValue);
              localStorage.setItem('assets_hide_values', String(newValue));
            }}
            className="text-white hover:bg-white/20"
            data-testid="button-toggle-portfolio-visibility"
          >
            {hideValues ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs opacity-70">
          {selectedNetwork === 'mainnet' ? 'Mainnet' : 'Testnet'} • {viewMode === 'all' ? `${networkWallets.length} wallet${networkWallets.length !== 1 ? 's' : ''}` : 'Current wallet'}
        </p>
      </div>
      {/* View Mode & Network Toggles */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'all' | 'current')} className="flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="current" className="flex items-center gap-2" data-testid="tab-current-wallet">
              <Wallet className="w-4 h-4" />
              Current
            </TabsTrigger>
            <TabsTrigger value="all" className="flex items-center gap-2" data-testid="tab-all-wallets">
              <Users className="w-4 h-4" />
              All Wallets
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={selectedNetwork} onValueChange={(v) => setSelectedNetwork(v as 'mainnet' | 'testnet')} className="flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="mainnet" data-testid="tab-mainnet">Mainnet</TabsTrigger>
            <TabsTrigger value="testnet" data-testid="tab-testnet">Testnet</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {/* Watch-only notice */}
      {viewMode === 'current' && isWatchOnly && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-4">
          <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <strong>Watch-only account:</strong> You can view assets but cannot add or remove trustlines.
          </p>
        </div>
      )}
      {/* No wallets on this network */}
      {walletsToShow.length === 0 && (
        <div className="bg-white dark:bg-card border border-border rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-2">No Wallets on {selectedNetwork === 'mainnet' ? 'Mainnet' : 'Testnet'}</h3>
          <p className="text-muted-foreground text-sm">
            {viewMode === 'current' 
              ? `Your current wallet is on ${currentWallet?.network === 'mainnet' ? 'Mainnet' : 'Testnet'}. Switch networks or view all wallets.`
              : `Add a wallet on ${selectedNetwork} to see your assets here.`}
          </p>
        </div>
      )}
      {/* Assets List */}
      {walletsToShow.length > 0 && aggregatedAssets.length === 0 && (
        <div className="bg-white dark:bg-card border border-border rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Coins className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-2">No Assets Found</h3>
          <p className="text-muted-foreground text-sm">
            Your accounts don't have any assets yet.
          </p>
        </div>
      )}
      {aggregatedAssets.length > 0 && (
        <div className="space-y-3">
          {aggregatedAssets.map((asset, index) => {
            const usdValue = asset.isNative && xrpPrice > 0 
              ? asset.totalBalance * xrpPrice 
              : asset.currency === 'RLUSD' 
                ? asset.totalBalance 
                : null;

            return (
              <div
                key={`${asset.currency}-${asset.issuer}-${index}`}
                className="bg-white dark:bg-card border border-border rounded-xl p-4"
                data-testid={`asset-card-${asset.currency}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-12 h-12 ${getCurrencyColor(asset.currency)} rounded-full flex items-center justify-center text-white font-bold`}>
                      {asset.currency.slice(0, 3)}
                    </div>
                    <div>
                      <p className="font-semibold">{asset.currency}</p>
                      <p className="text-sm text-muted-foreground">
                        {asset.isNative ? 'Native Token' : asset.issuerName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <p className="font-semibold">
                        {formatBalance(asset.totalBalance)} {asset.currency}
                      </p>
                      {usdValue !== null && (
                        <p className="text-sm text-muted-foreground">
                          {hideValues ? '••••••' : formatPrice(usdValue)}
                        </p>
                      )}
                    </div>
                    {viewMode === 'current' && !asset.isNative && !isWatchOnly && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteClick(asset)}
                        className="text-muted-foreground hover:text-destructive"
                        data-testid={`button-delete-${asset.currency}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Show wallet breakdown in "All Wallets" mode */}
                {viewMode === 'all' && asset.wallets.length > 1 && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    {asset.wallets.map((wallet, wIndex) => (
                      <div key={wIndex} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{wallet.name}</span>
                        <span className="font-mono">
                          {formatBalance(wallet.balance)} {asset.currency}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Issuer info for non-native tokens */}
                {!asset.isNative && viewMode === 'current' && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Issuer:</span>
                      <span className="font-mono text-muted-foreground">
                        {AddressFormat.long(asset.issuer)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <TrustlineModal
        isOpen={trustlineModalOpen}
        onClose={() => setTrustlineModalOpen(false)}
      />
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Trustline</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the trustline for {trustlineToDelete?.currency}?
              <br /><br />
              <strong>Important:</strong> You can only remove a trustline if your balance is 0.
              <br /><br />
              This requires signing with your Keystone 3 Pro hardware wallet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Remove Trustline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {removeTrustlineData && currentWallet && (
        <KeystoneTransactionSigner
          isOpen={!!removeTrustlineData}
          onClose={() => setRemoveTrustlineData(null)}
          transactionUR={removeTrustlineData.transactionUR}
          unsignedTransaction={removeTrustlineData.unsignedTransaction}
          walletId={removeTrustlineData.walletId}
          onSuccess={handleRemoveTrustlineSuccess}
          transactionType="TrustSet"
          network={currentWallet.network}
        />
      )}
    </div>
  );
}
