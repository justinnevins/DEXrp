import { useState } from 'react';
import { Shield, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/hooks/use-wallet';
import { useHardwareWallet } from '@/hooks/use-hardware-wallet';
import { HardwareWalletConnectModal } from '@/components/modals/hardware-wallet-connect-modal';

export function HardwareWalletStatus() {
  const [showConnectModal, setShowConnectModal] = useState(false);
  const { currentWallet } = useWallet();
  const { connection } = useHardwareWallet();
  
  const hardwareWalletType = currentWallet?.hardwareWalletType || connection?.type;
  const isConnected = connection?.connected || false;

  if (!isConnected) {
    return (
      <>
        <section className="px-4 py-4 border-b border-border">
          <div className="flex items-center justify-between bg-muted/50 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                <Shield className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">Hardware Wallet</p>
                <p className="text-sm text-muted-foreground">Not Connected</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setShowConnectModal(true)}
              className="h-8 px-3"
            >
              <Plus className="w-4 h-4 mr-1" />
              Connect
            </Button>
          </div>
        </section>
        
        <HardwareWalletConnectModal
          isOpen={showConnectModal}
          onClose={() => setShowConnectModal(false)}
        />
      </>
    );
  }

  return (
    <>
      <section className="px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center">
              <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-medium text-green-800 dark:text-green-200">Hardware Wallet</p>
              <p className="text-sm text-green-600 dark:text-green-400">
                {isConnected ? `${hardwareWalletType} Connected` : 'Not Connected'}
              </p>
            </div>
          </div>
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
        </div>
      </section>
      
      <HardwareWalletConnectModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
      />
    </>
  );
}
