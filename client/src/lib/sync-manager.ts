import { apiRequest } from './queryClient';

const STORAGE_KEYS_TO_SYNC = [
  'xrpl_wallets',
  'xrpl_dex_offers',
  'xrpl_counters',
  'xrpl_settings',
  'xrpl_current_wallet_id',
  'xrpl_target_network',
  'xrpl-wallet-theme',
  'notifications_enabled',
  'biometric_enabled',
  'biometric_credential_id',
  'assets_view_mode',
  'assets_selected_network',
  'assets_hide_values',
];

const SYNC_KEYS = {
  PASSPHRASE_SALT: 'xrpl_sync_salt',
  DERIVED_KEY: 'xrpl_sync_key',
  LOCAL_CHECKSUM: 'xrpl_sync_checksum',
  LAST_SYNC: 'xrpl_sync_last',
  DATA_VERSION: 'xrpl_sync_data_version',
  CONFLICT_BACKUP: 'xrpl_sync_conflict_backup',
  PENDING_PUSH_AFTER_IMPORT: 'xrpl_sync_pending_push',
  SYNC_OPT_IN: 'xrpl_sync_opt_in',
  WALLETS_CLEARED_AT: 'xrpl_sync_wallets_cleared_at',
};

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success' | 'conflict';

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt: Date | null;
  error: string | null;
}

export interface SyncStatusResponse {
  hasData: boolean;
  salt: string | null;
  checksum: string | null;
  dataVersion: number;
  deletedAt: string | null;
  lastSyncedAt: string | null;
  canSync: boolean;
}

class SyncManager {
  private derivedKey: CryptoKey | null = null;
  private salt: Uint8Array | null = null;
  private syncInProgress = false;
  private listeners: Set<(state: SyncState) => void> = new Set();
  private optInListeners: Set<(optIn: boolean) => void> = new Set();
  private state: SyncState = {
    status: 'idle',
    lastSyncedAt: null,
    error: null,
  };
  private scheduledPushTimeout: ReturnType<typeof setTimeout> | null = null;

  private updateState(updates: Partial<SyncState>) {
    this.state = { ...this.state, ...updates };
    this.listeners.forEach(listener => listener(this.state));
  }

  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): SyncState {
    return this.state;
  }

  private async deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passphraseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      passphraseKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  private async exportKey(key: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('raw', key);
    return this.arrayBufferToBase64(new Uint8Array(exported));
  }

  private async importKey(keyData: string): Promise<CryptoKey> {
    const keyBytes = this.base64ToArrayBuffer(keyData);
    return crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  private async persistKey(): Promise<void> {
    if (this.derivedKey) {
      const exportedKey = await this.exportKey(this.derivedKey);
      sessionStorage.setItem(SYNC_KEYS.DERIVED_KEY, exportedKey);
    }
  }

  async restoreSession(): Promise<boolean> {
    try {
      const storedKey = sessionStorage.getItem(SYNC_KEYS.DERIVED_KEY);
      const storedSalt = localStorage.getItem(SYNC_KEYS.PASSPHRASE_SALT);
      
      if (storedKey && storedSalt) {
        this.derivedKey = await this.importKey(storedKey);
        this.salt = this.base64ToArrayBuffer(storedSalt);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to restore sync session:', error);
      sessionStorage.removeItem(SYNC_KEYS.DERIVED_KEY);
      return false;
    }
  }

  private async encrypt(data: string, key: CryptoKey): Promise<string> {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(data)
    );

    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return this.arrayBufferToBase64(combined);
  }

  private async decrypt(encryptedData: string, key: CryptoKey): Promise<string> {
    const combined = this.base64ToArrayBuffer(encryptedData);
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    return new TextDecoder().decode(decrypted);
  }

  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private async computeChecksum(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private getSyncPayload(): string {
    const payload: Record<string, string | null> = {};
    for (const key of STORAGE_KEYS_TO_SYNC) {
      payload[key] = localStorage.getItem(key);
    }
    // Include the wallets_cleared_at timestamp if set
    const walletsClearedAt = localStorage.getItem(SYNC_KEYS.WALLETS_CLEARED_AT);
    if (walletsClearedAt) {
      payload['__wallets_cleared_at'] = walletsClearedAt;
    }
    return JSON.stringify(payload);
  }

  // Mark that wallets were intentionally cleared (for sync propagation)
  markWalletsCleared(): void {
    localStorage.setItem(SYNC_KEYS.WALLETS_CLEARED_AT, new Date().toISOString());
  }

  // Clear the wallets cleared marker (e.g., when adding new wallets)
  clearWalletsClearedMarker(): void {
    localStorage.removeItem(SYNC_KEYS.WALLETS_CLEARED_AT);
  }

  private async getLocalChecksum(): Promise<string> {
    const payload = this.getSyncPayload();
    return this.computeChecksum(payload);
  }

  private mergeWallets(localData: string | null, serverData: string | null, hasLocalChanges: boolean): string | null {
    try {
      const localWallets = localData ? JSON.parse(localData) : [];
      const serverWallets = serverData ? JSON.parse(serverData) : [];
      
      if (!Array.isArray(localWallets) || !Array.isArray(serverWallets)) {
        return serverData;
      }

      // If local is empty, just use server data (no merge needed)
      if (localWallets.length === 0) {
        return serverData;
      }

      // If server is empty, just use local data
      if (serverWallets.length === 0) {
        return localData;
      }

      // If we have local changes (like reordering), preserve local order
      // Otherwise, accept server order (changes from another device)
      const primaryWallets = hasLocalChanges ? localWallets : serverWallets;
      const secondaryWallets = hasLocalChanges ? serverWallets : localWallets;
      
      const primaryAddresses = new Set(primaryWallets.map((w: any) => w.address));
      
      // Start with primary wallets in their order
      const merged = [...primaryWallets];
      
      // Add any wallets from secondary that don't exist in primary
      for (const wallet of secondaryWallets) {
        if (wallet.address && !primaryAddresses.has(wallet.address)) {
          merged.push(wallet);
        }
      }
      
      return JSON.stringify(merged);
    } catch (error) {
      console.error('Failed to merge wallets:', error);
      return serverData;
    }
  }

  async fetchSyncStatus(): Promise<SyncStatusResponse | null> {
    try {
      const response = await apiRequest('GET', '/api/sync/status');
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
      return null;
    }
  }

  async setupPassphrase(passphrase: string): Promise<void> {
    this.salt = crypto.getRandomValues(new Uint8Array(16));
    this.derivedKey = await this.deriveKey(passphrase, this.salt);
    
    localStorage.setItem(SYNC_KEYS.PASSPHRASE_SALT, this.arrayBufferToBase64(this.salt));
    await this.persistKey();
  }

  async unlockWithPassphrase(passphrase: string): Promise<boolean> {
    // Always fetch the latest salt from the server to ensure we use the correct encryption key
    const status = await this.fetchSyncStatus();
    let saltToUse: string | null = null;
    
    if (status?.salt) {
      saltToUse = status.salt;
      const localSalt = localStorage.getItem(SYNC_KEYS.PASSPHRASE_SALT);
      
      // If server salt differs from local, update local and clear any cached key
      if (localSalt !== saltToUse) {
        localStorage.setItem(SYNC_KEYS.PASSPHRASE_SALT, saltToUse);
        sessionStorage.removeItem(SYNC_KEYS.DERIVED_KEY);
        this.derivedKey = null;
      }
    } else {
      // Fall back to local salt if server has none
      saltToUse = localStorage.getItem(SYNC_KEYS.PASSPHRASE_SALT);
    }
    
    if (!saltToUse) {
      return false;
    }

    this.salt = this.base64ToArrayBuffer(saltToUse);
    const testKey = await this.deriveKey(passphrase, this.salt);
    
    // Verify the passphrase by trying to decrypt existing data
    // Use /api/sync/verify which works even when sync is disabled
    try {
      const response = await apiRequest('GET', '/api/sync/verify');
      if (response.ok) {
        const { encryptedData } = await response.json();
        if (encryptedData) {
          // Try to decrypt - this will throw if passphrase is wrong
          await this.decrypt(encryptedData, testKey);
        }
      } else if (response.status === 403) {
        // Not a premium user - can't verify
        console.error('Not authorized to verify passphrase');
        return false;
      }
    } catch (error) {
      // Decryption failed - wrong passphrase
      console.error('Passphrase verification failed:', error);
      this.derivedKey = null;
      this.salt = null;
      return false;
    }
    
    // Passphrase verified successfully
    this.derivedKey = testKey;
    await this.persistKey();
    return true;
  }

  setSaltFromServer(salt: string): void {
    localStorage.setItem(SYNC_KEYS.PASSPHRASE_SALT, salt);
  }

  async changePassphrase(currentPassphrase: string, newPassphrase: string): Promise<{ success: boolean; error?: string }> {
    // First verify the current passphrase
    let storedSalt = localStorage.getItem(SYNC_KEYS.PASSPHRASE_SALT);
    
    if (!storedSalt) {
      const status = await this.fetchSyncStatus();
      if (status?.salt) {
        storedSalt = status.salt;
      } else {
        return { success: false, error: 'No sync data found' };
      }
    }

    const currentSalt = this.base64ToArrayBuffer(storedSalt);
    const currentKey = await this.deriveKey(currentPassphrase, currentSalt);
    
    // Verify by decrypting existing data
    // Use /api/sync/verify which works even when sync is disabled
    let decryptedPayload: string;
    try {
      const response = await apiRequest('GET', '/api/sync/verify');
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch sync data' };
      }
      
      const { encryptedData } = await response.json();
      if (!encryptedData) {
        return { success: false, error: 'No encrypted data found' };
      }
      
      decryptedPayload = await this.decrypt(encryptedData, currentKey);
    } catch (error) {
      console.error('Current passphrase verification failed:', error);
      return { success: false, error: 'Incorrect current passphrase' };
    }
    
    // Generate new salt and key
    const newSalt = crypto.getRandomValues(new Uint8Array(16));
    const newKey = await this.deriveKey(newPassphrase, newSalt);
    
    // Re-encrypt data with new passphrase
    try {
      const checksum = await this.computeChecksum(decryptedPayload);
      const encryptedData = await this.encrypt(decryptedPayload, newKey);
      const saltBase64 = this.arrayBufferToBase64(newSalt);

      const response = await apiRequest('POST', '/api/sync/push', {
        encryptedData,
        checksum,
        salt: saltBase64,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to push re-encrypted data');
      }

      // Update local state
      this.salt = newSalt;
      this.derivedKey = newKey;
      localStorage.setItem(SYNC_KEYS.PASSPHRASE_SALT, saltBase64);
      await this.persistKey();

      return { success: true };
    } catch (error) {
      console.error('Failed to re-encrypt data:', error);
      return { success: false, error: 'Failed to save new passphrase' };
    }
  }

  isUnlocked(): boolean {
    return this.derivedKey !== null;
  }

  hasStoredSalt(): boolean {
    return localStorage.getItem(SYNC_KEYS.PASSPHRASE_SALT) !== null;
  }

  async push(): Promise<{ success: boolean; error?: string; stale?: boolean }> {
    if (!this.derivedKey || !this.salt) {
      return { success: false, error: 'Sync not unlocked' };
    }

    if (this.syncInProgress) {
      return { success: false, error: 'Sync already in progress' };
    }

    this.syncInProgress = true;
    this.updateState({ status: 'syncing', error: null });

    try {
      const payload = this.getSyncPayload();
      const checksum = await this.computeChecksum(payload);
      const encryptedData = await this.encrypt(payload, this.derivedKey);
      const saltBase64 = this.arrayBufferToBase64(this.salt);
      const localVersion = this.getLocalDataVersion();

      const response = await apiRequest('POST', '/api/sync/push', {
        encryptedData,
        checksum,
        salt: saltBase64,
        dataVersion: localVersion,
      });

      const result = await response.json();

      if (!response.ok) {
        // If server rejected due to stale version, pull first to get the latest
        if (response.status === 409) {
          this.updateState({ status: 'idle', error: null });
          return { success: false, error: 'Data is stale, pull first', stale: true };
        }
        throw new Error(result.message || 'Failed to push sync data');
      }

      localStorage.setItem(SYNC_KEYS.LOCAL_CHECKSUM, checksum);
      localStorage.setItem(SYNC_KEYS.LAST_SYNC, result.syncedAt);
      if (result.dataVersion !== undefined) {
        localStorage.setItem(SYNC_KEYS.DATA_VERSION, String(result.dataVersion));
      }

      this.updateState({
        status: 'success',
        lastSyncedAt: new Date(result.syncedAt),
        error: null,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateState({ status: 'error', error: errorMessage });
      return { success: false, error: errorMessage };
    } finally {
      this.syncInProgress = false;
    }
  }

  async pull(): Promise<{ success: boolean; hasData: boolean; conflict?: boolean; merged?: boolean; deleted?: boolean; error?: string }> {
    if (!this.derivedKey) {
      return { success: false, hasData: false, error: 'Sync not unlocked' };
    }

    if (this.syncInProgress) {
      return { success: false, hasData: false, error: 'Sync already in progress' };
    }

    this.syncInProgress = true;
    this.updateState({ status: 'syncing', error: null });

    try {
      const response = await apiRequest('GET', '/api/sync/pull');

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to pull sync data');
      }

      const { encryptedData, checksum, dataVersion, deletedAt, syncedAt } = await response.json();

      // Check if server indicates data was deleted
      if (deletedAt) {
        const localVersion = parseInt(localStorage.getItem(SYNC_KEYS.DATA_VERSION) || '0', 10);
        if (dataVersion > localVersion) {
          // Server has a newer deletion - clear local data
          this.clearLocalSyncedData();
          localStorage.setItem(SYNC_KEYS.DATA_VERSION, String(dataVersion));
          this.updateState({ status: 'success', lastSyncedAt: new Date(), error: null });
          window.dispatchEvent(new CustomEvent('sync-data-deleted'));
          return { success: true, hasData: false, deleted: true };
        }
      }

      if (!encryptedData) {
        this.updateState({ status: 'idle' });
        return { success: true, hasData: false };
      }

      // Update local version if server has newer
      if (dataVersion !== undefined) {
        localStorage.setItem(SYNC_KEYS.DATA_VERSION, String(dataVersion));
      }

      const localChecksum = await this.getLocalChecksum();
      const storedChecksum = localStorage.getItem(SYNC_KEYS.LOCAL_CHECKSUM);

      if (localChecksum === checksum) {
        this.updateState({
          status: 'success',
          lastSyncedAt: syncedAt ? new Date(syncedAt) : null,
        });
        return { success: true, hasData: true };
      }

      if (storedChecksum && storedChecksum !== localChecksum && storedChecksum !== checksum) {
        const currentBackup = this.getSyncPayload();
        localStorage.setItem(
          `${SYNC_KEYS.CONFLICT_BACKUP}_${Date.now()}`,
          currentBackup
        );
        this.updateState({ status: 'conflict' });
        return { success: true, hasData: true, conflict: true };
      }

      const decryptedPayload = await this.decrypt(encryptedData, this.derivedKey);
      const verifyChecksum = await this.computeChecksum(decryptedPayload);
      
      if (verifyChecksum !== checksum) {
        throw new Error('Data integrity check failed - checksum mismatch');
      }

      const serverData = JSON.parse(decryptedPayload);
      let didMerge = false;
      
      // Determine if we have local changes that haven't been synced yet
      const hasLocalChanges = storedChecksum !== null && storedChecksum !== localChecksum;
      
      // Check for wallet deletion marker - if server has a more recent deletion marker, 
      // clear local wallets instead of merging
      const serverClearedAt = serverData['__wallets_cleared_at'] as string | null;
      const localClearedAt = localStorage.getItem(SYNC_KEYS.WALLETS_CLEARED_AT);
      const serverClearedTime = serverClearedAt ? new Date(serverClearedAt).getTime() : 0;
      const localClearedTime = localClearedAt ? new Date(localClearedAt).getTime() : 0;
      const shouldClearWallets = serverClearedTime > localClearedTime;
      
      for (const [key, value] of Object.entries(serverData)) {
        // Skip the metadata key
        if (key === '__wallets_cleared_at') {
          if (serverClearedAt && serverClearedTime > localClearedTime) {
            localStorage.setItem(SYNC_KEYS.WALLETS_CLEARED_AT, serverClearedAt);
          }
          continue;
        }
        
        if (key === 'xrpl_wallets') {
          // If server indicates wallets were intentionally cleared, accept that
          if (shouldClearWallets) {
            if (value === null || value === '[]') {
              localStorage.removeItem(key);
            } else {
              localStorage.setItem(key, value as string);
            }
          } else {
            const localValue = localStorage.getItem(key);
            const merged = this.mergeWallets(localValue, value as string | null, hasLocalChanges);
            if (merged) {
              localStorage.setItem(key, merged);
              if (merged !== value) {
                didMerge = true;
              }
            }
          }
        } else if (value !== null) {
          localStorage.setItem(key, value as string);
        } else {
          localStorage.removeItem(key);
        }
      }

      const newPayload = this.getSyncPayload();
      const newChecksum = await this.computeChecksum(newPayload);
      localStorage.setItem(SYNC_KEYS.LOCAL_CHECKSUM, newChecksum);
      localStorage.setItem(SYNC_KEYS.LAST_SYNC, syncedAt);

      this.updateState({
        status: 'success',
        lastSyncedAt: syncedAt ? new Date(syncedAt) : null,
        error: null,
      });

      // Dispatch event so React components can refresh from localStorage
      window.dispatchEvent(new CustomEvent('sync-data-updated'));

      return { success: true, hasData: true, merged: didMerge };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('Decryption failed') || errorMessage.includes('integrity')) {
        this.updateState({ status: 'error', error: 'Wrong passphrase or corrupted data' });
        return { success: false, hasData: false, error: 'Wrong passphrase or corrupted data' };
      }

      this.updateState({ status: 'error', error: errorMessage });
      return { success: false, hasData: false, error: errorMessage };
    } finally {
      this.syncInProgress = false;
    }
  }

  async hasLocalChanges(): Promise<boolean> {
    const currentChecksum = await this.getLocalChecksum();
    const storedChecksum = localStorage.getItem(SYNC_KEYS.LOCAL_CHECKSUM);
    return currentChecksum !== storedChecksum;
  }

  clearSyncData() {
    this.derivedKey = null;
    this.salt = null;
    localStorage.removeItem(SYNC_KEYS.PASSPHRASE_SALT);
    localStorage.removeItem(SYNC_KEYS.LOCAL_CHECKSUM);
    localStorage.removeItem(SYNC_KEYS.LAST_SYNC);
    localStorage.removeItem(SYNC_KEYS.DATA_VERSION);
    sessionStorage.removeItem(SYNC_KEYS.DERIVED_KEY);
    this.updateState({ status: 'idle', lastSyncedAt: null, error: null });
  }

  private clearLocalSyncedData() {
    for (const key of STORAGE_KEYS_TO_SYNC) {
      localStorage.removeItem(key);
    }
    localStorage.removeItem(SYNC_KEYS.LOCAL_CHECKSUM);
    localStorage.removeItem(SYNC_KEYS.LAST_SYNC);
  }

  async deleteAll(): Promise<{ success: boolean; error?: string }> {
    try {
      // Cancel any pending pushes to avoid race conditions
      this.cancelScheduledPush();
      
      const response = await apiRequest('POST', '/api/sync/delete-all');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete sync data');
      }
      
      // Store the new version to prevent stale pushes
      if (data.dataVersion !== undefined) {
        localStorage.setItem(SYNC_KEYS.DATA_VERSION, String(data.dataVersion));
      }
      this.clearLocalSyncedData();
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  getLocalDataVersion(): number {
    return parseInt(localStorage.getItem(SYNC_KEYS.DATA_VERSION) || '0', 10);
  }

  lock() {
    this.derivedKey = null;
    sessionStorage.removeItem(SYNC_KEYS.DERIVED_KEY);
    this.updateState({ status: 'idle' });
  }

  markPendingPushAfterImport() {
    localStorage.setItem(SYNC_KEYS.PENDING_PUSH_AFTER_IMPORT, 'true');
  }

  hasPendingPushAfterImport(): boolean {
    return localStorage.getItem(SYNC_KEYS.PENDING_PUSH_AFTER_IMPORT) === 'true';
  }

  clearPendingPushAfterImport() {
    localStorage.removeItem(SYNC_KEYS.PENDING_PUSH_AFTER_IMPORT);
  }

  schedulePush(delayMs: number = 1000) {
    if (!this.derivedKey) return;
    
    // If delay is 0, push immediately
    if (delayMs === 0) {
      this.pushWithRetry().catch(console.error);
      return;
    }
    
    if (this.scheduledPushTimeout) {
      clearTimeout(this.scheduledPushTimeout);
    }
    
    this.scheduledPushTimeout = setTimeout(async () => {
      this.scheduledPushTimeout = null;
      try {
        await this.pushWithRetry();
      } catch (error) {
        console.error('Scheduled push failed:', error);
      }
    }, delayMs);
  }

  private async pushWithRetry(): Promise<void> {
    const result = await this.push();
    if (result.stale) {
      // Server has newer data (e.g., deletion) - pull to sync
      await this.pull();
    }
  }

  cancelScheduledPush() {
    if (this.scheduledPushTimeout) {
      clearTimeout(this.scheduledPushTimeout);
      this.scheduledPushTimeout = null;
    }
  }

  hasPendingPush(): boolean {
    return this.scheduledPushTimeout !== null;
  }

  async flushPendingPush(): Promise<void> {
    if (this.scheduledPushTimeout) {
      clearTimeout(this.scheduledPushTimeout);
      this.scheduledPushTimeout = null;
      await this.pushWithRetry();
    }
  }

  // Browser-local sync opt-in preference (per device/browser)
  getSyncOptIn(): boolean {
    return localStorage.getItem(SYNC_KEYS.SYNC_OPT_IN) === 'true';
  }

  setSyncOptIn(optIn: boolean) {
    if (optIn) {
      localStorage.setItem(SYNC_KEYS.SYNC_OPT_IN, 'true');
    } else {
      localStorage.removeItem(SYNC_KEYS.SYNC_OPT_IN);
    }
    // Notify all listeners of the change
    this.optInListeners.forEach(listener => listener(optIn));
  }

  subscribeToOptIn(listener: (optIn: boolean) => void): () => void {
    this.optInListeners.add(listener);
    listener(this.getSyncOptIn());
    return () => this.optInListeners.delete(listener);
  }
}

export const syncManager = new SyncManager();
