import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Eye, Globe, AlertCircle, QrCode } from 'lucide-react';
import { useWallet } from '@/hooks/use-wallet';
import { xrplClient } from '@/lib/xrpl-client';
import { GeneralQRScanner } from '@/components/general-qr-scanner';

interface WatchOnlyAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WatchOnlyAddressModal({ isOpen, onClose }: WatchOnlyAddressModalProps) {
  const [address, setAddress] = useState('');
  const [walletName, setWalletName] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddressScanner, setShowAddressScanner] = useState(false);
  const { createWallet } = useWallet();

  const handleAddressQRScan = (validatedAddress: string) => {
    setAddress(validatedAddress);
    setError(null);
    setShowAddressScanner(false);
  };

  const handleClose = () => {
    setAddress('');
    setWalletName('');
    setSelectedNetwork('mainnet');
    setError(null);
    setIsValidating(false);
    onClose();
  };

  const handleAddAddress = async () => {
    setError(null);
    setIsValidating(true);

    try {
      const trimmedAddress = address.trim();
      
      if (!trimmedAddress) {
        setError('Please enter an XRPL address');
        setIsValidating(false);
        return;
      }

      if (!xrplClient.isValidAddress(trimmedAddress)) {
        setError('Invalid XRPL address format. Addresses start with "r" and are 25-35 characters.');
        setIsValidating(false);
        return;
      }

      await createWallet.mutateAsync({
        address: trimmedAddress,
        walletType: 'watchOnly',
        network: selectedNetwork,
        name: walletName || undefined,
      });

      handleClose();
    } catch (err: any) {
      const errorMessage = err?.message || err?.toString() || 'Failed to add address';
      setError(errorMessage);
      setIsValidating(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open && !showAddressScanner) {
          handleClose();
        }
      }}>
        <DialogContent className="max-w-md mx-auto p-6 bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Eye className="w-5 h-5 text-primary" />
            <span>Add Watch-Only Address</span>
          </DialogTitle>
          <DialogDescription>
            Monitor any XRPL address without signing capabilities. You can view balances, transactions, and tokens but cannot send or sign transactions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="xrpl-address">XRPL Address</Label>
            <div className="flex space-x-2">
              <Input
                id="xrpl-address"
                placeholder="rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setError(null);
                }}
                data-testid="input-watch-only-address"
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowAddressScanner(true)}
                data-testid="button-scan-watch-only-address"
              >
                <QrCode className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter any valid XRPL address to monitor
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="watch-wallet-name">Account Name (Optional)</Label>
            <Input
              id="watch-wallet-name"
              placeholder="e.g., Exchange Wallet"
              value={walletName}
              onChange={(e) => setWalletName(e.target.value)}
              data-testid="input-watch-only-name"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Network
            </Label>
            <RadioGroup 
              value={selectedNetwork} 
              onValueChange={(value: 'mainnet' | 'testnet') => setSelectedNetwork(value)}
            >
              <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="mainnet" id="watch-mainnet" data-testid="radio-watch-mainnet" />
                <Label htmlFor="watch-mainnet" className="flex-1 cursor-pointer">
                  <div className="font-medium text-sm">Mainnet</div>
                  <div className="text-xs text-muted-foreground">Production network</div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="testnet" id="watch-testnet" data-testid="radio-watch-testnet" />
                <Label htmlFor="watch-testnet" className="flex-1 cursor-pointer">
                  <div className="font-medium text-sm">Testnet</div>
                  <div className="text-xs text-muted-foreground">Test network</div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <strong>Watch-only accounts</strong> can view balances and transaction history, but cannot send funds, create DEX offers, or manage trustlines. To perform transactions, connect a Keystone 3 Pro hardware wallet.
            </p>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handleAddAddress} 
              className="flex-1" 
              disabled={isValidating || createWallet.isPending}
              data-testid="button-add-watch-only"
            >
              {isValidating || createWallet.isPending ? 'Adding...' : 'Add Watch-Only Address'}
            </Button>
            <Button 
              onClick={handleClose} 
              variant="outline" 
              className="flex-1"
              data-testid="button-cancel-watch-only"
            >
              Cancel
            </Button>
          </div>
        </div>
        </DialogContent>
      </Dialog>

      {showAddressScanner && (
        <GeneralQRScanner
          mode="address"
          onScan={handleAddressQRScan}
          onClose={() => setShowAddressScanner(false)}
          title="Scan Address QR Code"
          description="Scan the QR code containing the XRP address to monitor"
        />
      )}
    </>
  );
}
