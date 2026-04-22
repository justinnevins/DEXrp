import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Wallet, Shield, Plus, Globe, Eye } from 'lucide-react';
import { KeystoneAccountScanner } from '@/components/keystone-account-scanner';
import { WatchOnlyAddressModal } from '@/components/modals/watch-only-address-modal';
import { useHardwareWallet } from '@/hooks/use-hardware-wallet';
import { useWallet } from '@/hooks/use-wallet';

export function EmptyWalletState() {
  const [showNetworkSelection, setShowNetworkSelection] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showWatchOnly, setShowWatchOnly] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  const [walletName, setWalletName] = useState('');
  const { connect } = useHardwareWallet();
  const { createWallet } = useWallet();

  const handleNetworkConfirm = () => {
    setShowNetworkSelection(false);
    setShowScanner(true);
  };

  const handleAccountScan = async (address: string, publicKey: string) => {
    try {
      await connect('Keystone 3 Pro');
      
      await createWallet.mutateAsync({
        address,
        publicKey,
        hardwareWalletType: 'Keystone 3 Pro',
        network: selectedNetwork,
        name: walletName || undefined,
      });
      
      setShowScanner(false);
      setSelectedNetwork('mainnet'); // Reset to default
      setWalletName('');
    } catch (error: any) {
      alert(`Connection failed: ${error.message}`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
            <Wallet className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          
          <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">No Accounts
</h2>
          
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Connect your Keystone 3 Pro to view real-time balance, transactions, and trustlines</p>
          
          <div className="space-y-3 mb-6">
            <div className="flex items-center space-x-3 text-sm text-gray-700 dark:text-gray-300">
              <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span>Secure hardware wallet integration</span>
            </div>
            <div className="flex items-center space-x-3 text-sm text-gray-700 dark:text-gray-300">
              <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span>Real-time XRPL network data</span>
            </div>
            <div className="flex items-center space-x-3 text-sm text-gray-700 dark:text-gray-300">
              <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span>Transaction signing & management</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-3">
            <Button 
              onClick={() => setShowNetworkSelection(true)}
              className="w-full"
              data-testid="add-account-button"
            >
              <Plus className="w-4 h-4 mr-2" />
              Connect Keystone 3 Pro
            </Button>
            <Button 
              onClick={() => setShowWatchOnly(true)}
              variant="outline"
              className="w-full"
              data-testid="add-watch-only-button"
            >
              <Eye className="w-4 h-4 mr-2" />
              Watch-Only
            </Button>
          </div>
        </CardContent>
      </Card>
      {showNetworkSelection && (
        <Dialog open={showNetworkSelection} onOpenChange={setShowNetworkSelection}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <Globe className="w-5 h-5 text-primary" />
                <span>Select Network</span>
              </DialogTitle>
              <DialogDescription>
                Choose which XRPL network this account will use. You can add the same address on both networks separately.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="wallet-name">Account Name (Optional)</Label>
                <Input
                  id="wallet-name"
                  placeholder="e.g., My Main Account"
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  data-testid="input-wallet-name"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank for auto-generated name
                </p>
              </div>

              <RadioGroup value={selectedNetwork} onValueChange={(value: 'mainnet' | 'testnet') => setSelectedNetwork(value)}>
                <div className="flex items-center space-x-2 border rounded-lg p-4 hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="mainnet" id="mainnet-empty" data-testid="radio-network-mainnet-empty" />
                  <Label htmlFor="mainnet-empty" className="flex-1 cursor-pointer">
                    <div className="font-medium">Mainnet</div>
                    <div className="text-sm text-muted-foreground">Production network with real XRP</div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-4 hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="testnet" id="testnet-empty" data-testid="radio-network-testnet-empty" />
                  <Label htmlFor="testnet-empty" className="flex-1 cursor-pointer">
                    <div className="font-medium">Testnet</div>
                    <div className="text-sm text-muted-foreground">Test network for development</div>
                  </Label>
                </div>
              </RadioGroup>

              <div className="flex gap-2">
                <Button onClick={handleNetworkConfirm} className="flex-1" data-testid="button-confirm-network-empty">
                  Continue
                </Button>
                <Button onClick={() => {
                  setShowNetworkSelection(false);
                  setSelectedNetwork('mainnet'); // Reset to default on cancel
                }} variant="outline" className="flex-1" data-testid="button-cancel-network-empty">
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {showScanner && (
        <Dialog open={showScanner} onOpenChange={setShowScanner}>
          <DialogContent className="sm:max-w-md">
            <KeystoneAccountScanner
              onScan={handleAccountScan}
              onClose={() => setShowScanner(false)}
            />
          </DialogContent>
        </Dialog>
      )}
      {showWatchOnly && (
        <WatchOnlyAddressModal isOpen={showWatchOnly} onClose={() => setShowWatchOnly(false)} />
      )}
    </div>
  );
}