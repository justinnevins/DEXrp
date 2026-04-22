import { useState, useCallback } from 'react';
import { Plus, Coins, Trash2, RefreshCw, Eye, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useQueryClient } from '@tanstack/react-query';
import { KeystoneTransactionSigner } from '@/components/keystone-transaction-signer';
import { AddressFormat } from '@/lib/format-address';

export default function Tokens() {
  const [trustlineModalOpen, setTrustlineModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [trustlineToDelete, setTrustlineToDelete] = useState<any>(null);
  const [removeTrustlineData, setRemoveTrustlineData] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentWallet, isWalletActive } = useWallet();
  const network = currentWallet?.network ?? 'mainnet';
  const { data: dbTrustlines, isLoading: dbLoading } = useTrustlines(currentWallet?.id || null);
  const { data: xrplLines, isLoading: xrplLoading } = useAccountLines(currentWallet?.address || null, network);
  const { data: accountInfo, isLoading: accountLoading } = useAccountInfo(currentWallet?.address || null, network);

  const isLoading = dbLoading || xrplLoading || accountLoading;

  // Manual refresh function
  const handleRefresh = useCallback(async () => {
    if (!currentWallet || isRefreshing) return;
    
    setIsRefreshing(true);
    
    try {
      await queryClient.refetchQueries({ queryKey: ['browser-trustlines', currentWallet.id] });
      await queryClient.refetchQueries({ 
        predicate: (query) => 
          query.queryKey[0] === 'accountLines' && 
          query.queryKey[1] === currentWallet.address 
      });
      await queryClient.refetchQueries({
        predicate: (query) =>
          query.queryKey[0] === 'accountInfo' &&
          query.queryKey[1] === currentWallet.address
      });
    } catch {
    } finally {
      setIsRefreshing(false);
    }
  }, [currentWallet, isRefreshing, queryClient]);

  // Combine trustlines from database and XRPL
  const trustlines = [];
  
  // Get XRP balance from XRPL account info
  const xrpBalance = (accountInfo && 'account_data' in accountInfo && accountInfo.account_data?.Balance)
    ? xrplClient.formatXRPAmount(accountInfo.account_data.Balance)
    : '0.000000';
  
  // Add XRP as the native token first
  trustlines.push({
    id: 'native-xrp',
    currency: 'XRP',
    issuer: 'Native',
    issuerName: 'XRP Ledger',
    balance: xrpBalance,
    limit: 'Native',
    isActive: true,
    isNative: true,
  });
  
  // Add XRPL trustlines (filter out those with limit = 0, which are being removed)
  if (Array.isArray(xrplLines?.lines)) {
    xrplLines.lines.forEach((line: any) => {
      // Skip trustlines with limit 0 (user has removed them)
      if (parseFloat(line.limit) === 0) {
        return;
      }
      
      const decodedCurrency = xrplClient.decodeCurrency(line.currency);
      trustlines.push({
        id: `xrpl-${line.account}-${line.currency}`,
        currency: decodedCurrency,
        rawCurrency: line.currency,
        issuer: line.account,
        issuerName: 'XRPL Network',
        balance: line.balance,
        limit: line.limit,
        isActive: true,
        isNative: false,
      });
    });
  }

  // Add database trustlines if no XRPL data (excluding XRP)
  if (trustlines.length === 1 && dbTrustlines) {
    trustlines.push(...dbTrustlines.map(tl => ({ ...tl, isNative: false })));
  }

  const formatBalance = (balance: string) => {
    const num = parseFloat(balance);
    return num.toFixed(6);
  };

  const formatLimit = (limit: string) => {
    if (limit === 'Native') return 'Native';
    const num = parseFloat(limit);
    return num.toFixed(2);
  };

  const isWatchOnly = currentWallet?.walletType === 'watchOnly';

  const getCurrencyColor = (currency: string) => {
    const colors = {
      'XRP': 'bg-primary',
      'USD': 'bg-blue-500',
      'BTC': 'bg-orange-500',
      'ETH': 'bg-purple-500',
      'EUR': 'bg-green-500',
    };
    return colors[currency as keyof typeof colors] || 'bg-gray-500';
  };

  const handleDeleteClick = (token: any) => {
    if (isWatchOnly) return;
    setTrustlineToDelete(token);
    setDeleteDialogOpen(true);
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
      // Check if this is an XRPL trustline (string ID starting with 'xrpl-') or database trustline (numeric ID)
      const idString = String(trustlineToDelete.id);
      const isXRPLTrustline = idString.startsWith('xrpl-');
      
      if (isXRPLTrustline) {
        // XRPL trustlines require on-chain transactions with hardware wallet signing
        // Check if balance is 0
        const balance = parseFloat(trustlineToDelete.balance);
        if (balance !== 0) {
          toast({
            title: "Cannot remove trustline",
            description: "You must have a zero balance before removing a trustline. Please send or exchange your tokens first.",
            variant: "destructive",
          });
          setDeleteDialogOpen(false);
          setTrustlineToDelete(null);
          return;
        }

        // Fetch account info to get sequence number
        const accountInfo = await xrplClient.getAccountInfo(currentWallet.address, network);
        
        if (!accountInfo || !('account_data' in accountInfo)) {
          throw new Error('Failed to fetch account information');
        }

        const sequence = accountInfo.account_data?.Sequence || 1;
        // Check both possible ledger index fields (current or validated ledger)
        const ledgerIndex = accountInfo.ledger_current_index || accountInfo.ledger_index || 1000;

        // For standard 3-letter codes, just use them as-is
        // The XRPL library will handle the encoding automatically
        const currencyCode = trustlineToDelete.rawCurrency || trustlineToDelete.currency;

        // Validate publicKey is present for Keystone signing
        if (!currentWallet.publicKey) {
          throw new Error('Public key is required for signing. Please reconnect your Keystone wallet.');
        }

        // Prepare TrustSet transaction to remove the trustline (limit = "0")
        const trustSetTx = {
          TransactionType: 'TrustSet',
          Account: currentWallet.address,
          LimitAmount: {
            currency: currencyCode,
            issuer: trustlineToDelete.issuer,
            value: "0" // Setting limit to 0 removes the trustline
          },
          Sequence: sequence,
          LastLedgerSequence: ledgerIndex + 1000,
          Fee: "12",
          SigningPubKey: currentWallet.publicKey
        };

        // Encode the transaction for Keystone using client-side SDK (no server dependency)
        const { prepareXrpSignRequest } = await import('@/lib/keystone-client');
        const { type, cbor } = prepareXrpSignRequest(trustSetTx);

        // Close the confirmation dialog and open the hardware wallet signer
        setDeleteDialogOpen(false);
        setRemoveTrustlineData({
          transactionUR: { type, cbor },
          unsignedTransaction: trustSetTx,
          walletId: currentWallet.id,
          currency: trustlineToDelete.currency
        });
      } else {
        // Database trustline - can be removed locally
        const trustlineId = typeof trustlineToDelete.id === 'number' 
          ? trustlineToDelete.id 
          : parseInt(trustlineToDelete.id);
        
        await browserStorage.updateTrustline(trustlineId, { isActive: false });
        
        // Invalidate queries with proper keys to refresh the UI
        queryClient.invalidateQueries({ queryKey: ['browser-trustlines', currentWallet.id] });
        // Use predicate to match accountLines queries regardless of network parameter
        queryClient.invalidateQueries({ 
          predicate: (query) => 
            query.queryKey[0] === 'accountLines' && 
            query.queryKey[1] === currentWallet.address 
        });

        toast({
          title: "Trustline removed",
          description: `${trustlineToDelete.currency} trustline has been removed from your wallet.`,
        });
        
        setDeleteDialogOpen(false);
        setTrustlineToDelete(null);
      }
    } catch (error: any) {
      toast({
        title: "Failed to remove trustline",
        description: error.message || "An error occurred while removing the trustline.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveTrustlineSuccess = async () => {
    // Reset state immediately
    setRemoveTrustlineData(null);
    setTrustlineToDelete(null);
    
    toast({
      title: "Trustline Removed",
      description: "Your trustline has been removed. Refreshing data...",
    });
    
    // Wait for XRPL ledger to validate the transaction (typically 3-5 seconds)
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    // Force refetch queries to refresh the trustline list
    if (currentWallet) {
      setIsRefreshing(true);
      try {
        await queryClient.refetchQueries({ queryKey: ['browser-trustlines', currentWallet.id] });
        await queryClient.refetchQueries({ 
          predicate: (query) => 
            query.queryKey[0] === 'accountLines' && 
            query.queryKey[1] === currentWallet.address 
        });
        await queryClient.refetchQueries({
          predicate: (query) =>
            query.queryKey[0] === 'accountInfo' &&
            query.queryKey[1] === currentWallet.address
        });
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">My Tokens</h1>
          <Button variant="outline" size="sm" disabled>
            <Plus className="w-4 h-4" />
          </Button>
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

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Tokens</h1>
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="button-refresh-tokens"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          {!isWatchOnly && (
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

      {isWatchOnly && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-4">
          <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <strong>Watch-only account:</strong> You can view tokens but cannot add or remove trustlines. Connect a Keystone 3 Pro to manage trustlines.
          </p>
        </div>
      )}

      {trustlines.length === 1 ? (
        <div className="bg-white dark:bg-card border border-border rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Coins className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-2">Only XRP Available</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {isWatchOnly 
              ? "This account only holds XRP. Connect a Keystone 3 Pro to add trustlines."
              : "Create trustlines to hold other tokens on the XRP Ledger."}
          </p>
          {!isWatchOnly && (
            <Button 
              variant="outline"
              onClick={() => setTrustlineModalOpen(true)}
              data-testid="button-add-trustline"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Trustline
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {trustlines.map((token) => (
            <div
              key={token.id}
              className="bg-white dark:bg-card border border-border rounded-xl p-4"
              data-testid={`token-card-${token.currency}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-12 h-12 ${getCurrencyColor(token.currency)} rounded-full flex items-center justify-center text-white font-bold`}>
                    {token.currency.slice(0, 3)}
                  </div>
                  <div>
                    <p className="font-semibold">{token.currency}</p>
                    <p className="text-sm text-muted-foreground">
                      {token.isNative ? 'Native Token' : token.issuerName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <p className="font-semibold">
                      {formatBalance(token.balance)} {token.currency}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {token.isNative ? '' : `Limit: ${formatLimit(token.limit)} ${token.currency}`}
                    </p>
                  </div>
                  {!token.isNative && !isWatchOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(token)}
                      className="text-muted-foreground hover:text-destructive"
                      data-testid={`button-delete-${token.currency}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              
              {!token.isNative && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Issuer:</span>
                    <span className="font-mono text-muted-foreground">
                      {AddressFormat.long(token.issuer)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
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
              Removing a trustline means you won't be able to hold this token until you create the trustline again.
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

      {removeTrustlineData && (
        <KeystoneTransactionSigner
          isOpen={!!removeTrustlineData}
          onClose={() => setRemoveTrustlineData(null)}
          transactionUR={removeTrustlineData.transactionUR}
          unsignedTransaction={removeTrustlineData.unsignedTransaction}
          walletId={removeTrustlineData.walletId}
          onSuccess={handleRemoveTrustlineSuccess}
          transactionType="TrustSet"
          network={network}
        />
      )}
    </div>
  );
}
