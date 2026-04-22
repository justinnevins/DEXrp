import { useState } from 'react';
import { WalletBalance } from '@/components/wallet/wallet-balance';
import { RecentTransactions } from '@/components/wallet/recent-transactions';
import { EmptyWalletState } from '@/components/wallet/empty-wallet-state';
import { ReceiveModal } from '@/components/modals/receive-modal';
import { useLocation } from 'wouter';
import { useWallet } from '@/hooks/use-wallet';
import { useAuth } from '@/hooks/useAuth';
import Landing from './LandingPage';

export default function Home() {
  const [, setLocation] = useLocation();
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const { wallets } = useWallet();
  const { user, isLoading: authLoading } = useAuth();

  // Wait for auth check to complete
  if (authLoading) {
    return null;
  }

  // Wallet data from localStorage is available immediately (synchronous)
  const hasWallets = (wallets.data?.length ?? 0) > 0;

  // Guest users (not logged in):
  // - With wallets: show dashboard (they already chose to continue as guest)
  // - Without wallets: show landing page (forces sign up, sign in, or continue as guest)
  if (!user) {
    if (!hasWallets) {
      return <Landing />;
    }
    // Guest with wallets - fall through to dashboard
  } else {
    // Signed-in users without wallets see the "No Accounts" screen
    if (!hasWallets) {
      return <EmptyWalletState />;
    }
  }

  // Users with wallets (guest or signed-in) see the dashboard
  return (
    <div>
      <WalletBalance
        onReceiveClick={() => setReceiveModalOpen(true)}
      />
      
      <RecentTransactions
        onViewAllClick={() => setLocation('/transactions')}
      />

      <ReceiveModal
        isOpen={receiveModalOpen}
        onClose={() => setReceiveModalOpen(false)}
      />
    </div>
  );
}
