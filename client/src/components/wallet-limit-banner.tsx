import { AlertTriangle, Crown } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/contexts/wallet-context';
import { useAuth } from '@/hooks/useAuth';

export function WalletLimitBanner() {
  const { walletOverage } = useWallet();
  const { isAuthenticated } = useAuth();

  if (!walletOverage.isOverLimit) return null;

  const handleUpgrade = () => {
    if (!isAuthenticated) {
      localStorage.setItem('dexrp_pending_checkout', 'monthly');
      window.location.href = '/login';
    } else {
      window.location.href = '/?upgrade=true';
    }
  };

  const getOverageMessage = () => {
    const parts: string[] = [];
    
    if (walletOverage.signingOverage > 0) {
      parts.push(`${walletOverage.totalSigningWallets} signing wallet${walletOverage.totalSigningWallets > 1 ? 's' : ''} (limit: ${walletOverage.allowedSigning})`);
    }
    if (walletOverage.watchOnlyOverage > 0) {
      parts.push(`${walletOverage.totalWatchOnlyWallets} watch-only wallet${walletOverage.totalWatchOnlyWallets > 1 ? 's' : ''} (limit: ${walletOverage.allowedWatchOnly})`);
    }
    
    return parts.join(' and ');
  };

  return (
    <Alert variant="destructive" className="mb-4 border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" data-testid="wallet-limit-banner">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="font-semibold">Wallet Limit Exceeded</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-3">
          You have {getOverageMessage()}. Extra wallets are in read-only mode and cannot sign transactions.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={handleUpgrade}
            className="gap-1"
            data-testid="button-upgrade-banner"
          >
            <Crown className="w-4 h-4" />
            Upgrade to Premium
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.href = '/profile'}
            className="border-yellow-500/50 text-yellow-700 hover:bg-yellow-500/10 dark:text-yellow-400"
            data-testid="button-manage-wallets"
          >
            Manage Wallets
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
