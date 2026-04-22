import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Send, QrCode, Loader2, AlertCircle, CheckCircle, Camera } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { realHardwareWalletService as hardwareWalletService } from '@/lib/real-hardware-wallet';
import { useWallet } from '@/hooks/use-wallet';
import { useAccountInfo, useAccountLines, useServerInfo } from '@/hooks/use-xrpl';
import { xrplClient } from '@/lib/xrpl-client';
import { KeystoneQRScanner } from '@/components/keystone-qr-scanner';
import { GeneralQRScanner } from '@/components/general-qr-scanner';
import { FullscreenQRViewer } from '@/components/fullscreen-qr-viewer';
import { encode } from 'ripple-binary-codec';
import { AnimatedQRCode } from '@keystonehq/animated-qr';
import { AmountPresetButtons } from '@/components/amount-preset-buttons';
import { calculateAvailableBalance, getTokenBalance } from '@/lib/xrp-account';
import { truncateAddress } from '@/lib/format-address';

const transactionSchema = z.object({
  destination: z.string().min(1, 'Destination address is required').regex(/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/, 'Invalid XRP address format'),
  amount: z.string().min(1, 'Amount is required').refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, 'Amount must be a valid positive number'),
  currency: z.string().min(1, 'Currency is required'),
  issuer: z.string().optional(),
  destinationTag: z.string().optional(),
  memo: z.string().max(1000, 'Memo cannot exceed 1000 characters').optional(),
});

type TransactionFormData = z.infer<typeof transactionSchema>;

interface SendTransactionFormProps {
  onSuccess?: () => void;
  initialDestination?: string;
  initialAmount?: string;
  initialCurrency?: string;
  initialIssuer?: string;
  initialMemo?: string;
}

async function encodeKeystoneUR(transactionTemplate: any): Promise<{ type: string; cbor: string }> {
  try {
    const { prepareXrpSignRequest } = await import('@/lib/keystone-client');
    const result = prepareXrpSignRequest(transactionTemplate);
    
    return { type: result.type, cbor: result.cbor };
    
  } catch {
    throw new Error('Failed to encode transaction. Please try again.');
  }
}

// Simplified decoder for Keystone UR content
function decodeBase32Like(urContent: string): Uint8Array {
  // This is a simplified decoder based on the BC-UR bytewords specification
  // Convert the UR content to bytes using a basic mapping
  const bytes: number[] = [];
  
  // Try to parse as hex first (some Keystone formats use direct hex)
  if (/^[0-9A-Fa-f]+$/.test(urContent)) {
    for (let i = 0; i < urContent.length; i += 2) {
      const hex = urContent.substring(i, i + 2);
      bytes.push(parseInt(hex, 16));
    }
  } else {
    // For non-hex content, use a character-to-byte mapping
    for (let i = 0; i < urContent.length; i++) {
      const char = urContent.charAt(i);
      const charCode = char.charCodeAt(0);
      // Map characters to bytes in a predictable way
      if (charCode >= 65 && charCode <= 90) { // A-Z
        bytes.push(charCode - 65);
      } else if (charCode >= 97 && charCode <= 122) { // a-z
        bytes.push(charCode - 97 + 26);
      } else {
        bytes.push(charCode % 256);
      }
    }
  }
  
  return new Uint8Array(bytes);
}

export function SendTransactionForm({ 
  onSuccess,
  initialDestination = '',
  initialAmount = '',
  initialCurrency = 'XRP',
  initialIssuer = '',
  initialMemo = ''
}: SendTransactionFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [showSignedQRScanner, setShowSignedQRScanner] = useState(false);
  const [showAddressScanner, setShowAddressScanner] = useState(false);
  const [keystoneUR, setKeystoneUR] = useState<{ type: string; cbor: string } | null>(null);
  const [currentStep, setCurrentStep] = useState<'form' | 'qr-display' | 'signing' | 'submitting' | 'complete'>('form');
  const [pendingTransactionData, setPendingTransactionData] = useState<TransactionFormData | null>(null);
  const [pendingUnsignedTx, setPendingUnsignedTx] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const processingSignatureRef = useRef(false);
  const closeTimestampRef = useRef<number>(0);
  
  const { toast } = useToast();

  const handleOpenFullscreen = () => {
    if (Date.now() - closeTimestampRef.current < 300) return;
    if (keystoneUR) setShowFullscreen(true);
  };

  const handleCloseFullscreen = () => {
    closeTimestampRef.current = Date.now();
    setShowFullscreen(false);
  };
  const { currentWallet, isWalletActive } = useWallet();
  const network = currentWallet?.network ?? 'mainnet';
  const { data: accountInfo, isLoading: isAccountInfoLoading } = useAccountInfo(currentWallet?.address || null, network);
  const { data: accountLines } = useAccountLines(currentWallet?.address || null, network);
  const { data: serverInfo } = useServerInfo(network);

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      destination: initialDestination,
      amount: initialAmount,
      currency: initialCurrency,
      issuer: initialIssuer,
      destinationTag: '',
      memo: initialMemo,
    },
  });

  const getAvailableBalance = (currency?: string, issuer?: string) => {
    // For XRP, use dynamic reserve calculation with live XRPL reserve values
    if (!currency || currency === 'XRP') {
      const baseReserve = serverInfo?.reserve_base_xrp ?? 1;
      const incrementReserve = serverInfo?.reserve_inc_xrp ?? 0.2;
      const balanceInfo = calculateAvailableBalance(accountInfo, 12, baseReserve, incrementReserve);
      return balanceInfo.availableMinusFees;
    }
    
    // For tokens, get trustline balance
    if (currency && issuer) {
      return getTokenBalance(accountLines, currency, issuer);
    }
    
    return 0;
  };

  const handleAddressQRScan = (validatedAddress: string) => {
    form.setValue('destination', validatedAddress);
    setShowAddressScanner(false);
    
    toast({
      title: "Address Scanned",
      description: `Destination set to ${truncateAddress(validatedAddress, 8, 6)}`,
    });
  };

  const createTransactionQR = async (txData: TransactionFormData) => {
    if (!currentWallet || !accountInfo || 'account_not_found' in accountInfo) {
      throw new Error('Wallet or account information not available');
    }

    // Create amount field based on currency type
    let amount: string | { currency: string; value: string; issuer: string };
    
    if (txData.currency === 'XRP') {
      // XRP amount in drops (string)
      amount = (parseFloat(txData.amount) * 1000000).toString();
    } else {
      // Token amount (object with currency, value, issuer)
      if (!txData.issuer) {
        throw new Error('Issuer is required for token payments');
      }
      amount = {
        currency: txData.currency,
        value: txData.amount,
        issuer: txData.issuer
      };
    }
    
    // Get current sequence number
    const sequence = ('account_data' in accountInfo && accountInfo.account_data?.Sequence) || 1;

    // Try to use real XRPL network data, but allow transaction creation for testing
    let transactionSequence = 1;
    let transactionLedger = 1000;
    
    if (accountInfo && 'account_data' in accountInfo && accountInfo.account_data) {
      // Use real network data when available
      transactionSequence = accountInfo.account_data.Sequence || 1;
      // Check both possible ledger index fields (current or validated ledger)
      transactionLedger = accountInfo.ledger_current_index || accountInfo.ledger_index || 1000;
    }
    
    // Validate publicKey is present for Keystone signing
    if (!currentWallet.publicKey) {
      throw new Error('Public key is required for signing. Please reconnect your Keystone wallet to restore the public key.');
    }

    // Create transaction for Keystone 3 Pro using actual form data
    const xrpTransaction = {
      Account: currentWallet.address,
      Amount: amount,
      Destination: txData.destination,
      Fee: "12",
      Flags: 2147483648,
      LastLedgerSequence: transactionLedger + 1000, // Current ledger + buffer
      Sequence: transactionSequence,
      SigningPubKey: currentWallet.publicKey,
      TransactionType: "Payment"
    };

    // Add optional fields
    if (txData.destinationTag) {
      (xrpTransaction as any).DestinationTag = parseInt(txData.destinationTag);
    }
    
    if (txData.memo) {
      (xrpTransaction as any).Memos = [{
        Memo: {
          MemoData: new TextEncoder().encode(txData.memo).reduce((hex, byte) => 
            hex + byte.toString(16).padStart(2, '0'), '').toUpperCase()
        }
      }];
    }

    try {
      
      // Create proper transaction JSON template with actual form data
      const transactionTemplate = {
        Account: currentWallet.address,
        Amount: amount,
        Destination: txData.destination,
        Fee: "12",
        Flags: 2147483648,
        LastLedgerSequence: xrpTransaction.LastLedgerSequence,
        Sequence: transactionSequence,
        SigningPubKey: currentWallet.publicKey,
        TransactionType: "Payment"
      };
      
      // Add optional fields if provided
      if (txData.destinationTag) {
        (transactionTemplate as any).DestinationTag = parseInt(txData.destinationTag);
      }
      
      const urResult = await encodeKeystoneUR(transactionTemplate);
      
      // Store the unsigned transaction so we can combine it with the signature later
      setPendingUnsignedTx(transactionTemplate);
      
      return urResult;
      
    } catch {
      throw new Error('Failed to encode transaction for Keystone 3 Pro');
    }
  };

  const onSubmit = async (data: TransactionFormData) => {
    if (currentWallet?.walletType === 'watchOnly') {
      toast({
        title: "Watch-Only Account",
        description: "This account cannot send transactions. Connect a Keystone 3 Pro to enable sending.",
        variant: "destructive",
      });
      return;
    }

    // Check if wallet is active (within tier limits)
    if (currentWallet && !isWalletActive(currentWallet)) {
      toast({
        title: "Wallet Inactive",
        description: "This wallet exceeds your plan limits. Upgrade to Premium or remove other wallets to enable transactions.",
        variant: "destructive",
      });
      return;
    }

    if (!currentWallet?.hardwareWalletType || currentWallet.hardwareWalletType !== 'Keystone 3 Pro') {
      toast({
        title: "Hardware Wallet Required",
        description: "Please connect your Keystone 3 Pro device first",
        variant: "destructive",
      });
      return;
    }

    // Wait for account info to be loaded before checking balance
    if (isAccountInfoLoading) {
      toast({
        title: "Loading Account Data",
        description: "Please wait for your account balance to load",
        variant: "destructive",
      });
      return;
    }

    // Check if account info is available
    if (!accountInfo || 'account_not_found' in accountInfo) {
      toast({
        title: "Account Not Found",
        description: "Unable to fetch your account balance. Please check your connection.",
        variant: "destructive",
      });
      return;
    }

    const availableBalance = getAvailableBalance(data.currency, data.issuer);
    const amount = parseFloat(data.amount);
    
    if (amount > availableBalance) {
      const currencyName = data.currency === 'XRP' ? 'XRP' : xrplClient.decodeCurrency(data.currency);
      toast({
        title: "Insufficient Balance",
        description: `You can send up to ${availableBalance.toFixed(6)} ${currencyName}`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setCurrentStep('qr-display');

    try {
      // Create QR code data for Keystone 3 Pro
      const urData = await createTransactionQR(data);
      setKeystoneUR(urData);
      setShowQRDialog(true);

      toast({
        title: "QR Code Generated",
        description: "Scan the QR code with your Keystone 3 Pro to sign the transaction",
      });

      setPendingTransactionData(data);

    } catch (error) {
      toast({
        title: "Transaction Failed",
        description: error instanceof Error ? error.message : "Failed to send transaction",
        variant: "destructive",
      });
      setCurrentStep('form');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignedQRScan = async (signedQRData: string) => {
    if (!currentWallet || !pendingTransactionData) {
      return;
    }

    if (processingSignatureRef.current) {
      return;
    }

    try {
      processingSignatureRef.current = true;
      setCurrentStep('submitting');
      setIsSubmitting(true);
      setShowSignedQRScanner(false);

      let signedTransaction;
      try {
        if (signedQRData.toUpperCase().startsWith('UR:XRP-SIGNATURE/') || 
            signedQRData.toUpperCase().startsWith('UR:BYTES/')) {
          
          try {
            const { parseKeystoneSignature } = await import('@/lib/keystone-client');
            const result = parseKeystoneSignature(signedQRData);
            
            const signatureData = result.signature;
            
            let txBlob: string;
            
            if (signatureData.length > 200 && /^1[0-9a-f]00/i.test(signatureData)) {
              txBlob = signatureData.toUpperCase();
            } else {
              if (!pendingUnsignedTx) {
                throw new Error('Original transaction not found');
              }
              
              const signedTx = {
                ...pendingUnsignedTx,
                TxnSignature: signatureData
              };
              
              txBlob = encode(signedTx);
            }
            
            signedTransaction = {
              txBlob: txBlob,
              txHash: result.requestId || ''
            };
            
          } catch (error) {
            throw error;
          }
          
        } else if (signedQRData.startsWith('{')) {
          signedTransaction = JSON.parse(signedQRData);
          
        } else if (/^[0-9A-Fa-f]+$/.test(signedQRData)) {
          signedTransaction = {
            txBlob: signedQRData,
            txHash: null
          };
          
        } else {
          throw new Error('Unrecognized signed transaction format. Expected UR:XRP-SIGNATURE/, UR:BYTES/, JSON, or hex data.');
        }
        
        if (!signedTransaction.txBlob) {
          throw new Error('Signed transaction missing transaction blob');
        }
        
        const txBlob = signedTransaction.txBlob.toUpperCase();
        
        if (!txBlob || txBlob.length < 20 || !/^[0-9A-F]+$/.test(txBlob)) {
          throw new Error('Invalid transaction blob format. Must be valid hex.');
        }
        
        const firstByte = txBlob.substring(0, 2);
        if (firstByte === '30' || firstByte === '31' || firstByte === '32') {
          const paymentPattern = txBlob.match(/(12[0-9A-F]{40,})/);
          if (paymentPattern) {
            signedTransaction.txBlob = paymentPattern[1];
          } else {
            throw new Error('Unable to extract valid XRPL transaction from Keystone signed data. The device may be using an incompatible encoding format.');
          }
        }
        
      } catch (parseError) {
        throw new Error('Invalid signed transaction QR code format. Please ensure you scanned the signed transaction from your Keystone device.');
      }

      const submissionNetwork = currentWallet?.network || 'mainnet';
      
      const txBlob = signedTransaction.txBlob || signedTransaction.signedTransaction;
      const submitResult = await xrplClient.submitTransaction(txBlob, submissionNetwork);
      
      if (!submitResult.success) {
        throw new Error(submitResult.engineResultMessage || 'Failed to submit transaction to network');
      }

      setCurrentStep('complete');
      
      toast({
        title: "Transaction Sent",
        description: `Successfully sent ${pendingTransactionData.amount} ${pendingTransactionData.currency} to ${pendingTransactionData.destination}`,
      });

      // Reset form and state
      form.reset();
      setPendingTransactionData(null);
      
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }

    } catch (error) {
      toast({
        title: "Transaction Failed",
        description: error instanceof Error ? error.message : "Failed to submit signed transaction",
        variant: "destructive",
      });
      setCurrentStep('qr-display');
    } finally {
      setIsSubmitting(false);
      processingSignatureRef.current = false;
    }
  };

  const handleQRDialogClose = () => {
    setShowQRDialog(false);
    setCurrentStep('form');
    setKeystoneUR(null);
    setPendingTransactionData(null);
    setPendingUnsignedTx(null);
  };

  const availableBalance = getAvailableBalance();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Send className="w-5 h-5" />
            <span>Send Payment</span>
          </CardTitle>
          <CardDescription>
            Send XRP or tokens using your Keystone 3 Pro hardware wallet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="destination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destination Address</FormLabel>
                    <div className="flex space-x-2">
                      <FormControl>
                        <Input 
                          placeholder="rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" 
                          {...field}
                          data-testid="input-destination"
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setShowAddressScanner(true)}
                        data-testid="button-scan-address"
                      >
                        <QrCode className="w-4 h-4" />
                      </Button>
                    </div>
                    <FormDescription>
                      The XRP address to send funds to
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => {
                  // Create a combined value for the select (currency|issuer or just XRP)
                  const selectValue = field.value === 'XRP' 
                    ? 'XRP' 
                    : `${field.value}|${form.watch('issuer')}`;
                  
                  // Get display name for selected currency
                  const displayValue = field.value ? xrplClient.decodeCurrency(field.value) : undefined;
                  
                  return (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          const [currency, issuer] = value.split('|');
                          field.onChange(currency);
                          form.setValue('issuer', issuer || '');
                        }} 
                        value={selectValue}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-currency">
                            <SelectValue placeholder="Select currency">
                              {displayValue}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="XRP">XRP</SelectItem>
                          {accountLines?.lines?.map((line: any) => {
                            const displayCurrency = xrplClient.decodeCurrency(line.currency);
                            return (
                              <SelectItem 
                                key={`${line.currency}-${line.account}`} 
                                value={`${line.currency}|${line.account}`}
                              >
                                {displayCurrency}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Select XRP or a token you hold
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input 
                          type="number" 
                          step="0.000001"
                          placeholder="0.000000" 
                          {...field}
                          data-testid="input-amount"
                        />
                        <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                          {form.watch('currency') ? xrplClient.decodeCurrency(form.watch('currency')) : 'XRP'}
                        </span>
                      </div>
                    </FormControl>
                    <div className="mt-2">
                      <AmountPresetButtons
                        availableAmount={getAvailableBalance(form.watch('currency'), form.watch('issuer'))}
                        onSelect={(amount) => form.setValue('amount', amount)}
                        disabled={isLoading}
                      />
                    </div>
                    <FormDescription>
                      {(() => {
                        const currency = form.watch('currency');
                        const issuer = form.watch('issuer');
                        const balance = getAvailableBalance(currency, issuer);
                        const displayCurrency = currency === 'XRP' ? 'XRP' : xrplClient.decodeCurrency(currency);
                        return balance > 0 ? `Available: ${balance.toFixed(6)} ${displayCurrency}` : '';
                      })()}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="destinationTag"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destination Tag (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        placeholder="12345" 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Required by some exchanges and services
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="memo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Memo (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Payment description..." 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Optional memo for this transaction
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full"
                disabled={isLoading || !currentWallet?.hardwareWalletType}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Transaction...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Sign Transaction
                  </>
                )}
              </Button>

              {!currentWallet?.hardwareWalletType && (
                <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>Connect your Keystone 3 Pro device to send transactions</span>
                </div>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>

      <Dialog open={showQRDialog} onOpenChange={handleQRDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <QrCode className="w-5 h-5" />
              <span>Sign Transaction</span>
            </DialogTitle>
            <DialogDescription>
              Scan this QR code with your Keystone 3 Pro device to sign the transaction
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col items-center space-y-4">
            {keystoneUR && (
              <div 
                className="border-2 border-border rounded-lg p-4 bg-white cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                onClick={handleOpenFullscreen}
                title="Tap to view fullscreen"
              >
                <AnimatedQRCode 
                  type={keystoneUR.type} 
                  cbor={keystoneUR.cbor}
                />
              </div>
            )}
            
            <div className="text-center space-y-2">
              {currentStep === 'qr-display' && (
                <Button 
                  onClick={() => setShowSignedQRScanner(true)}
                  className="w-full"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Scan Signed Transaction
                </Button>
              )}
              
              {currentStep === 'submitting' && (
                <div className="space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  <p className="text-sm font-medium">Submitting to XRPL...</p>
                  <p className="text-sm text-muted-foreground">
                    Broadcasting your transaction to the network
                  </p>
                </div>
              )}
              
              {currentStep === 'complete' && (
                <div className="space-y-2">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center mx-auto">
                    <span className="text-white text-sm">✓</span>
                  </div>
                  <p className="text-sm font-medium text-green-600">Transaction Sent!</p>
                  <p className="text-sm text-muted-foreground">
                    Your XRP transaction has been submitted successfully
                  </p>
                </div>
              )}
            </div>

            <Button 
              onClick={handleQRDialogClose} 
              variant="outline" 
              className="w-full"
              disabled={currentStep === 'submitting'}
            >
              {currentStep === 'complete' ? 'Close' : 'Cancel Transaction'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Scanner for Signed Transaction Response */}
      {showSignedQRScanner && (
        <KeystoneQRScanner
          onScan={handleSignedQRScan}
          onClose={() => setShowSignedQRScanner(false)}
          title="Scan Signed Transaction"
          description="Scan the signed transaction QR code from your Keystone 3 Pro device"
        />
      )}

      {/* QR Scanner for Destination Address */}
      {showAddressScanner && (
        <GeneralQRScanner
          mode="address"
          onScan={handleAddressQRScan}
          onClose={() => setShowAddressScanner(false)}
          title="Scan Destination Address"
          description="Scan the QR code containing the destination XRP address"
        />
      )}

      {/* Fullscreen QR Viewer */}
      {showFullscreen && keystoneUR && (
        <FullscreenQRViewer onClose={handleCloseFullscreen}>
          <AnimatedQRCode 
            type={keystoneUR.type} 
            cbor={keystoneUR.cbor}
          />
        </FullscreenQRViewer>
      )}
    </>
  );
}