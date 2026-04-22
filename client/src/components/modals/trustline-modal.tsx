import { useState, useEffect, useMemo } from 'react';
import { X, Plus, Shield, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWallet, useTrustlines } from '@/hooks/use-wallet';
import { useAccountInfo, useAccountLines } from '@/hooks/use-xrpl';
import { useToast } from '@/hooks/use-toast';
import { xrplClient } from '@/lib/xrpl-client';
import { KeystoneTransactionSigner } from '@/components/keystone-transaction-signer';
import { queryClient } from '@/lib/queryClient';
import { COMMON_TOKENS } from '@/lib/constants';
import { encodeCurrency } from '@/lib/xrpl-currency';

async function encodeKeystoneUR(transactionTemplate: any): Promise<{ type: string; cbor: string }> {
  try {
    const { prepareXrpSignRequest } = await import('@/lib/keystone-client');
    const result = prepareXrpSignRequest(transactionTemplate);
    
    return { type: result.type, cbor: result.cbor };
    
  } catch {
    throw new Error('Failed to encode transaction. Please try again.');
  }
}

interface TrustlineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TrustlineModal({ isOpen, onClose }: TrustlineModalProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [tokenMode, setTokenMode] = useState<'select' | 'custom'>('select');
  const [currency, setCurrency] = useState('');
  const [issuer, setIssuer] = useState('');
  const [issuerName, setIssuerName] = useState('');
  const [limit, setLimit] = useState('1000000000');
  const [showSigner, setShowSigner] = useState(false);
  const [transactionUR, setTransactionUR] = useState<{ type: string; cbor: string } | null>(null);
  const [unsignedTransaction, setUnsignedTransaction] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      // Restore body scroll when modal is closed
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const { currentWallet, isWalletActive } = useWallet();
  const network = currentWallet?.network ?? 'mainnet';
  const { data: dbTrustlines } = useTrustlines(currentWallet?.id || null);
  const { data: xrplLines } = useAccountLines(currentWallet?.address || null, network);
  const { data: accountInfo } = useAccountInfo(currentWallet?.address || null, network);
  const { toast } = useToast();

  // Combine trustlines from database and XRPL
  const trustlines: Array<{
    id: string;
    currency: string;
    rawCurrency: string;
    issuer: string;
    issuerName: string;
    balance: string;
    limit: string;
    isActive: boolean;
  }> = [];
  
  // Add XRPL trustlines
  if (Array.isArray(xrplLines?.lines)) {
    xrplLines.lines.forEach((line: any) => {
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
      });
    });
  }

  // Add database trustlines if no XRPL data
  if (trustlines.length === 0 && dbTrustlines) {
    dbTrustlines.forEach(t => {
      trustlines.push({
        id: String(t.id),
        currency: t.currency,
        rawCurrency: t.currency,
        issuer: t.issuer,
        issuerName: t.issuerName,
        balance: t.balance,
        limit: t.limit,
        isActive: t.isActive,
      });
    });
  }

  // Filter common tokens by network and exclude already-added trustlines
  const availableCommonTokens = useMemo(() => {
    return COMMON_TOKENS.filter(token => {
      const issuer = network === 'mainnet' ? token.mainnetIssuer : token.testnetIssuer;
      if (!issuer) return false;
      
      // Check if trustline already exists
      const alreadyExists = trustlines.some(t => 
        t.issuer === issuer && (t.rawCurrency === token.currency || t.currency === xrplClient.decodeCurrency(token.currency))
      );
      return !alreadyExists;
    }).map(token => ({
      ...token,
      issuer: network === 'mainnet' ? token.mainnetIssuer! : token.testnetIssuer!,
    }));
  }, [network, trustlines]);

  const handleSelectToken = (token: { name: string; currency: string; issuer: string }) => {
    setCurrency(token.currency);
    setIssuer(token.issuer);
    setIssuerName(token.name.split('(')[0].trim());
    setTokenMode('custom');
  };

  const handleAddTrustline = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentWallet || !currency || !issuer || !issuerName || !limit) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    // Check if wallet is active (within tier limits)
    if (!isWalletActive(currentWallet)) {
      toast({
        title: "Wallet Inactive",
        description: "This wallet exceeds your plan limits. Upgrade to Premium or remove other wallets to manage trustlines.",
        variant: "destructive",
      });
      return;
    }

    if (!xrplClient.isValidAddress(issuer)) {
      toast({
        title: "Invalid Issuer",
        description: "Please enter a valid XRPL address for the issuer",
        variant: "destructive",
      });
      return;
    }

    // Validate currency format: 1-20 alphanumeric chars OR 40 hex chars
    const isAlphanumericCurrency = /^[A-Za-z0-9]{1,20}$/.test(currency);
    const isHexCurrency = /^[0-9A-F]{40}$/i.test(currency);
    
    if (!isAlphanumericCurrency && !isHexCurrency) {
      toast({
        title: "Invalid Currency Code",
        description: "Currency must be 1-20 alphanumeric characters (e.g., USD, CORE) or a 40-character hex code",
        variant: "destructive",
      });
      return;
    }

    if (isCreating) return;

    try {
      setIsCreating(true);

      let transactionSequence = 1;
      let transactionLedger = 1000;
      
      if (accountInfo && 'account_data' in accountInfo && accountInfo.account_data) {
        transactionSequence = accountInfo.account_data.Sequence || 1;
        transactionLedger = accountInfo.ledger_current_index || accountInfo.ledger_index || 1000;
      }

      const encodedCurrency = encodeCurrency(currency);
      
      // Validate publicKey is present for Keystone signing
      if (!currentWallet.publicKey) {
        throw new Error('Public key is required for signing. Please reconnect your Keystone wallet.');
      }

      const trustSetTransaction = {
        Account: currentWallet.address,
        TransactionType: "TrustSet",
        LimitAmount: {
          currency: encodedCurrency,
          issuer: issuer,
          value: limit
        },
        Fee: "12",
        Flags: 2147483648,
        LastLedgerSequence: transactionLedger + 1000,
        Sequence: transactionSequence,
        SigningPubKey: currentWallet.publicKey
      };

      const keystoneUR = await encodeKeystoneUR(trustSetTransaction);
      
      setTransactionUR(keystoneUR);
      setUnsignedTransaction(trustSetTransaction);
      setShowSigner(true);

    } catch (error) {
      setIsCreating(false);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create trustline transaction",
        variant: "destructive",
      });
    }
  };

  const handleSigningSuccess = async () => {
    const createdCurrency = currency;
    
    setCurrency('');
    setIssuer('');
    setIssuerName('');
    setLimit('');
    setShowAddForm(false);
    setShowSigner(false);
    setTransactionUR(null);
    setUnsignedTransaction(null);
    setIsCreating(false);
    
    toast({
      title: "Trustline Created",
      description: `Trustline for ${createdCurrency} has been created. Refreshing data...`,
    });
    
    onClose();
    
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    await queryClient.refetchQueries({ queryKey: ['browser-trustlines', currentWallet?.id] });
    await queryClient.refetchQueries({ 
      predicate: (query) => 
        query.queryKey[0] === 'accountLines' && 
        query.queryKey[1] === currentWallet?.address 
    });
    await queryClient.refetchQueries({
      predicate: (query) =>
        query.queryKey[0] === 'accountInfo' &&
        query.queryKey[1] === currentWallet?.address
    });
  };

  const handleSignerClose = () => {
    setShowSigner(false);
    setTransactionUR(null);
    setUnsignedTransaction(null);
    setIsCreating(false);
  };

  const formatBalance = (balance: string) => {
    const num = parseFloat(balance);
    return num.toFixed(2);
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto max-h-[80vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b border-border sticky top-0 bg-background">
          <DialogTitle className="text-lg font-semibold">Trustline Manager</DialogTitle>
          {currentWallet && (
            <p className="text-sm text-muted-foreground mt-1">
              Wallet: {currentWallet.name} ({currentWallet.address.slice(0, 8)}...{currentWallet.address.slice(-6)})
            </p>
          )}
        </DialogHeader>
        
        <div className="pt-4 pb-6">
          {!showAddForm ? (
            <>
              <div className="mb-6">
                <Button
                  onClick={() => setShowAddForm(true)}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 touch-target"
                  data-testid="button-add-trustline"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Trustline
                </Button>
              </div>
              
              <h4 className="font-semibold mb-3">Active Trustlines</h4>
              
              {trustlines.length === 0 ? (
                <div className="bg-muted rounded-xl p-6 text-center">
                  <p className="text-muted-foreground">No trustlines found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add trustlines to hold other tokens
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {trustlines.map((trustline) => (
                    <div
                      key={trustline.id}
                      className="bg-muted rounded-xl p-4"
                    >
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                          {trustline.currency.slice(0, 3)}
                        </div>
                        <div>
                          <p className="font-medium">{trustline.currency} ({trustline.issuerName})</p>
                          <p className="text-sm text-muted-foreground">
                            Balance: {formatBalance(trustline.balance)} {trustline.currency}
                          </p>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Limit: {formatBalance(trustline.limit)} {trustline.currency}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : tokenMode === 'select' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">Select Token</h4>
                <Button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setTokenMode('select');
                    setCurrency('');
                    setIssuer('');
                    setIssuerName('');
                  }}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                >
                  Cancel
                </Button>
              </div>

              {availableCommonTokens.length > 0 ? (
                <div className="space-y-2">
                  {availableCommonTokens.map((token) => (
                    <button
                      key={`${token.currency}-${token.issuer}`}
                      type="button"
                      onClick={() => handleSelectToken(token)}
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left"
                      data-testid={`token-select-${token.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary text-sm font-bold">
                          {xrplClient.decodeCurrency(token.currency).slice(0, 3)}
                        </div>
                        <div>
                          <p className="font-medium">{token.name}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {token.issuer}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bg-muted rounded-xl p-4 text-center">
                  <p className="text-muted-foreground">No common tokens available for {network}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You may have trustlines for all common tokens already
                  </p>
                </div>
              )}

              <div className="pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setTokenMode('custom')}
                  data-testid="button-add-custom-token"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Custom Token
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleAddTrustline} className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">Add Trustline</h4>
                <Button
                  type="button"
                  onClick={() => {
                    setTokenMode('select');
                    setCurrency('');
                    setIssuer('');
                    setIssuerName('');
                  }}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                >
                  Back
                </Button>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 mb-4">
                <div className="flex items-start space-x-3">
                  <Shield className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                      Hardware Wallet Required
                    </p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      Creating a trustline requires signing with your Keystone 3 Pro device
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="currency" className="block text-sm font-medium mb-2">
                  Currency Code
                </Label>
                <Input
                  id="currency"
                  type="text"
                  placeholder="USD, CORE, RLUSD..."
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="touch-target font-mono"
                  maxLength={40}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  1-20 characters (e.g., USD, CORE) or 40-char hex code
                </p>
              </div>

              <div>
                <Label htmlFor="issuer" className="block text-sm font-medium mb-2">
                  Issuer Address
                </Label>
                <Input
                  id="issuer"
                  type="text"
                  placeholder="rN7n...4X2k"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  className="touch-target"
                />
              </div>

              <div>
                <Label htmlFor="issuerName" className="block text-sm font-medium mb-2">
                  Issuer Name
                </Label>
                <Input
                  id="issuerName"
                  type="text"
                  placeholder="Bitstamp, Gatehub..."
                  value={issuerName}
                  onChange={(e) => setIssuerName(e.target.value)}
                  className="touch-target"
                />
              </div>

              <div>
                <Label htmlFor="limit" className="block text-sm font-medium mb-2">
                  Trust Limit
                </Label>
                <Input
                  id="limit"
                  type="number"
                  placeholder="1000000000"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="touch-target"
                  step="0.01"
                  min="0"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Maximum amount you trust the issuer to hold (default: 1 billion)
                </p>
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 touch-target"
                disabled={!currency || !issuer || !issuerName || !limit || isCreating}
              >
                {isCreating ? 'Preparing...' : 'Sign with Keystone'}
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
      </Dialog>

      <KeystoneTransactionSigner
        isOpen={showSigner}
        onClose={handleSignerClose}
        onSuccess={handleSigningSuccess}
        transactionUR={transactionUR}
        unsignedTransaction={unsignedTransaction}
        transactionType="TrustSet"
        walletId={currentWallet?.id || 0}
        network={network}
      />
    </>
  );
}
