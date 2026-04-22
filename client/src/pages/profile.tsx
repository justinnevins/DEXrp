import { Shield, LogOut, Wallet, Trash2, Edit2, Server, Sun, Moon, Eye, Plus, GripVertical, Download, Upload, FileArchive, QrCode, Camera, Cloud, AlertTriangle, Lock, Key, RefreshCw, Send, Star, Smartphone } from 'lucide-react';
import { useLocation } from 'wouter';
import { Reorder, useDragControls } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWallet } from '@/hooks/use-wallet';
import { useAccountInfo } from '@/hooks/use-xrpl';
import { useHardwareWallet } from '@/hooks/use-hardware-wallet';
import { useTheme } from '@/lib/theme-provider';
import { useState, useEffect, useRef } from 'react';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

import { useSync } from '@/hooks/useSync';
import { useSyncContext } from '@/contexts/sync-context';
import { SyncStatusIndicator } from '@/components/sync-status-indicator';
import { apiRequest } from '@/lib/queryClient';
import { browserStorage } from '@/lib/browser-storage';
import { xrplClient } from '@/lib/xrpl-client';
import { createBackup, downloadBackup, readBackupFile, getImportPreview, restoreBackup, createQRBackupData, generateQRCodeDataUrl, parseQRBackupData, restoreFromQRBackup, getQRBackupPreview, type BackupData, type ImportPreview, type ImportMode, type BackupResult, type QRBackupData } from '@/lib/backup-utils';
import { syncManager } from '@/lib/sync-manager';
import { AddressFormat } from '@/lib/format-address';
import type { Wallet as WalletType } from '@shared/schema';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { HardwareWalletConnectModal } from '@/components/modals/hardware-wallet-connect-modal';
import { FullscreenQRViewer } from '@/components/fullscreen-qr-viewer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Heart } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { initializeRevenueCat, getCustomerInfo, getOfferings, purchasePackage, restorePurchases, isPro, isNative } from '@/lib/revenuecat';

interface DraggableWalletItemProps {
  wallet: WalletType;
  index: number;
  isActive: boolean;
  isWalletInactive: boolean;
  onEdit: (wallet: WalletType) => void;
  onRemove: (walletId: number) => void;
}

function DraggableWalletItem({ wallet, index, isActive, isWalletInactive, onEdit, onRemove }: DraggableWalletItemProps) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={wallet}
      dragListener={false}
      dragControls={controls}
      className={`flex items-center justify-between p-4 rounded-lg border ${
        isActive
          ? 'border-primary bg-primary/5'
          : 'border-border bg-muted/30'
      }`}
      data-testid={`wallet-item-${wallet.id}`}
      whileDrag={{ 
        scale: 1.02, 
        boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
        zIndex: 50
      }}
    >
      <div className="flex items-center space-x-3 flex-1">
        <div className="flex items-center gap-2">
          <div
            className="p-1 cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={(e) => controls.start(e)}
          >
            <GripVertical className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium">{wallet.name || `Account ${index + 1}`}</h3>
            {isActive && (
              <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
            {isWalletInactive && (
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Inactive
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              wallet.network === 'mainnet' 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
            }`}>
              {wallet.network === 'mainnet' ? 'Mainnet' : 'Testnet'}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {AddressFormat.long(wallet.address)}
          </p>
          {wallet.walletType === 'watchOnly' ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
              <Eye className="w-3 h-3" />
              Watch-Only
            </p>
          ) : wallet.hardwareWalletType && (
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-1">
              <Shield className="w-3 h-3" />
              {wallet.hardwareWalletType}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(wallet);
          }}
          variant="ghost"
          size="sm"
          data-testid={`edit-wallet-${wallet.id}`}
        >
          <Edit2 className="w-4 h-4" />
        </Button>
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(wallet.id);
          }}
          variant="ghost"
          size="sm"
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
          data-testid={`remove-account-${wallet.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </Reorder.Item>
  );
}

export default function Profile() {
  const [, setLocation] = useLocation();
  const { currentWallet, wallets, setCurrentWallet, updateWallet, deleteWallet, reorderWallets, isWalletActive } = useWallet();
  const network = currentWallet?.network ?? 'mainnet';
  const { disconnect: disconnectHardwareWallet } = useHardwareWallet();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { user, isAuthenticated, logout, isLoggingOut } = useAuth();
  const { needsSetup, needsUnlock, isUnlocked, push, pull, syncState, syncOptIn } = useSync();
  const { showPassphraseModal, showChangePassphraseModal } = useSyncContext();
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isUpdatingSyncPreference, setIsUpdatingSyncPreference] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<WalletType | null>(null);
  const [editName, setEditName] = useState('');
  const [editNetwork, setEditNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  const [customMainnetNode, setCustomMainnetNode] = useState('');
  const [customTestnetNode, setCustomTestnetNode] = useState('');
  const [fullHistoryMainnetNode, setFullHistoryMainnetNode] = useState('');
  const [fullHistoryTestnetNode, setFullHistoryTestnetNode] = useState('');
  const [persistentConnection, setPersistentConnection] = useState(() => xrplClient.isPersistentModeEnabled());
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [walletToRemove, setWalletToRemove] = useState<number | null>(null);
  const [removeAllConfirmOpen, setRemoveAllConfirmOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [pendingBackupData, setPendingBackupData] = useState<BackupData | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [qrScanDialogOpen, setQrScanDialogOpen] = useState(false);
  const [qrFullscreen, setQrFullscreen] = useState(false);
  const [pendingQRBackupData, setPendingQRBackupData] = useState<QRBackupData | null>(null);
  const [qrImportDialogOpen, setQrImportDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanningRef = useRef(false);
  // Fetch real balance from XRPL
  const { data: accountInfo, isLoading: loadingAccountInfo } = useAccountInfo(currentWallet?.address || null, network);

  // RevenueCat — initialize on native, query subscription state
  const { data: rcCustomerInfo, refetch: refetchCustomerInfo } = useQuery({
    queryKey: ['revenuecat', 'customerInfo'],
    queryFn: async () => {
      await initializeRevenueCat(user?.id?.toString());
      return getCustomerInfo();
    },
    enabled: isNative(),
    staleTime: 60_000,
    retry: false,
  });
  const { data: rcOfferings } = useQuery({
    queryKey: ['revenuecat', 'offerings'],
    queryFn: getOfferings,
    enabled: isNative(),
    staleTime: 300_000,
    retry: false,
  });
  const proSubscribed = isPro(rcCustomerInfo ?? null);
  const monthlyPackage = rcOfferings?.current?.availablePackages?.[0] ?? null;

  const { mutate: doSubscribe, isPending: isSubscribing } = useMutation({
    mutationFn: async () => {
      if (!monthlyPackage) throw new Error('No package available');
      return purchasePackage(monthlyPackage);
    },
    onSuccess: () => { refetchCustomerInfo(); },
    onError: (err: any) => {
      if (err?.userCancelled) return;
      toast({ title: 'Purchase failed', description: err?.message ?? 'Please try again.', variant: 'destructive' });
    },
  });
  const { mutate: doRestore, isPending: isRestoring } = useMutation({
    mutationFn: restorePurchases,
    onSuccess: () => { refetchCustomerInfo(); toast({ title: 'Purchases restored' }); },
    onError: () => { toast({ title: 'Nothing to restore', variant: 'destructive' }); },
  });

  // Load custom node settings on mount and when sync updates
  useEffect(() => {
    const loadSettings = () => {
      const settings = browserStorage.getSettings();
      setCustomMainnetNode(settings.customMainnetNode || '');
      setCustomTestnetNode(settings.customTestnetNode || '');
      setFullHistoryMainnetNode(settings.fullHistoryMainnetNode || '');
      setFullHistoryTestnetNode(settings.fullHistoryTestnetNode || '');
    };
    
    loadSettings();
    
    // Re-load settings when sync updates localStorage
    window.addEventListener('sync-data-updated', loadSettings);
    return () => window.removeEventListener('sync-data-updated', loadSettings);
  }, []);




  const getDisplayBalance = () => {
    if (loadingAccountInfo) return "Loading...";
    if (!accountInfo) return "0";
    
    // Check if account is not found (not activated)
    if ('account_not_found' in accountInfo) {
      return "0 (Not activated)";
    }
    
    // Get balance from XRPL account data
    if ('account_data' in accountInfo && accountInfo.account_data?.Balance) {
      const balanceInDrops = accountInfo.account_data.Balance;
      const balanceInXRP = parseInt(balanceInDrops) / 1000000; // Convert drops to XRP
      return balanceInXRP.toFixed(6).replace(/\.?0+$/, ''); // Remove trailing zeros
    }
    
    return "0";
  };

  const handleRemoveAccount = (walletId: number) => {
    setWalletToRemove(walletId);
    setRemoveConfirmOpen(true);
  };

  const confirmRemoveAccount = async () => {
    if (walletToRemove === null) return;
    
    const allWallets = wallets.data || [];
    
    // If this was the last account, redirect to setup
    if (allWallets.length === 1) {
      await deleteWallet.mutateAsync(walletToRemove);
      localStorage.setItem('xrpl_target_network', 'mainnet');
      queryClient.clear();
      window.location.href = '/';
      return;
    }
    
    // Use the context's deleteWallet mutation which handles all cleanup
    const result = await deleteWallet.mutateAsync(walletToRemove);
    
    // If we deleted the current wallet, force a page reload to ensure clean state
    if (result.wasCurrentWallet) {
      // Update localStorage with new wallet ID before reload
      if (result.newCurrentWallet) {
        localStorage.setItem('xrpl_current_wallet_id', result.newCurrentWallet.id.toString());
      } else {
        localStorage.removeItem('xrpl_current_wallet_id');
      }
      // Clear query cache and reload to ensure clean state
      queryClient.clear();
      window.location.reload();
      return;
    }
    
    setRemoveConfirmOpen(false);
    setWalletToRemove(null);
    
    toast({
      title: "Account Removed",
      description: "The account has been removed from your list.",
    });
  };

  const handleEditWallet = (wallet: WalletType) => {
    setEditingWallet(wallet);
    setEditName(wallet.name || '');
    setEditNetwork(wallet.network);
    setEditDialogOpen(true);
  };

  const handleSaveWalletEdit = async () => {
    if (!editingWallet) return;
    
    try {
      await updateWallet.mutateAsync({
        id: editingWallet.id,
        updates: {
          name: editName || undefined,
          network: editNetwork,
        },
      });
      
      toast({
        title: "Account Updated",
        description: "Account settings have been updated successfully",
      });
      
      setEditDialogOpen(false);
      setEditingWallet(null);
    } catch (error) {
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update account",
        variant: "destructive",
      });
    }
  };

  const handleRemoveAllAccounts = () => {
    setRemoveAllConfirmOpen(true);
  };

  const confirmRemoveAllAccounts = async () => {
    try {
      // Disconnect hardware wallet first
      await disconnectHardwareWallet();
      
      // Clear server-side data
      const { apiFetch } = await import('@/lib/queryClient');
      await apiFetch('/api/wallets', { method: 'DELETE' });
      
      // Clear specific account data but preserve settings and sync config
      localStorage.removeItem('xrpl_wallets');
      localStorage.removeItem('xrpl_transactions');
      localStorage.removeItem('xrpl_trustlines');
      localStorage.removeItem('xrpl_counters');
      localStorage.removeItem('xrpl_dex_offers');
      localStorage.removeItem('xrpl_current_wallet_id');
      
      // Set network back to mainnet as default
      localStorage.setItem('xrpl_target_network', 'mainnet');
      
      // If sync is enabled, mark wallets as cleared and push to sync across devices
      const { syncManager } = await import('@/lib/sync-manager');
      if (syncManager.isUnlocked() && syncManager.getSyncOptIn()) {
        syncManager.markWalletsCleared();
        await syncManager.push();
      }
      
      // Clear all query cache
      queryClient.clear();
      
      // Invalidate all queries to force refetch
      await queryClient.invalidateQueries();
      
      // Show confirmation toast
      toast({
        title: "Accounts Cleared",
        description: "Local wallet data removed. Reloading...",
      });
      
      setRemoveAllConfirmOpen(false);
      
      // Force immediate page reload
      window.location.href = '/';
    } catch {
      // Fallback cleanup
      localStorage.removeItem('xrpl_wallets');
      localStorage.removeItem('xrpl_transactions');
      localStorage.removeItem('xrpl_trustlines');
      localStorage.removeItem('xrpl_counters');
      localStorage.removeItem('xrpl_dex_offers');
      localStorage.removeItem('xrpl_current_wallet_id');
      localStorage.setItem('xrpl_target_network', 'mainnet');
      queryClient.clear();
      window.location.href = '/';
    }
  };

  const handleSaveCustomNodes = () => {
    // Validate URLs (basic validation)
    const isValidUrl = (url: string) => {
      if (!url) return true; // Empty is okay (will use default)
      return url.startsWith('wss://') || url.startsWith('https://');
    };

    if (!isValidUrl(customMainnetNode)) {
      toast({
        title: "Invalid Mainnet Node URL",
        description: "Node URL must use secure protocols (https:// or wss://)",
        variant: "destructive"
      });
      return;
    }

    if (!isValidUrl(customTestnetNode)) {
      toast({
        title: "Invalid Testnet Node URL",
        description: "Node URL must use secure protocols (https:// or wss://)",
        variant: "destructive"
      });
      return;
    }

    if (!isValidUrl(fullHistoryMainnetNode)) {
      toast({
        title: "Invalid Full History Mainnet URL",
        description: "Node URL must use secure protocols (https:// or wss://)",
        variant: "destructive"
      });
      return;
    }

    if (!isValidUrl(fullHistoryTestnetNode)) {
      toast({
        title: "Invalid Full History Testnet URL",
        description: "Node URL must use secure protocols (https:// or wss://)",
        variant: "destructive"
      });
      return;
    }

    // Update XRPL client with custom endpoints (this saves to storage)
    xrplClient.setCustomEndpoint('mainnet', customMainnetNode || null);
    xrplClient.setCustomEndpoint('testnet', customTestnetNode || null);

    // Save full history endpoints to storage AFTER setCustomEndpoint
    // This ensures the full history fields are not overwritten
    const settings = browserStorage.getSettings();
    if (fullHistoryMainnetNode) {
      settings.fullHistoryMainnetNode = fullHistoryMainnetNode.trim();
    } else {
      delete settings.fullHistoryMainnetNode;
    }
    if (fullHistoryTestnetNode) {
      settings.fullHistoryTestnetNode = fullHistoryTestnetNode.trim();
    } else {
      delete settings.fullHistoryTestnetNode;
    }
    browserStorage.saveSettings(settings);

    // Reload full history endpoints in memory
    xrplClient.reloadFullHistoryEndpoints();

    // Push sync immediately for explicit saves (no debounce delay)
    syncManager.schedulePush(0);

    toast({
      title: "Network Settings Saved",
      description: "Custom node URLs and full history servers have been updated successfully"
    });
  };

  const handlePersistentConnectionChange = (enabled: boolean) => {
    xrplClient.setPersistentMode(enabled);
    setPersistentConnection(enabled);
    toast({
      title: enabled ? "Persistent Connection Enabled" : "Persistent Connection Disabled",
      description: enabled 
        ? "Connection will stay open with auto-reconnect" 
        : "Connection will close when not in use"
    });
  };

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const blob = await createBackup();
      const result = await downloadBackup(blob);
      toast({
        title: "Backup Created",
        description: `Saved as ${result.filename}`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to create backup",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const backupData = await readBackupFile(file);
      const preview = getImportPreview(backupData);
      setImportPreview(preview);
      setPendingBackupData(backupData);
      setImportDialogOpen(true);
    } catch (error) {
      toast({
        title: "Invalid Backup File",
        description: error instanceof Error ? error.message : "Failed to read backup file",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRestoreBackup = async (mode: ImportMode) => {
    if (!pendingBackupData) return;

    try {
      syncManager.markPendingPushAfterImport();
      
      const result = restoreBackup(pendingBackupData, mode);
      
      await queryClient.invalidateQueries({ queryKey: ['browser-wallets'] });
      
      toast({
        title: "Backup Restored",
        description: mode === 'replace' 
          ? "All data restored successfully. Reloading..."
          : `Added ${result.merged} new items, updated ${result.restored} settings. Reloading...`,
      });

      setImportDialogOpen(false);
      setImportPreview(null);
      setPendingBackupData(null);

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      syncManager.clearPendingPushAfterImport();
      toast({
        title: "Restore Failed",
        description: error instanceof Error ? error.message : "Failed to restore backup",
        variant: "destructive",
      });
    }
  };

  const handleToggleSyncPreference = (enabled: boolean) => {
    if (enabled) {
      // When enabling sync, show passphrase modal first
      // Pass true to indicate this is for enabling sync (triggers local opt-in on success)
      showPassphraseModal(true);
      return;
    }
    
    // When disabling sync - just update local preference
    syncManager.setSyncOptIn(false);
    toast({
      title: "Cloud Sync Disabled",
      description: "Remember to export backups manually from Settings.",
    });
  };
  

  const handleSetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same",
        variant: "destructive",
      });
      return;
    }

    setIsSettingPassword(true);
    try {
      const response = await apiRequest('POST', '/api/auth/set-password', { password: newPassword });
      if (response.ok) {
        toast({
          title: "Password updated",
          description: "Your password has been set successfully",
        });
        setPasswordDialogOpen(false);
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const data = await response.json();
        toast({
          title: "Error",
          description: data.message || "Failed to set password",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to set password",
        variant: "destructive",
      });
    } finally {
      setIsSettingPassword(false);
    }
  };

  const handleSignOutClick = () => {
    setSignOutDialogOpen(true);
  };

  const handleSignOutWithClearData = async (deleteCloudData: boolean = false) => {
    try {
      // If user wants to delete cloud data too, use deleteAll to set tombstone
      if (deleteCloudData) {
        const { syncManager } = await import('@/lib/sync-manager');
        if (syncManager.isUnlocked()) {
          await syncManager.deleteAll();
        } else {
          // Fallback to direct API call if sync not unlocked
          await apiRequest('DELETE', '/api/sync/data');
        }
      }
      
      // Clear all browser data
      browserStorage.clearAllData();
      // Also clear any sync-related localStorage keys
      localStorage.removeItem('sync-passphrase');
      localStorage.removeItem('xrpl_sync_salt');
      localStorage.removeItem('xrpl-wallets');
      localStorage.removeItem('current-wallet-id');
      localStorage.removeItem('xrpl-wallet-theme');
      setSignOutDialogOpen(false);
      await logout();
      // Refresh the page to ensure all data is cleared from UI
      window.location.href = '/';
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear data. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSignOutAsGuest = async () => {
    setSignOutDialogOpen(false);
    await logout();
    // Refresh the page to update UI state
    window.location.href = '/';
  };


  const handleShowQRBackup = async () => {
    try {
      const qrData = createQRBackupData();
      if (qrData.w.length === 0) {
        toast({
          title: "No Accounts",
          description: "Add accounts before creating a QR backup",
          variant: "destructive",
        });
        return;
      }
      const dataUrl = await generateQRCodeDataUrl(qrData);
      setQrCodeDataUrl(dataUrl);
      setQrDialogOpen(true);
    } catch (error) {
      toast({
        title: "QR Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate QR code",
        variant: "destructive",
      });
    }
  };

  const handleScanQR = async () => {
    setQrScanDialogOpen(true);
    scanningRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        scanQRCode();
      }
    } catch (error) {
      scanningRef.current = false;
      toast({
        title: "Camera Access Denied",
        description: "Please allow camera access to scan QR codes",
        variant: "destructive",
      });
      setQrScanDialogOpen(false);
    }
  };

  const scanQRCode = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scan = () => {
      if (!scanningRef.current) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        import('jsqr').then(({ default: jsQR }) => {
          if (!scanningRef.current) return;
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            try {
              const qrData = parseQRBackupData(code.data);
              scanningRef.current = false;
              stopCamera();
              setQrScanDialogOpen(false);
              const preview = getQRBackupPreview(qrData);
              setImportPreview(preview);
              setPendingQRBackupData(qrData);
              setQrImportDialogOpen(true);
            } catch {
              if (scanningRef.current) requestAnimationFrame(scan);
            }
          } else {
            if (scanningRef.current) requestAnimationFrame(scan);
          }
        });
      } else {
        if (scanningRef.current) requestAnimationFrame(scan);
      }
    };
    requestAnimationFrame(scan);
  };

  const stopCamera = () => {
    scanningRef.current = false;
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const handleQRRestore = async (mode: ImportMode) => {
    if (!pendingQRBackupData) return;

    try {
      syncManager.markPendingPushAfterImport();
      
      const result = restoreFromQRBackup(pendingQRBackupData, mode);
      await queryClient.invalidateQueries({ queryKey: ['browser-wallets'] });
      
      toast({
        title: "QR Backup Restored",
        description: mode === 'replace' 
          ? "All accounts restored successfully. Reloading..."
          : `Added ${result.merged} new accounts. Reloading...`,
      });

      setQrImportDialogOpen(false);
      setImportPreview(null);
      setPendingQRBackupData(null);

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      syncManager.clearPendingPushAfterImport();
      toast({
        title: "Restore Failed",
        description: error instanceof Error ? error.message : "Failed to restore from QR",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Accounts & Settings</h1>
      {/* XRPL Accounts */}
      <div className="bg-white dark:bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">XRPL Accounts</h2>
          <Button
            onClick={() => setShowAddAccountModal(true)}
            size="sm"
            variant="outline"
            data-testid="button-add-account"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {wallets.data && wallets.data.length > 0 ? (
          <Reorder.Group
            axis="y"
            values={wallets.data}
            onReorder={(newOrder) => {
              const orderedIds = newOrder.map(w => w.id);
              reorderWallets.mutateAsync(orderedIds).catch((error: Error) => {
                toast({
                  title: "Cannot reorder",
                  description: error.message,
                  variant: "destructive",
                });
              });
            }}
            className="space-y-3"
          >
            {wallets.data.map((wallet, index) => (
              <DraggableWalletItem
                key={wallet.id}
                wallet={wallet}
                index={index}
                isActive={currentWallet?.id === wallet.id}
                isWalletInactive={!isWalletActive(wallet)}
                onEdit={handleEditWallet}
                onRemove={handleRemoveAccount}
              />
            ))}
          </Reorder.Group>
        ) : (
          <p className="text-center text-muted-foreground py-4">No accounts added</p>
        )}
        {wallets.data && wallets.data.length > 1 && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            Drag the grip icon to reorder
          </p>
        )}

        {/* Backup & Restore Section */}
        <div className="border-t border-border mt-6 pt-6">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <FileArchive className="w-4 h-4 text-muted-foreground" />
            Backup & Restore
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Export your accounts, settings, and data to a backup file, or restore from a previous backup.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleExportBackup}
              variant="outline"
              size="sm"
              disabled={isExporting}
              data-testid="button-export-backup"
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Export Backup'}
            </Button>
            <Button
              onClick={handleImportClick}
              variant="outline"
              size="sm"
              disabled={isImporting}
              data-testid="button-import-backup"
            >
              <Upload className="w-4 h-4 mr-2" />
              {isImporting ? 'Reading...' : 'Import Backup'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-backup-file"
            />
          </div>
          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-3">
              QR backup contains account addresses only (no transaction history or settings).
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleShowQRBackup}
                variant="outline"
                size="sm"
                data-testid="button-qr-backup"
              >
                <QrCode className="w-4 h-4 mr-2" />
                Show QR Backup
              </Button>
              <Button
                onClick={handleScanQR}
                variant="outline"
                size="sm"
                data-testid="button-scan-qr"
              >
                <Camera className="w-4 h-4 mr-2" />
                Scan QR Backup
              </Button>
            </div>
          </div>
        </div>
      </div>
      {/* Support Development */}
      <div className="bg-white dark:bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Heart className="w-5 h-5 text-red-500" />
          Support DEXrp
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          DEXrp is free and open source — no paywalls, unlimited wallets, all data stored locally. If you find it useful, consider becoming a patron.
        </p>

        {/* DEXrp Pro card — hidden until mobile app store setup is complete */}
        {false && <div className={`rounded-xl border-2 p-4 mb-3 ${proSubscribed ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10' : 'border-border bg-muted/20'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Star className={`w-5 h-5 ${proSubscribed ? 'text-yellow-500 fill-yellow-400' : 'text-muted-foreground'}`} />
              <span className="font-semibold text-base">DEXrp Pro</span>
              {proSubscribed && (
                <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full">Active</span>
              )}
            </div>
            <span className="text-sm font-semibold text-muted-foreground">
              {monthlyPackage ? monthlyPackage.product.priceString : '$2.99'}/mo
            </span>
          </div>

          <ul className="text-sm text-muted-foreground space-y-1 mb-4 pl-1">
            <li>• Support continued open-source development</li>
            <li>• Pro supporter badge &amp; early access to new features</li>
            <li>• Priority feedback channel</li>
            <li>• Early access to new hardware wallet integrations</li>
          </ul>

          {proSubscribed ? (
            <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
              Thank you for supporting DEXrp! You're amazing.
            </p>
          ) : isNative() ? (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => doSubscribe()}
                disabled={isSubscribing || !monthlyPackage}
                size="sm"
                className="bg-yellow-500 hover:bg-yellow-600 text-white"
                data-testid="button-subscribe-pro"
              >
                <Star className="w-4 h-4 mr-2" />
                {isSubscribing ? 'Processing…' : 'Become a Patron'}
              </Button>
              <Button
                onClick={() => doRestore()}
                disabled={isRestoring}
                variant="outline"
                size="sm"
                data-testid="button-restore-purchases"
              >
                {isRestoring ? 'Restoring…' : 'Restore Purchase'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Smartphone className="w-4 h-4 shrink-0" />
              <span>Available on the iOS &amp; Android app — download DEXrp on your mobile device to subscribe.</span>
            </div>
          )}
        </div>}

        {/* XRP donation */}
        <div className="p-3 bg-muted/30 rounded-lg border border-border">
          <p className="text-xs text-muted-foreground mb-2">
            Prefer a one-time tip? Send XRP directly.
          </p>
          <Button
            onClick={() => setLocation('/send?destination=rMVRPENEPfhwht1RkQp6Emw13DeAp2PtLv')}
            variant="outline"
            size="sm"
            data-testid="button-donate-xrp"
          >
            <Send className="w-4 h-4 mr-2" />
            Donate XRP
          </Button>
        </div>
      </div>

      {/* Account & Cloud Sync */}
      <div className="bg-white dark:bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-muted-foreground" />
          Account &amp; Cloud Sync
        </h2>

        {isAuthenticated && user ? (
          <div className="space-y-4">
            <div className="p-4 bg-muted/30 rounded-lg border border-border">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Email</span>
                  <span className="text-sm font-medium" data-testid="text-user-email">{user.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Password</span>
                  <Button
                    onClick={() => setPasswordDialogOpen(true)}
                    variant="outline"
                    size="sm"
                    data-testid="button-change-password"
                  >
                    <Key className="w-3 h-3 mr-1" />
                    {user.hasPassword ? 'Change Password' : 'Set Password'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="text-sm font-medium">Cloud Sync</p>
                    <p className="text-xs text-muted-foreground">
                      {syncOptIn ? 'End-to-end encrypted sync' : 'Manual backup only'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {syncOptIn && <SyncStatusIndicator />}
                  <Switch
                    checked={syncOptIn}
                    onCheckedChange={handleToggleSyncPreference}
                    disabled={isUpdatingSyncPreference}
                    data-testid="switch-toggle-sync"
                  />
                </div>
              </div>

              {syncOptIn && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  {(needsSetup || needsUnlock) ? (
                    <Button
                      onClick={() => showPassphraseModal()}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      data-testid="button-setup-passphrase"
                    >
                      <Key className="w-3 h-3 mr-1" />
                      {needsSetup ? 'Set Up Passphrase' : 'Unlock Sync'}
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={async () => {
                          setIsManualSyncing(true);
                          try {
                            const pullResult = await pull();
                            if (pullResult.success) {
                              queryClient.invalidateQueries({ queryKey: ['browser-wallets'] });
                            }
                            const pushResult = await push();
                            if (pushResult.success) {
                              toast({ title: 'Sync complete', description: 'Your data has been synced.' });
                            } else {
                              toast({ title: 'Sync failed', description: pushResult.error || 'Please try again.', variant: 'destructive' });
                            }
                          } finally {
                            setIsManualSyncing(false);
                          }
                        }}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        disabled={isManualSyncing || syncState.status === 'syncing'}
                        data-testid="button-manual-sync"
                      >
                        <RefreshCw className={`w-3 h-3 mr-1 ${isManualSyncing ? 'animate-spin' : ''}`} />
                        {isManualSyncing ? 'Syncing...' : 'Sync Now'}
                      </Button>
                      <Button
                        onClick={showChangePassphraseModal}
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        data-testid="button-change-passphrase"
                      >
                        <Key className="w-3 h-3 mr-1" />
                        Change Passphrase
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>

            <Button
              onClick={handleSignOutClick}
              variant="ghost"
              disabled={isLoggingOut}
              data-testid="button-sign-out"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {isLoggingOut ? 'Signing out...' : 'Sign Out'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create a free account to enable encrypted cloud sync and keep your wallets backed up across devices.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => window.location.href = '/login?mode=register'}
                data-testid="button-create-account"
              >
                Create Account
              </Button>
              <Button
                onClick={() => window.location.href = '/login'}
                variant="outline"
                data-testid="button-sign-in"
              >
                Sign In
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Display & Theme Settings */}
      <div className="bg-white dark:bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Sun className="w-5 h-5 text-muted-foreground" />
          Display & Theme
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Theme Mode</p>
              <p className="text-sm text-muted-foreground">
                {theme === 'system' ? 'Auto-detect from system' : theme === 'dark' ? 'Dark mode' : 'Light mode'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('light')}
                className="flex items-center gap-1"
                data-testid="theme-light"
              >
                <Sun className="w-4 h-4" />
                Light
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('dark')}
                className="flex items-center gap-1"
                data-testid="theme-dark"
              >
                <Moon className="w-4 h-4" />
                Dark
              </Button>
              <Button
                variant={theme === 'system' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('system')}
                className="text-xs"
                data-testid="theme-system"
              >
                Auto
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="bg-white dark:bg-card border border-border rounded-xl mb-6">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="network-settings" className="border-0">
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Advanced Settings</h2>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6 pt-0">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-4">Configure custom XRPL WebSocket node. Supports custom ports. Leave empty to use defaults.</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="mainnet-node">
                    Mainnet Node URL
                    <span className="text-xs text-muted-foreground ml-2">(Optional)</span>
                  </Label>
                  <Input
                    id="mainnet-node"
                    type="text"
                    placeholder="wss://xrplcluster.com"
                    value={customMainnetNode}
                    onChange={(e) => setCustomMainnetNode(e.target.value)}
                    data-testid="input-mainnet-node"
                  />
                  <p className="text-xs text-muted-foreground">
                    Example: wss://xrplcluster.com
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Default: {xrplClient.getEndpoint('mainnet')}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="testnet-node">
                    Testnet Node URL
                    <span className="text-xs text-muted-foreground ml-2">(Optional)</span>
                  </Label>
                  <Input
                    id="testnet-node"
                    type="text"
                    placeholder="wss://s.altnet.rippletest.net:51233"
                    value={customTestnetNode}
                    onChange={(e) => setCustomTestnetNode(e.target.value)}
                    data-testid="input-testnet-node"
                  />
                  <p className="text-xs text-muted-foreground">
                    Example: wss://s.altnet.rippletest.net:51233
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Default: {xrplClient.getEndpoint('testnet')}
                  </p>
                </div>

                <div className="border-t border-border pt-4 mt-4">
                  <h3 className="text-sm font-medium mb-3">Full History Servers (Optional)</h3>
                  <p className="text-xs text-muted-foreground mb-4">Configure Full History Servers. Leave blank to use default full history servers. NOTE: only used when transaction history request range exceeds available data from custom server above. </p>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="full-history-mainnet-node">
                        Mainnet Full History Server
                        <span className="text-xs text-muted-foreground ml-2">(Optional)</span>
                      </Label>
                      <Input
                        id="full-history-mainnet-node"
                        type="text"
                        placeholder="wss://s1.ripple.com:51234"
                        value={fullHistoryMainnetNode}
                        onChange={(e) => setFullHistoryMainnetNode(e.target.value)}
                        data-testid="input-full-history-mainnet-node"
                      />
                      <p className="text-xs text-muted-foreground">
                        Default: wss://s1.ripple.com:51234
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="full-history-testnet-node">
                        Testnet Full History Server
                        <span className="text-xs text-muted-foreground ml-2">(Optional)</span>
                      </Label>
                      <Input
                        id="full-history-testnet-node"
                        type="text"
                        placeholder="wss://s.altnet.rippletest.net:51234"
                        value={fullHistoryTestnetNode}
                        onChange={(e) => setFullHistoryTestnetNode(e.target.value)}
                        data-testid="input-full-history-testnet-node"
                      />
                      <p className="text-xs text-muted-foreground">
                        Default: wss://s.altnet.rippletest.net:51234
                      </p>
                    </div>
                  </div>
                </div>
                
                <Button
                  onClick={handleSaveCustomNodes}
                  className="w-full"
                  data-testid="button-save-nodes"
                >
                  Save Network Settings
                </Button>

                <div className="border-t border-border pt-4 mt-4">
                  <h3 className="text-sm font-medium mb-3">Connection Settings</h3>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="persistent-connection">Persistent WebSocket</Label>
                      <p className="text-xs text-muted-foreground">
                        Keep connection open with auto-reconnect
                      </p>
                    </div>
                    <Switch
                      id="persistent-connection"
                      checked={persistentConnection}
                      onCheckedChange={handlePersistentConnectionChange}
                      data-testid="switch-persistent-connection"
                    />
                  </div>
                  <Alert className="mt-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                      Enabling persistent connections may increase battery drain on mobile devices. Only recommended when actively trading.
                    </AlertDescription>
                  </Alert>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
        <Button
          onClick={handleRemoveAllAccounts}
          variant="outline"
          className="w-full border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 touch-target"
          data-testid="remove-all-accounts"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Clear Local Accounts
        </Button>
      </div>
      <HardwareWalletConnectModal
        isOpen={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
      />
      
      {/* Edit Wallet Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>
              Change the account name or switch between mainnet and testnet networks.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="wallet-name">Account Name</Label>
              <Input
                id="wallet-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="My Account"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="wallet-network">Network</Label>
              <Select value={editNetwork} onValueChange={(value: 'mainnet' | 'testnet') => setEditNetwork(value)}>
                <SelectTrigger id="wallet-network">
                  <SelectValue placeholder="Select network" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mainnet">Mainnet</SelectItem>
                  <SelectItem value="testnet">Testnet</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Changing the network will reload the account data for the selected network.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveWalletEdit} disabled={updateWallet.isPending}>
              {updateWallet.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Account Confirmation Dialog */}
      <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this account? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmRemoveAccount}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-remove-account"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Local Accounts Confirmation Dialog */}
      <AlertDialog open={removeAllConfirmOpen} onOpenChange={setRemoveAllConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Local Accounts</AlertDialogTitle>
            <AlertDialogDescription>
              {syncOptIn && isUnlocked
                ? "This will remove all XRPL accounts and wallet data from this device and from the cloud sync. Your account will remain signed in but all wallet data will be permanently deleted. This cannot be undone."
                : "This will remove all XRPL accounts and wallet data from this device. Your account will remain signed in. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-3 text-sm">
            <span className="text-amber-600 dark:text-amber-400 mt-0.5">⚠</span>
            <div className="flex-1">
              <p className="text-amber-800 dark:text-amber-300 font-medium mb-1">Back up your data first</p>
              <p className="text-amber-700 dark:text-amber-400 mb-2">Save a backup file before clearing so you can restore your accounts later.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportBackup}
                disabled={isExporting}
                className="border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              >
                {isExporting ? 'Exporting…' : 'Export Backup'}
              </Button>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmRemoveAllAccounts}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-remove-all-accounts"
            >
              Clear Local Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sign Out Confirmation Dialog */}
      <Dialog open={signOutDialogOpen} onOpenChange={setSignOutDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="w-5 h-5" />
              Sign Out
            </DialogTitle>
            <DialogDescription>
              What would you like to do with your data?
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            <Button
              onClick={handleSignOutAsGuest}
              variant="outline"
              className="w-full justify-start"
              disabled={isLoggingOut}
              data-testid="signout-continue-guest"
            >
              <Eye className="w-4 h-4 mr-2" />
              <div className="flex flex-col items-start">
                <span>Continue as Guest</span>
                <span className="text-xs text-muted-foreground">Keep all data in browser</span>
              </div>
            </Button>
            
            <Button
              onClick={() => handleSignOutWithClearData(false)}
              variant="outline"
              className="w-full justify-start"
              disabled={isLoggingOut}
              data-testid="signout-clear-browser"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              <div className="flex flex-col items-start">
                <span>Clear Browser Only</span>
                <span className="text-xs text-muted-foreground">Cloud data restores on next sign-in</span>
              </div>
            </Button>
            
            <Button
              onClick={() => handleSignOutWithClearData(true)}
              variant="outline"
              className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
              disabled={isLoggingOut}
              data-testid="signout-delete-all"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              <div className="flex flex-col items-start">
                <span>Delete Everything</span>
                <span className="text-xs text-muted-foreground">Browser + cloud data permanently</span>
              </div>
            </Button>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setSignOutDialogOpen(false)}
              data-testid="signout-cancel"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Backup Confirmation Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileArchive className="w-5 h-5" />
              Restore Backup
            </DialogTitle>
            <DialogDescription>
              Review the backup contents before restoring.
            </DialogDescription>
          </DialogHeader>
          
          {importPreview && (
            <div className="space-y-4 py-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Created:</span>
                  <span>{new Date(importPreview.manifest.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Accounts:</span>
                  <span>{importPreview.walletCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Includes:</span>
                  <span className="text-right">
                    {[
                      importPreview.hasOffers && 'DEX Offers',
                      importPreview.hasSettings && 'Settings',
                    ].filter(Boolean).join(', ') || 'Basic data'}
                  </span>
                </div>
              </div>


              <div className="space-y-3">
                <p className="text-sm font-medium">Choose restore mode:</p>
                <div className="grid gap-3">
                  <Button
                    onClick={() => handleRestoreBackup('replace')}
                    variant="default"
                    className="w-full justify-start"
                    data-testid="button-restore-replace"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    <div className="text-left">
                      <div className="font-medium">Replace All</div>
                      <div className="text-xs opacity-80">Clear existing data and restore from backup</div>
                    </div>
                  </Button>
                  <Button
                    onClick={() => handleRestoreBackup('merge')}
                    variant="outline"
                    className="w-full justify-start"
                    data-testid="button-restore-merge"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    <div className="text-left">
                      <div className="font-medium">Merge</div>
                      <div className="text-xs opacity-80">Add new accounts, keep existing data</div>
                    </div>
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Display Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              QR Backup
            </DialogTitle>
            <DialogDescription>
              Scan this QR code on another device to restore your accounts. Tap the code for fullscreen.
            </DialogDescription>
          </DialogHeader>
          
          {qrCodeDataUrl && (
            <div 
              className="flex justify-center py-4 cursor-pointer"
              onClick={() => setQrFullscreen(true)}
              data-testid="qr-backup-image-container"
            >
              <img 
                src={qrCodeDataUrl} 
                alt="Backup QR Code" 
                className="w-72 h-72 max-w-full"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setQrDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fullscreen QR Viewer */}
      {qrFullscreen && qrCodeDataUrl && (
        <FullscreenQRViewer onClose={() => setQrFullscreen(false)}>
          <img src={qrCodeDataUrl} alt="Backup QR Code" />
        </FullscreenQRViewer>
      )}

      {/* QR Scanner Dialog */}
      <Dialog open={qrScanDialogOpen} onOpenChange={(open) => {
        if (!open) stopCamera();
        setQrScanDialogOpen(open);
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              Scan QR Backup
            </DialogTitle>
            <DialogDescription>
              Point your camera at the QR backup code.
            </DialogDescription>
          </DialogHeader>
          
          <div className="relative aspect-square bg-black rounded-lg overflow-hidden">
            <video 
              ref={videoRef} 
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 border-2 border-white/30 rounded-lg pointer-events-none">
              <div className="absolute inset-8 border-2 border-primary rounded-lg" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => {
              stopCamera();
              setQrScanDialogOpen(false);
            }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Import Confirmation Dialog */}
      <Dialog open={qrImportDialogOpen} onOpenChange={setQrImportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Restore from QR
            </DialogTitle>
            <DialogDescription>
              Review the scanned backup before restoring.
            </DialogDescription>
          </DialogHeader>
          
          {importPreview && (
            <div className="space-y-4 py-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Created:</span>
                  <span>{importPreview.manifest.createdAt}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Accounts:</span>
                  <span>{importPreview.walletCount}</span>
                </div>
              </div>


              <div className="space-y-3">
                <p className="text-sm font-medium">Choose restore mode:</p>
                <div className="grid gap-3">
                  <Button
                    onClick={() => handleQRRestore('replace')}
                    variant="default"
                    className="w-full justify-start"
                    data-testid="button-qr-restore-replace"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    <div className="text-left">
                      <div className="font-medium">Replace All</div>
                      <div className="text-xs opacity-80">Clear existing accounts and restore from QR</div>
                    </div>
                  </Button>
                  <Button
                    onClick={() => handleQRRestore('merge')}
                    variant="outline"
                    className="w-full justify-start"
                    data-testid="button-qr-restore-merge"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    <div className="text-left">
                      <div className="font-medium">Merge</div>
                      <div className="text-xs opacity-80">Add new accounts, keep existing ones</div>
                    </div>
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setQrImportDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Change Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={(open) => {
        setPasswordDialogOpen(open);
        if (!open) {
          setNewPassword('');
          setConfirmPassword('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {user?.hasPassword ? 'Change Password' : 'Set Password'}
            </DialogTitle>
            <DialogDescription>
              {user?.hasPassword 
                ? 'Enter a new password to change your current password.'
                : 'Set a password to enable email/password login for your account.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                data-testid="input-confirm-password"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPasswordDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSetPassword}
              disabled={isSettingPassword || !newPassword || !confirmPassword}
              data-testid="button-save-password"
            >
              {isSettingPassword ? 'Saving...' : 'Save Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
