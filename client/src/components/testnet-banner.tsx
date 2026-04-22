import { AlertTriangle } from 'lucide-react';
import { useWallet } from '@/hooks/use-wallet';

export function TestnetBanner() {
  const { currentWallet } = useWallet();

  if (!currentWallet || currentWallet.network !== 'testnet') {
    return null;
  }

  return (
    <div 
      className="bg-orange-500 dark:bg-orange-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium"
      data-testid="testnet-banner"
    >
      <AlertTriangle className="w-4 h-4" />
      <span>Connected to XRPL Testnet</span>
    </div>
  );
}
