import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Shield, QrCode, CheckCircle, Loader2, Globe, Eye } from 'lucide-react';
import { useHardwareWallet } from '@/hooks/use-hardware-wallet';
import { useWallet } from '@/hooks/use-wallet';
import type { HardwareWalletType } from '@/lib/real-hardware-wallet';
import { KeystoneAddressModal } from '@/components/modals/keystone-address-modal';
import { KeystoneAccountScanner } from '@/components/keystone-account-scanner';
import { WatchOnlyAddressModal } from '@/components/modals/watch-only-address-modal';

interface HardwareWalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const walletInfo = {
  'Keystone 3 Pro': {
    icon: QrCode,
    description: 'Air-gapped cold storage via QR codes',
    connectionType: 'QR Code',
    features: ['Air-gapped security', 'QR code signing', 'Multi-currency support'],
  },
};

export function HardwareWalletConnectModal({ isOpen, onClose }: HardwareWalletConnectModalProps) {
  const [availableWallets, setAvailableWallets] = useState<HardwareWalletType[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<HardwareWalletType | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  const [walletName, setWalletName] = useState('');
  const [showNetworkSelection, setShowNetworkSelection] = useState(false);
  const [showKeystoneModal, setShowKeystoneModal] = useState(false);
  const [showKeystoneScanner, setShowKeystoneScanner] = useState(false);
  const [showWatchOnlyModal, setShowWatchOnlyModal] = useState(false);
  const { connection, isConnecting, connect, disconnect, getAddress } = useHardwareWallet();
  const { createWallet } = useWallet();
  const isCreatingWalletRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      disconnect().catch(() => {});
      setAvailableWallets(['Keystone 3 Pro']);
      setSelectedWallet(null);
      setSelectedNetwork('mainnet');
      setWalletName('');
      setShowNetworkSelection(false);
      setShowKeystoneScanner(false);
      setShowKeystoneModal(false);
      setShowWatchOnlyModal(false);
      isCreatingWalletRef.current = false;
    }
  }, [isOpen, disconnect]);

  const handleConnect = async (walletType: HardwareWalletType) => {
    setSelectedWallet(walletType);
    
    // Show network selection first
    setShowNetworkSelection(true);
  };

  const handleNetworkConfirm = () => {
    // After network is selected, show the scanner
    setShowNetworkSelection(false);
    setShowKeystoneScanner(true);
  };

  const handleKeystoneAccountScan = async (address: string, publicKey: string) => {
    if (isCreatingWalletRef.current) {
      return;
    }
    isCreatingWalletRef.current = true;
    
    try {
      await connect('Keystone 3 Pro');
      
      await createWallet.mutateAsync({
        address,
        publicKey,
        hardwareWalletType: 'Keystone 3 Pro',
        network: selectedNetwork,
        name: walletName || undefined,
      });
      
      setShowKeystoneScanner(false);
      setShowNetworkSelection(false);
      setSelectedWallet(null);
      setSelectedNetwork('mainnet');
      setWalletName('');
      onClose();
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
      alert(`Failed to add account: ${errorMessage}`);
      isCreatingWalletRef.current = false;
    }
  };

  const handleKeystoneConfirm = async (address: string) => {
    if (isCreatingWalletRef.current) {
      return;
    }
    isCreatingWalletRef.current = true;
    
    try {
      await connect('Keystone 3 Pro');
      
      await createWallet.mutateAsync({
        address,
        hardwareWalletType: 'Keystone 3 Pro',
        network: selectedNetwork,
        name: walletName || undefined,
      });
      
      setShowKeystoneModal(false);
      setSelectedWallet(null);
      setSelectedNetwork('mainnet');
      setWalletName('');
      onClose();
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
      alert(`Failed to add account: ${errorMessage}`);
      isCreatingWalletRef.current = false;
    }
  };

  const handleKeystoneClose = () => {
    setShowKeystoneModal(false);
    setSelectedWallet(null);
  };

  const isWalletConnected = (walletType: HardwareWalletType) => {
    return connection?.type === walletType && connection.connected;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto p-6 bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-primary" />
            <span>Add XRPL Account</span>
          </DialogTitle>
          <DialogDescription>Connect a Keystone 3 Pro account for secure transaction signing</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-6">
          {availableWallets.map((walletType) => {
            const info = walletInfo[walletType];
            const Icon = info.icon;
            const isConnected = isWalletConnected(walletType);
            const isConnectingThis = isConnecting && selectedWallet === walletType;

            return (
              <div
                key={walletType}
                className="border border-border rounded-xl p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">{walletType}</h3>
                      <p className="text-xs text-muted-foreground">{info.description}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {info.connectionType}
                  </Badge>
                </div>

                <div className="mb-3">
                  <div className="flex flex-wrap gap-1">
                    {info.features.map((feature) => (
                      <span
                        key={feature}
                        className="text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={() => handleConnect(walletType)}
                  disabled={isConnectingThis || isConnected}
                  className="w-full h-9 text-sm"
                  variant={isConnected ? "secondary" : "default"}
                >
                  {isConnectingThis ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : isConnected ? (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Connected
                    </>
                  ) : (
                    `Connect a ${walletType} Account`
                  )}
                </Button>
              </div>
            );
          })}
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <div className="border border-border rounded-xl p-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                  <Eye className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="font-medium text-sm">Watch-Only Address</h3>
                  <p className="text-xs text-muted-foreground">Monitor any XRPL address</p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs">
                View Only
              </Badge>
            </div>

            <div className="mb-3">
              <div className="flex flex-wrap gap-1">
                <span className="text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground">
                  View balances
                </span>
                <span className="text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground">
                  Transaction history
                </span>
                <span className="text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground">
                  Token tracking
                </span>
              </div>
            </div>

            <Button
              onClick={() => setShowWatchOnlyModal(true)}
              className="w-full h-9 text-sm"
              variant="outline"
              data-testid="button-add-watch-only"
            >
              <Eye className="w-4 h-4 mr-2" />
              Add Watch-Only Address
            </Button>
          </div>
        </div>

      </DialogContent>
      <KeystoneAddressModal
        isOpen={showKeystoneModal}
        onClose={handleKeystoneClose}
        onConfirm={handleKeystoneConfirm}
      />
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
                  <RadioGroupItem value="mainnet" id="mainnet" data-testid="radio-network-mainnet" />
                  <Label htmlFor="mainnet" className="flex-1 cursor-pointer">
                    <div className="font-medium">Mainnet</div>
                    <div className="text-sm text-muted-foreground">Production network with real XRP</div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-4 hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="testnet" id="testnet" data-testid="radio-network-testnet" />
                  <Label htmlFor="testnet" className="flex-1 cursor-pointer">
                    <div className="font-medium">Testnet</div>
                    <div className="text-sm text-muted-foreground">Test network for development</div>
                  </Label>
                </div>
              </RadioGroup>

              <div className="flex gap-2">
                <Button onClick={handleNetworkConfirm} className="flex-1" data-testid="button-confirm-network">
                  Continue
                </Button>
                <Button onClick={() => {
                  setShowNetworkSelection(false);
                  setSelectedWallet(null);
                  setSelectedNetwork('mainnet'); // Reset to default on cancel
                }} variant="outline" className="flex-1" data-testid="button-cancel-network">
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {showKeystoneScanner && (
        <Dialog open={showKeystoneScanner} onOpenChange={setShowKeystoneScanner}>
          <DialogContent className="sm:max-w-md">
            <KeystoneAccountScanner
              onScan={handleKeystoneAccountScan}
              onClose={() => setShowKeystoneScanner(false)}
            />
          </DialogContent>
        </Dialog>
      )}
      <WatchOnlyAddressModal
        isOpen={showWatchOnlyModal}
        onClose={() => {
          setShowWatchOnlyModal(false);
          onClose();
        }}
      />
    </Dialog>
  );
}