import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSync } from '@/hooks/useSync';
import { useQueryClient } from '@tanstack/react-query';
import { SyncPassphraseModal } from '@/components/modals/sync-passphrase-modal';
import { SyncResetConfirmationDialog } from '@/components/modals/sync-reset-confirmation-dialog';
import { syncManager } from '@/lib/sync-manager';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type ModalMode = 'setup' | 'unlock' | 'change';

interface SyncContextType {
  showPassphraseModal: (forEnableSync?: boolean) => void;
  showChangePassphraseModal: () => void;
  hidePassphraseModal: () => void;
  isModalOpen: boolean;
  pullAndRestore: () => Promise<void>;
  schedulePush: () => void;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { needsSetup, needsUnlock, isUnlocked, canSync, pull, push, setupPassphrase, unlockWithPassphrase, isLoadingStatus, hasServerData, hasStoredSalt, hasServerSalt, shouldPromptForSync, setSyncOptIn } = useSync();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('setup');
  const [hasPromptedThisSession, setHasPromptedThisSession] = useState(false);
  const [hasRestoredData, setHasRestoredData] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [forceSetupMode, setForceSetupMode] = useState(false);
  const pendingEnableSyncRef = useRef(false);

  const showPassphraseModal = useCallback((forEnableSync: boolean = false) => {
    pendingEnableSyncRef.current = forEnableSync;
    if (needsSetup) {
      setModalMode('setup');
    } else if (needsUnlock || hasServerData || hasStoredSalt || hasServerSalt) {
      // If there's existing data (server or local), need to unlock with existing passphrase
      setModalMode('unlock');
    } else {
      setModalMode('setup');
    }
    setIsModalOpen(true);
  }, [needsSetup, needsUnlock, hasServerData, hasStoredSalt, hasServerSalt]);

  const showChangePassphraseModal = useCallback(() => {
    setModalMode('change');
    setIsModalOpen(true);
  }, []);

  const hidePassphraseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const pullAndRestore = useCallback(async () => {
    if (!isUnlocked || !canSync) return;
    
    try {
      if (syncManager.hasPendingPushAfterImport()) {
        syncManager.clearPendingPushAfterImport();
        const pushResult = await push();
        if (pushResult.success) {
          setHasRestoredData(true);
        }
        return;
      }

      const result = await pull();
      if (result.success && result.hasData) {
        queryClient.invalidateQueries({ queryKey: ['browser-wallets'] });
        setHasRestoredData(true);
        
        if (result.merged) {
          await push();
        }
      }
    } catch (error) {
      console.error('Failed to pull sync data:', error);
    }
  }, [isUnlocked, canSync, pull, push, queryClient]);

  useEffect(() => {
    if (!isAuthenticated) {
      setHasPromptedThisSession(false);
      setHasRestoredData(false);
      return;
    }

    if (isLoadingStatus) return;
    if (hasPromptedThisSession) return;

    // Prompt for passphrase if:
    // 1. User has sync enabled and needs setup or unlock
    // 2. User has server data but hasn't opted in yet (encourage them to sync)
    if (needsSetup || needsUnlock) {
      setHasPromptedThisSession(true);
      setModalMode(needsSetup ? 'setup' : 'unlock');
      setIsModalOpen(true);
    } else if (shouldPromptForSync) {
      // User has cloud data but sync is disabled - prompt them to unlock and enable
      setHasPromptedThisSession(true);
      setModalMode('unlock');
      // Mark that we want to enable sync after successful unlock
      pendingEnableSyncRef.current = true;
      setIsModalOpen(true);
    }
  }, [isAuthenticated, needsSetup, needsUnlock, shouldPromptForSync, hasPromptedThisSession, isLoadingStatus]);

  // Sync on initial load when unlocked
  useEffect(() => {
    if (isUnlocked && canSync && !hasRestoredData) {
      pullAndRestore();
    }
  }, [isUnlocked, canSync, hasRestoredData, pullAndRestore]);

  // Sync on page load/refresh - runs once when sync becomes available
  const hasSyncedOnLoadRef = useRef(false);
  useEffect(() => {
    if (!isUnlocked || !canSync || hasSyncedOnLoadRef.current) return;
    
    hasSyncedOnLoadRef.current = true;
    
    // Delay slightly to ensure session is fully restored
    const timeoutId = setTimeout(async () => {
      try {
        if (syncManager.hasPendingPush()) {
          await syncManager.flushPendingPush();
        }
        const result = await pull();
        if (result.success) {
          queryClient.invalidateQueries({ queryKey: ['browser-wallets'] });
          setHasRestoredData(true);
          if (result.merged) {
            await push();
          }
        }
      } catch (error) {
        console.error('Page load sync failed:', error);
      }
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [isUnlocked, canSync, pull, push, queryClient]);

  useEffect(() => {
    if (!isUnlocked || !canSync) return;

    const SYNC_INTERVAL_MS = 5 * 60 * 1000;
    
    const performAutoSync = async () => {
      try {
        // If there's a pending push after import, push first instead of pulling
        if (syncManager.hasPendingPushAfterImport()) {
          syncManager.clearPendingPushAfterImport();
          await push();
          return;
        }
        
        // Flush any pending local changes before pulling to avoid overwriting
        if (syncManager.hasPendingPush()) {
          await syncManager.flushPendingPush();
        }
        
        const pullResult = await pull();
        if (pullResult.success) {
          queryClient.invalidateQueries({ queryKey: ['browser-wallets'] });
          if (pullResult.merged) {
            await push();
          }
        }
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    };

    const intervalId = setInterval(performAutoSync, SYNC_INTERVAL_MS);

    let focusTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (focusTimeoutId) clearTimeout(focusTimeoutId);
        focusTimeoutId = setTimeout(performAutoSync, 2000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const handleWindowFocus = () => {
      if (focusTimeoutId) clearTimeout(focusTimeoutId);
      focusTimeoutId = setTimeout(performAutoSync, 2000);
    };
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      clearInterval(intervalId);
      if (focusTimeoutId) clearTimeout(focusTimeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isUnlocked, canSync, pull, push, queryClient]);

  const handleSkip = useCallback(() => {
    pendingEnableSyncRef.current = false;
    setIsModalOpen(false);
  }, []);

  const schedulePush = useCallback(() => {
    syncManager.schedulePush();
  }, []);

  const handleChangePassphrase = useCallback(async (currentPassphrase: string, newPassphrase: string) => {
    return syncManager.changePassphrase(currentPassphrase, newPassphrase);
  }, []);

  const handleSuccess = useCallback(() => {
    if (pendingEnableSyncRef.current) {
      pendingEnableSyncRef.current = false;
      // Enable sync locally (browser-local setting)
      setSyncOptIn(true);
      toast({
        title: "Cloud Sync Enabled",
        description: "Your wallet data will now sync on this device.",
      });
    }
  }, [setSyncOptIn, toast]);

  const handleForgotPassphrase = useCallback(() => {
    setIsModalOpen(false);
    setShowResetDialog(true);
  }, []);

  const handleResetConfirm = useCallback(async () => {
    try {
      // apiRequest throws on error, so if we get past this line, the request succeeded
      await apiRequest('POST', '/api/sync/reset');
      
      syncManager.clearSyncData();
      queryClient.invalidateQueries({ queryKey: ['/api/sync/status'] });
      setShowResetDialog(false);
      setHasPromptedThisSession(false);
      setHasRestoredData(false);
      toast({
        title: "Cloud Sync Reset",
        description: "Set up a new passphrase to enable cloud sync.",
      });
      // Automatically open setup modal so user can create new passphrase
      // Force setup mode to override any stale needsUnlock state
      pendingEnableSyncRef.current = true;
      setForceSetupMode(true);
      setModalMode('setup');
      setIsModalOpen(true);
    } catch (error) {
      console.error('Failed to reset cloud sync:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reset cloud sync",
        variant: "destructive",
      });
    }
  }, [queryClient, toast]);

  const getActualMode = (): 'setup' | 'unlock' | 'change' => {
    if (modalMode === 'change') return 'change';
    // Force setup mode after reset, overriding stale needsUnlock state
    if (forceSetupMode) return 'setup';
    if (needsSetup) return 'setup';
    // If there's existing data (server or local), need to unlock with existing passphrase
    if (needsUnlock || hasServerData || hasStoredSalt || hasServerSalt) return 'unlock';
    return 'setup';
  };

  return (
    <SyncContext.Provider value={{ showPassphraseModal, showChangePassphraseModal, hidePassphraseModal, isModalOpen, pullAndRestore, schedulePush }}>
      {children}
      <SyncPassphraseModal
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          // Reset flags when modal closes without completing
          if (!open) {
            pendingEnableSyncRef.current = false;
            setForceSetupMode(false);
          }
        }}
        mode={getActualMode()}
        onSetup={setupPassphrase}
        onUnlock={unlockWithPassphrase}
        onChangePassphrase={handleChangePassphrase}
        onForgotPassphrase={handleForgotPassphrase}
        onSuccess={handleSuccess}
        onSkip={handleSkip}
      />
      <SyncResetConfirmationDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        onConfirm={handleResetConfirm}
      />
    </SyncContext.Provider>
  );
}

export function useSyncContext() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSyncContext must be used within a SyncProvider');
  }
  return context;
}
