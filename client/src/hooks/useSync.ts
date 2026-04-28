import { useState, useEffect, useCallback, useRef } from 'react';
import { syncManager, type SyncState, type SyncStatusResponse } from '@/lib/sync-manager';
import { useAuth } from './useAuth';

export function useSync() {
  const { isAuthenticated } = useAuth();
  const [syncState, setSyncState] = useState<SyncState>(syncManager.getState());
  const [isUnlocked, setIsUnlocked] = useState(syncManager.isUnlocked());
  const [hasStoredSalt, setHasStoredSalt] = useState(syncManager.hasStoredSalt());
  const [serverSyncStatus, setServerSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  // Browser-local sync opt-in (per device/browser)
  const [syncOptIn, setSyncOptInState] = useState(syncManager.getSyncOptIn());
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const initStarted = useRef(false);

  useEffect(() => {
    const unsubscribe = syncManager.subscribe((state) => {
      setSyncState(state);
    });
    return unsubscribe;
  }, []);

  // Subscribe to syncOptIn changes so all components update reactively
  useEffect(() => {
    const unsubscribe = syncManager.subscribeToOptIn((optIn) => {
      setSyncOptInState(optIn);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      initStarted.current = false;
      setServerSyncStatus(null);
      setIsLoadingStatus(true);
      return;
    }
    
    if (initStarted.current) return;
    initStarted.current = true;

    const initialize = async () => {
      setIsLoadingStatus(true);
      
      const restored = await syncManager.restoreSession();
      if (restored) {
        setIsUnlocked(true);
      }
      
      const status = await syncManager.fetchSyncStatus();
      setServerSyncStatus(status);
      
      if (status?.salt) {
        // Always update local salt to match server (ensures all devices use same salt)
        const localSalt = localStorage.getItem('xrpl_sync_salt');
        if (localSalt !== status.salt) {
          syncManager.setSaltFromServer(status.salt);
          // If salt changed, clear cached key to force re-unlock
          if (localSalt) {
            sessionStorage.removeItem('xrpl_sync_key');
            setIsUnlocked(false);
          }
        }
        setHasStoredSalt(true);
      }
      
      setIsLoadingStatus(false);
    };
    
    initialize();
  }, [isAuthenticated]);

  useEffect(() => {
    setHasStoredSalt(syncManager.hasStoredSalt());
  }, [isAuthenticated]);

  const canSync = isAuthenticated && syncOptIn;

  const setupPassphrase = useCallback(async (passphrase: string) => {
    await syncManager.setupPassphrase(passphrase);
    setIsUnlocked(true);
    setHasStoredSalt(true);
  }, []);

  const unlockWithPassphrase = useCallback(async (passphrase: string, rememberMe: boolean = false): Promise<boolean> => {
    const success = await syncManager.unlockWithPassphrase(passphrase, rememberMe);
    setIsUnlocked(success);
    return success;
  }, []);

  const push = useCallback(async () => {
    if (!canSync || !isUnlocked) return { success: false, error: 'Sync not available' };
    return syncManager.push();
  }, [canSync, isUnlocked]);

  const pull = useCallback(async () => {
    if (!canSync || !isUnlocked) return { success: false, hasData: false, error: 'Sync not available' };
    return syncManager.pull();
  }, [canSync, isUnlocked]);

  const debouncedPush = useCallback(() => {
    if (!canSync || !isUnlocked) return;
    
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    debounceTimer.current = setTimeout(() => {
      syncManager.push();
    }, 3000);
  }, [canSync, isUnlocked]);

  const clearSyncData = useCallback(() => {
    syncManager.clearSyncData();
    setIsUnlocked(false);
    setHasStoredSalt(false);
  }, []);

  const lock = useCallback(() => {
    syncManager.lock();
    setIsUnlocked(false);
  }, []);

  // Toggle browser-local sync opt-in
  const setSyncOptIn = useCallback((optIn: boolean) => {
    syncManager.setSyncOptIn(optIn);
    setSyncOptInState(optIn);
  }, []);

  const hasServerData = serverSyncStatus?.hasData === true;
  const hasServerSalt = !!serverSyncStatus?.salt;
  
  const needsSetup = canSync && !hasStoredSalt && !hasServerSalt && !isLoadingStatus;
  const needsUnlock = canSync && (hasStoredSalt || hasServerSalt) && !isUnlocked && !isLoadingStatus;
  
  // Prompt to unlock if user has server data but hasn't opted in yet (encourage them to sync)
  const shouldPromptForSync = isAuthenticated && !syncOptIn && hasServerData && !isUnlocked && !isLoadingStatus;

  return {
    syncState,
    isUnlocked,
    hasStoredSalt,
    hasServerData,
    hasServerSalt,
    isLoadingStatus,
    canSync,
    syncOptIn,
    setSyncOptIn,
    setupPassphrase,
    unlockWithPassphrase,
    push,
    pull,
    debouncedPush,
    clearSyncData,
    lock,
    needsSetup,
    needsUnlock,
    shouldPromptForSync,
  };
}
