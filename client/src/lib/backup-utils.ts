import JSZip from 'jszip';
import QRCode from 'qrcode';

export interface BackupResult {
  success: boolean;
  filename: string;
  location?: string;
}

const BACKUP_VERSION = '1.0';

const STORAGE_KEYS_TO_BACKUP = [
  'xrpl_wallets',
  'xrpl_counters',
  'xrpl_settings',
  'xrpl_dex_offers',
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

export interface BackupManifest {
  version: string;
  createdAt: string;
  appName: string;
  walletCount: number;
  keys: string[];
}

export interface BackupData {
  manifest: BackupManifest;
  data: Record<string, any>;
}

export interface ImportPreview {
  manifest: BackupManifest;
  walletCount: number;
  signingWalletCount: number;
  watchOnlyWalletCount: number;
  hasOffers: boolean;
  hasSettings: boolean;
}

export async function createBackup(): Promise<Blob> {
  const data: Record<string, string> = {};
  const keysIncluded: string[] = [];
  
  // Store raw localStorage strings to preserve exact values
  for (const key of STORAGE_KEYS_TO_BACKUP) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      data[key] = value;
      keysIncluded.push(key);
    }
  }
  
  // Parse wallets count for manifest
  let wallets: any[] = [];
  try {
    wallets = JSON.parse(data['xrpl_wallets'] || '[]');
  } catch {
    wallets = [];
  }
  
  const manifest: BackupManifest = {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    appName: 'DEXrp',
    walletCount: Array.isArray(wallets) ? wallets.length : 0,
    keys: keysIncluded,
  };
  
  const backupData: BackupData = { manifest, data };
  
  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(backupData, null, 2));
  
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return blob;
}

export async function downloadBackup(blob: Blob): Promise<BackupResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `dexrp-backup-${timestamp}.zip`;
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  return { success: true, filename, location: 'Downloads folder' };
}

export async function readBackupFile(file: File): Promise<BackupData> {
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);
  
  const backupFile = contents.file('backup.json');
  if (!backupFile) {
    throw new Error('Invalid backup file: missing backup.json');
  }
  
  const jsonContent = await backupFile.async('string');
  const backupData: BackupData = JSON.parse(jsonContent);
  
  if (!backupData.manifest || !backupData.data) {
    throw new Error('Invalid backup file: missing manifest or data');
  }
  
  if (!backupData.manifest.version) {
    throw new Error('Invalid backup file: missing version');
  }
  
  return backupData;
}

export function getImportPreview(backupData: BackupData): ImportPreview {
  const { manifest, data } = backupData;
  
  // Parse JSON strings for preview purposes
  const parseJsonSafe = (str: string | undefined): any[] => {
    if (!str) return [];
    try {
      const parsed = JSON.parse(str);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  
  const wallets = parseJsonSafe(data['xrpl_wallets']);
  const offers = parseJsonSafe(data['xrpl_dex_offers']);
  const settings = data['xrpl_settings'];
  
  const signingWallets = wallets.filter((w: any) => w.walletType !== 'watchOnly');
  const watchOnlyWallets = wallets.filter((w: any) => w.walletType === 'watchOnly');
  
  return {
    manifest,
    walletCount: wallets.length,
    signingWalletCount: signingWallets.length,
    watchOnlyWalletCount: watchOnlyWallets.length,
    hasOffers: offers.length > 0,
    hasSettings: settings !== undefined,
  };
}

export type ImportMode = 'replace' | 'merge';

export function restoreBackup(backupData: BackupData, mode: ImportMode): { restored: number; merged: number } {
  const { data } = backupData;
  let restored = 0;
  let merged = 0;
  
  if (mode === 'replace') {
    for (const key of STORAGE_KEYS_TO_BACKUP) {
      localStorage.removeItem(key);
    }
  }
  
  for (const [key, value] of Object.entries(data)) {
    if (!STORAGE_KEYS_TO_BACKUP.includes(key)) {
      continue;
    }
    
    // Normalize value to string for backward compatibility with older backups
    // that stored parsed JSON values instead of raw strings
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    if (mode === 'merge' && isArrayKey(key)) {
      // For arrays, parse both existing and incoming, merge, and stringify
      const existing = getStoredArray(key);
      let incoming: any[] = [];
      try {
        incoming = JSON.parse(stringValue);
        if (!Array.isArray(incoming)) incoming = [];
      } catch {
        incoming = [];
      }
      const mergedArray = mergeArrays(key, existing, incoming);
      localStorage.setItem(key, JSON.stringify(mergedArray));
      const newItems = mergedArray.length - existing.length;
      merged += newItems > 0 ? newItems : 0;
    } else {
      // For non-array values, only update if value is different
      const existingValue = localStorage.getItem(key);
      if (existingValue !== stringValue) {
        localStorage.setItem(key, stringValue);
        restored++;
      }
    }
  }
  
  return { restored, merged };
}

function isArrayKey(key: string): boolean {
  return ['xrpl_wallets', 'xrpl_dex_offers'].includes(key);
}

function getStoredArray(key: string): any[] {
  const stored = localStorage.getItem(key);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeArrays(key: string, existing: any[], incoming: any[]): any[] {
  const idField = getIdField(key);
  
  if (!idField) {
    return [...existing, ...incoming];
  }
  
  const existingIds = new Set(existing.map(item => item[idField]));
  const newItems = incoming.filter(item => !existingIds.has(item[idField]));
  
  return [...existing, ...newItems];
}

function getIdField(key: string): string | null {
  switch (key) {
    case 'xrpl_wallets':
      return 'address';
    case 'xrpl_transactions':
      return 'hash';
    case 'xrpl_trustlines':
      return 'id';
    case 'xrpl_dex_offers':
      return 'offerSequence';
    default:
      return null;
  }
}

export interface QRBackupWallet {
  a: string;
  n?: string;
  t: 'm' | 't';
  w: 'k' | 'w' | 'h';
  h?: string;
  p?: string; // publicKey - critical for Keystone signing
}

export interface QRBackupData {
  v: string;
  d: string;
  w: QRBackupWallet[];
}

export function createQRBackupData(): QRBackupData {
  const walletsStr = localStorage.getItem('xrpl_wallets');
  let wallets: any[] = [];
  try {
    wallets = JSON.parse(walletsStr || '[]');
  } catch {
    wallets = [];
  }

  const compactWallets: QRBackupWallet[] = wallets.map((w: any) => {
    // Determine wallet type: 'k' for Keystone, 'w' for watchOnly, 'h' for other hardware
    let walletTypeCode: 'k' | 'w' | 'h' = 'h';
    if (w.hardwareWalletType?.toLowerCase().includes('keystone')) {
      walletTypeCode = 'k';
    } else if (w.walletType === 'watchOnly') {
      walletTypeCode = 'w';
    }

    const compact: QRBackupWallet = {
      a: w.address,
      t: w.network === 'mainnet' ? 'm' : 't',
      w: walletTypeCode,
    };
    if (w.name) compact.n = w.name;
    if (w.hardwareWalletType) compact.h = w.hardwareWalletType;
    // Always include publicKey if it exists (critical for Keystone signing)
    if (w.publicKey) compact.p = w.publicKey;
    return compact;
  });

  return {
    v: '1',
    d: new Date().toISOString().slice(0, 10),
    w: compactWallets,
  };
}

export async function generateQRCodeDataUrl(data: QRBackupData): Promise<string> {
  const jsonStr = JSON.stringify(data);
  return await QRCode.toDataURL(jsonStr, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300,
  });
}

export function parseQRBackupData(jsonStr: string): QRBackupData {
  const data = JSON.parse(jsonStr);
  if (!data.v || !data.w || !Array.isArray(data.w)) {
    throw new Error('Invalid QR backup format');
  }
  return data as QRBackupData;
}

export function restoreFromQRBackup(qrData: QRBackupData, mode: ImportMode): { restored: number; merged: number } {
  const expandedWallets = qrData.w.map((w, index) => {
    // Determine walletType: 'watchOnly' for watch-only, 'full' for all others
    const walletType = w.w === 'w' ? 'watchOnly' : 'full';
    // For Keystone wallets (w === 'k'), use the stored hardwareWalletType or default to 'Keystone 3 Pro'
    const hardwareWalletType = w.w === 'k' ? (w.h || 'Keystone 3 Pro') : (w.h || null);
    
    return {
      id: Date.now() + index,
      address: w.a,
      name: w.n || `Account ${index + 1}`,
      network: w.t === 'm' ? 'mainnet' : 'testnet',
      walletType,
      hardwareWalletType,
      publicKey: w.p || null, // Critical for Keystone signing
    };
  });

  const backupData: BackupData = {
    manifest: {
      version: '1.0',
      createdAt: qrData.d,
      appName: 'DEXrp',
      walletCount: expandedWallets.length,
      keys: ['xrpl_wallets'],
    },
    data: {
      xrpl_wallets: JSON.stringify(expandedWallets),
    },
  };

  return restoreBackup(backupData, mode);
}

export function getQRBackupPreview(qrData: QRBackupData): ImportPreview {
  const signingWallets = qrData.w.filter(w => w.w !== 'w');
  const watchOnlyWallets = qrData.w.filter(w => w.w === 'w');
  
  return {
    manifest: {
      version: qrData.v,
      createdAt: qrData.d,
      appName: 'DEXrp',
      walletCount: qrData.w.length,
      keys: ['xrpl_wallets'],
    },
    walletCount: qrData.w.length,
    signingWalletCount: signingWallets.length,
    watchOnlyWalletCount: watchOnlyWallets.length,
    hasOffers: false,
    hasSettings: false,
  };
}
