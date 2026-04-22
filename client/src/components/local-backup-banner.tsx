import { useState, useEffect } from 'react';
import { HardDrive, X, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useSync } from '@/hooks/useSync';
import { Link } from 'wouter';

const FREE_DISMISSED_KEY = 'dexrp.local-backup-banner.dismissed.v1';
const SYNC_DISMISSED_KEY = 'dexrp.premium-sync-banner.dismissed.v1';

export function LocalBackupBanner() {
  const { isAuthenticated } = useAuth();
  const { syncOptIn } = useSync();
  const [isFreeDismissed, setIsFreeDismissed] = useState(true);
  const [isSyncDismissed, setIsSyncDismissed] = useState(true);

  useEffect(() => {
    setIsFreeDismissed(localStorage.getItem(FREE_DISMISSED_KEY) === 'true');
    setIsSyncDismissed(localStorage.getItem(SYNC_DISMISSED_KEY) === 'true');
  }, []);

  const handleDismissFree = () => {
    localStorage.setItem(FREE_DISMISSED_KEY, 'true');
    setIsFreeDismissed(true);
  };

  const handleDismissSync = () => {
    localStorage.setItem(SYNC_DISMISSED_KEY, 'true');
    setIsSyncDismissed(true);
  };

  // Show cloud sync nudge for logged-in users who haven't enabled sync
  if (isAuthenticated && !syncOptIn && !isSyncDismissed) {
    return (
      <div
        className="mb-4 rounded-lg border border-purple-500/50 bg-purple-500/10 p-4 text-purple-700 dark:text-purple-400"
        role="alert"
        data-testid="premium-sync-banner"
      >
        <div className="flex items-start gap-3">
          <Cloud className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm mb-2">
              You have cloud sync available but it&apos;s not enabled. Enable it in{' '}
              <Link href="/profile" className="underline font-medium hover:text-purple-800 dark:hover:text-purple-300">
                Settings
              </Link>
              {' '}to keep your wallets backed up across devices.
            </p>
            <Link href="/profile">
              <Button
                size="sm"
                className="gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                data-testid="button-enable-sync-banner"
              >
                <Cloud className="w-3 h-3" />
                Enable Sync
              </Button>
            </Link>
          </div>
          <button
            type="button"
            onClick={handleDismissSync}
            className="flex-shrink-0 h-6 w-6 rounded flex items-center justify-center text-purple-700 hover:text-purple-900 hover:bg-purple-500/20 dark:text-purple-400 dark:hover:text-purple-200 transition-colors"
            data-testid="button-dismiss-sync-banner"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // Show local backup reminder for users without cloud sync
  if (!isAuthenticated && !isFreeDismissed) {
    return (
      <div
        className="mb-4 rounded-lg border border-blue-500/50 bg-blue-500/10 p-4 text-blue-700 dark:text-blue-400"
        role="alert"
        data-testid="local-backup-banner"
      >
        <div className="flex items-start gap-3">
          <HardDrive className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm">
              Your wallet data is stored locally on this device. Back it up regularly from{' '}
              <Link href="/profile" className="underline font-medium hover:text-blue-800 dark:hover:text-blue-300">
                Settings
              </Link>.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismissFree}
            className="flex-shrink-0 h-6 w-6 rounded flex items-center justify-center text-blue-700 hover:text-blue-900 hover:bg-blue-500/20 dark:text-blue-400 dark:hover:text-blue-200 transition-colors"
            data-testid="button-dismiss-backup-banner"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
