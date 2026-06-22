import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle,
  Loader2,
  CheckCircle,
  XCircle,
  QrCode,
  Trash2,
} from 'lucide-react';
import { AnimatedQRCode } from '@keystonehq/animated-qr';
import { KeystoneQRScanner } from '@/components/keystone-qr-scanner';
import { FullscreenQRViewer } from '@/components/fullscreen-qr-viewer';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/hooks/use-wallet';
import { useAccountInfo, useServerInfo } from '@/hooks/use-xrpl';
import { xrplClient } from '@/lib/xrpl-client';
import { parseKeystoneSignature, prepareXrpSignRequest } from '@/lib/keystone-client';
import { browserStorage } from '@/lib/browser-storage';
import { checkAccountDeleteEligibility, type AccountDeletePreflightResult } from '@/lib/account-delete-preflight';
import { encode } from 'ripple-binary-codec';
import { queryClient } from '@/lib/queryClient';

const ACCOUNT_DELETE_FEE_DROPS = '200000';
const ACCOUNT_DELETE_FEE_XRP = '0.2';

type ModalStep =
  | 'warning'
  | 'checking'
  | 'blockers'
  | 'destination'
  | 'signing'
  | 'submitting'
  | 'success'
  | 'failed';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DeleteAccountModal({ isOpen, onClose }: DeleteAccountModalProps) {
  const [step, setStep] = useState<ModalStep>('warning');
  const [preflight, setPreflight] = useState<AccountDeletePreflightResult | null>(null);
  const [destination, setDestination] = useState('');
  const [destinationTag, setDestinationTag] = useState('');
  const [destinationError, setDestinationError] = useState('');
  const [isValidatingDest, setIsValidatingDest] = useState(false);
  const [transactionUR, setTransactionUR] = useState<{ type: string; cbor: string } | null>(null);
  const [unsignedTx, setUnsignedTx] = useState<any>(null);
  const [showSignedScanner, setShowSignedScanner] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successHash, setSuccessHash] = useState('');
  const closeTimestampRef = useRef<number>(0);
  const processingRef = useRef(false);

  const { toast } = useToast();
  const { currentWallet } = useWallet();
  const network = currentWallet?.network ?? 'mainnet';
  const { data: accountInfo } = useAccountInfo(currentWallet?.address || null, network);
  const { data: serverInfo } = useServerInfo(network);

  const balance = (accountInfo && 'account_data' in accountInfo && accountInfo.account_data?.Balance)
    ? (parseInt(accountInfo.account_data.Balance, 10) / 1_000_000).toFixed(6)
    : '0.000000';
  const balanceAfterFee = Math.max(0, parseFloat(balance) - parseFloat(ACCOUNT_DELETE_FEE_XRP)).toFixed(6);

  useEffect(() => {
    if (!isOpen) {
      setStep('warning');
      setPreflight(null);
      setDestination('');
      setDestinationTag('');
      setDestinationError('');
      setTransactionUR(null);
      setUnsignedTx(null);
      setShowSignedScanner(false);
      setShowFullscreen(false);
      setErrorMessage('');
      setSuccessHash('');
      processingRef.current = false;
    }
  }, [isOpen]);

  const runPreflight = async () => {
    if (!currentWallet?.address) return;
    setStep('checking');
    try {
      const result = await checkAccountDeleteEligibility(currentWallet.address, network);
      setPreflight(result);
      if (!result.eligible) {
        setStep('blockers');
      } else {
        setStep('destination');
      }
    } catch (err) {
      toast({
        title: 'Preflight Check Failed',
        description: err instanceof Error ? err.message : 'Unable to check account status.',
        variant: 'destructive',
      });
      setStep('warning');
    }
  };

  const validateAndProceed = async () => {
    if (!destination.trim()) {
      setDestinationError('Destination address is required.');
      return;
    }
    if (!/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(destination.trim())) {
      setDestinationError('Invalid XRP address format.');
      return;
    }
    if (destination.trim() === currentWallet?.address) {
      setDestinationError('Destination cannot be the same as the account being deleted.');
      return;
    }
    if (destinationTag && (isNaN(Number(destinationTag)) || Number(destinationTag) < 0 || !Number.isInteger(Number(destinationTag)))) {
      setDestinationError('Destination tag must be a non-negative integer.');
      return;
    }
    setDestinationError('');
    setIsValidatingDest(true);
    try {
      const destInfo = await xrplClient.getAccountInfo(destination.trim(), network);
      if (!destInfo || 'account_not_found' in destInfo) {
        setDestinationError('Destination address is not funded on XRPL. It must have at least 1 XRP.');
        setIsValidatingDest(false);
        return;
      }
    } catch {
      setDestinationError('Could not verify destination address. Check your connection and try again.');
      setIsValidatingDest(false);
      return;
    }
    setIsValidatingDest(false);
    await buildTransaction();
  };

  const buildTransaction = async () => {
    if (!currentWallet || !accountInfo || 'account_not_found' in accountInfo) return;
    if (!currentWallet.publicKey) {
      toast({
        title: 'Public Key Missing',
        description: 'Reconnect your Keystone wallet to restore the public key.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const accountData = (accountInfo as any).account_data;
      const sequence: number = accountData?.Sequence ?? 1;
      const ledgerIndex: number =
        (accountInfo as any).ledger_current_index ??
        (accountInfo as any).ledger_index ??
        1000;

      const tx: any = {
        TransactionType: 'AccountDelete',
        Account: currentWallet.address,
        Destination: destination.trim(),
        Fee: ACCOUNT_DELETE_FEE_DROPS,
        Flags: 2147483648,
        LastLedgerSequence: ledgerIndex + 1000,
        Sequence: sequence,
        SigningPubKey: currentWallet.publicKey,
      };
      if (destinationTag.trim()) {
        tx.DestinationTag = parseInt(destinationTag.trim(), 10);
      }

      const urResult = prepareXrpSignRequest(tx);
      setUnsignedTx(tx);
      setTransactionUR({ type: urResult.type, cbor: urResult.cbor });
      setStep('signing');
    } catch (err) {
      toast({
        title: 'Transaction Build Failed',
        description: err instanceof Error ? err.message : 'Failed to prepare transaction.',
        variant: 'destructive',
      });
    }
  };

  const handleSignedQRScan = async (signedQRData: string) => {
    if (!unsignedTx || !currentWallet || processingRef.current) return;
    processingRef.current = true;
    setShowSignedScanner(false);
    setStep('submitting');

    try {
      let txBlob: string;
      if (
        signedQRData.toUpperCase().startsWith('UR:XRP-SIGNATURE/') ||
        signedQRData.toUpperCase().startsWith('UR:BYTES/')
      ) {
        const result = parseKeystoneSignature(signedQRData);
        const sig = result.signature;
        if (sig.length > 200 && /^1[0-9a-f]00/i.test(sig)) {
          txBlob = sig.toUpperCase();
        } else {
          txBlob = encode({ ...unsignedTx, TxnSignature: sig });
        }
      } else {
        throw new Error('Invalid QR format. Scan the signed transaction from your Keystone device.');
      }

      const submitResult = await xrplClient.submitTransaction(txBlob, network, true);

      if (!submitResult.success) {
        throw new Error(submitResult.engineResultMessage || submitResult.engineResult);
      }

      browserStorage.markWalletDeletedOnXrpl(currentWallet.id);
      queryClient.invalidateQueries({ queryKey: ['browser-wallets'] });
      queryClient.invalidateQueries({ queryKey: ['accountInfo', currentWallet.address, network] });

      setSuccessHash(submitResult.hash || '');
      setStep('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Submission failed.';
      setErrorMessage(msg);
      setStep('failed');
    } finally {
      processingRef.current = false;
    }
  };

  const handleClose = () => {
    if (step === 'submitting') return;
    onClose();
  };

  const renderContent = () => {
    switch (step) {
      case 'warning':
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="text-sm text-red-800 dark:text-red-300 space-y-1">
                <p className="font-semibold">This permanently removes your account from the XRP Ledger.</p>
                <p>Your remaining XRP will be sent to a destination address you choose. This action cannot be undone.</p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Current balance</span>
                <span className="font-medium">{balance} XRP</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Deletion fee (burned)</span>
                <span className="font-medium text-red-600 dark:text-red-400">− {ACCOUNT_DELETE_FEE_XRP} XRP</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-muted-foreground">You'll receive</span>
                <span className="font-semibold">≈ {balanceAfterFee} XRP</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-semibold">⚠ The {ACCOUNT_DELETE_FEE_XRP} XRP fee is burned even if the deletion fails.</p>
              <p>The app submits with <code>fail_hard</code> to prevent paying the fee when the deletion would fail — but please check your account meets all requirements first.</p>
            </div>

            <div className="space-y-1.5 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">What stays in the app:</p>
              <p>Your account record remains in the app for viewing transaction history. It will be marked as "Deleted on XRPL".</p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={runPreflight}>
                Continue
              </Button>
            </div>
          </div>
        );

      case 'checking':
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm font-medium">Checking account eligibility…</p>
            <p className="text-xs text-muted-foreground text-center">
              Verifying sequence age, object count, and deletion blockers
            </p>
          </div>
        );

      case 'blockers': {
        const issues: string[] = [];
        if (preflight && !preflight.sequenceOk) {
          issues.push(`Your account sequence (${preflight.accountSequence}) needs to be at least 255 ledgers behind the current ledger (${preflight.currentLedgerIndex}). Required: sequence + 255 ≤ ledger index. Your account isn't old enough yet.`);
        }
        if (preflight && !preflight.objectCountOk) {
          issues.push(`Your account owns ${preflight.objectCount} objects. The maximum is 1,000.`);
        }
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Your account cannot be deleted yet. Resolve the issues below first.
              </p>
            </div>

            {issues.map((msg, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted text-sm">{msg}</div>
            ))}

            {preflight?.blockers && preflight.blockers.length > 0 && (
              <div className="space-y-2">
                {preflight.blockers.map((b) => (
                  <div key={b.type} className="flex items-start gap-3 p-3 rounded-lg bg-muted">
                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">{b.label} ({b.count})</p>
                      <p className="text-muted-foreground">{b.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {preflight?.errorMessage && (
              <div className="p-3 rounded-lg bg-muted text-sm text-muted-foreground">{preflight.errorMessage}</div>
            )}

            <Button className="w-full" onClick={handleClose}>Close</Button>
          </div>
        );
      }

      case 'destination':
        return (
          <div className="space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-green-800 dark:text-green-300">Account is eligible for deletion</span>
              </div>
              <p className="text-xs text-green-700 dark:text-green-400">
                {preflight?.objectCount ?? 0} owned objects — no blockers found
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="dest-address">Destination Address <span className="text-red-500">*</span></Label>
                <Input
                  id="dest-address"
                  placeholder="rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                  value={destination}
                  onChange={(e) => { setDestination(e.target.value); setDestinationError(''); }}
                  className={destinationError ? 'border-red-500' : ''}
                />
                <p className="text-xs text-muted-foreground">
                  Must be a funded XRP Ledger address. All remaining XRP (≈ {balanceAfterFee} XRP after the 0.2 XRP fee) will be sent here.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dest-tag">Destination Tag <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  id="dest-tag"
                  placeholder="e.g. 12345"
                  value={destinationTag}
                  onChange={(e) => { setDestinationTag(e.target.value); setDestinationError(''); }}
                />
              </div>

              {destinationError && (
                <p className="text-sm text-red-600 dark:text-red-400">{destinationError}</p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={isValidatingDest}
                onClick={validateAndProceed}
              >
                {isValidatingDest ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isValidatingDest ? 'Validating…' : 'Build Transaction'}
              </Button>
            </div>
          </div>
        );

      case 'signing':
        return (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-semibold">Review carefully on your Keystone device</p>
              <p>TransactionType: AccountDelete — Destination: {destination.slice(0, 8)}…{destination.slice(-6)}</p>
              <p>Fee: {ACCOUNT_DELETE_FEE_XRP} XRP (burned)</p>
            </div>

            {transactionUR && (
              <div
                className="border-2 border-border rounded-lg p-4 bg-white cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all flex justify-center"
                onClick={() => {
                  if (Date.now() - closeTimestampRef.current > 300) setShowFullscreen(true);
                }}
                title="Tap to view fullscreen"
              >
                <AnimatedQRCode type={transactionUR.type} cbor={transactionUR.cbor} />
              </div>
            )}

            <div className="text-center space-y-1 text-sm text-muted-foreground">
              <p>1. Open the XRP app on your Keystone 3 Pro</p>
              <p>2. Scan this QR code and verify the transaction</p>
              <p>3. Sign on your device, then tap below</p>
            </div>

            <Button className="w-full" onClick={() => setShowSignedScanner(true)}>
              <QrCode className="w-4 h-4 mr-2" />
              I've Signed — Scan Result QR
            </Button>
            <Button variant="outline" className="w-full" onClick={handleClose}>Cancel</Button>
          </div>
        );

      case 'submitting':
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm font-medium">Submitting to XRP Ledger…</p>
            <p className="text-xs text-muted-foreground text-center">
              Sending AccountDelete transaction with fail_hard enabled
            </p>
          </div>
        );

      case 'success':
        return (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle className="w-14 h-14 text-green-500" />
              <p className="text-lg font-semibold">Account Deleted on XRPL</p>
              <p className="text-sm text-muted-foreground text-center">
                Your account has been removed from the XRP Ledger. The remaining XRP has been sent to {destination.slice(0, 8)}…{destination.slice(-6)}.
              </p>
            </div>
            {successHash && (
              <div className="p-3 bg-muted rounded-lg text-xs font-mono break-all text-center text-muted-foreground">
                TX: {successHash}
              </div>
            )}
            <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground">
              Your account record is still in the app and marked as "Deleted on XRPL". You can still view its transaction history.
            </div>
            <Button className="w-full" onClick={onClose}>Done</Button>
          </div>
        );

      case 'failed':
        return (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <XCircle className="w-14 h-14 text-red-500" />
              <p className="text-lg font-semibold">Deletion Failed</p>
            </div>
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-300">
              {errorMessage || 'The transaction was rejected by the network.'}
            </div>
            <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground">
              Because <code>fail_hard</code> was used, the 0.2 XRP fee was NOT burned — the transaction was not included in a ledger.
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleClose}>Close</Button>
              <Button className="flex-1" onClick={() => { setStep('warning'); setErrorMessage(''); }}>Try Again</Button>
            </div>
          </div>
        );
    }
  };

  const stepTitle: Record<ModalStep, string> = {
    warning: 'Delete Account on XRPL',
    checking: 'Checking Eligibility',
    blockers: 'Cannot Delete Yet',
    destination: 'Enter Destination',
    signing: 'Sign with Keystone',
    submitting: 'Submitting Transaction',
    success: 'Deletion Complete',
    failed: 'Deletion Failed',
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              {stepTitle[step]}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Delete this account from the XRP Ledger
            </DialogDescription>
          </DialogHeader>
          <div className="pt-1">{renderContent()}</div>
        </DialogContent>
      </Dialog>

      {showSignedScanner && (
        <KeystoneQRScanner
          onScan={handleSignedQRScan}
          onClose={() => setShowSignedScanner(false)}
          title="Scan Signed Transaction"
          description="Scan the signed AccountDelete QR from your Keystone 3 Pro"
        />
      )}

      {showFullscreen && transactionUR && (
        <FullscreenQRViewer
          onClose={() => {
            closeTimestampRef.current = Date.now();
            setShowFullscreen(false);
          }}
        >
          <AnimatedQRCode type={transactionUR.type} cbor={transactionUR.cbor} />
        </FullscreenQRViewer>
      )}
    </>
  );
}
