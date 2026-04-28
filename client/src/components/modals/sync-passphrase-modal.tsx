import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, Eye, EyeOff, AlertTriangle, Cloud, Shield, RefreshCw } from 'lucide-react';
import { syncManager } from '@/lib/sync-manager';

interface SyncPassphraseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'setup' | 'unlock' | 'change';
  onSetup: (passphrase: string) => Promise<void>;
  onUnlock: (passphrase: string, rememberMe: boolean) => Promise<boolean>;
  onChangePassphrase?: (currentPassphrase: string, newPassphrase: string) => Promise<{ success: boolean; error?: string }>;
  onForgotPassphrase?: () => void;
  onSuccess?: () => void;
  onSkip?: () => void;
}

export function SyncPassphraseModal({
  open,
  onOpenChange,
  mode,
  onSetup,
  onUnlock,
  onChangePassphrase,
  onForgotPassphrase,
  onSuccess,
  onSkip,
}: SyncPassphraseModalProps) {
  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(() => syncManager.isRemembered());

  useEffect(() => {
    if (!open) {
      setCurrentPassphrase('');
      setPassphrase('');
      setConfirmPassphrase('');
      setError(null);
      setShowPassphrase(false);
    } else {
      // Reflect current remembered state each time modal opens
      setRememberMe(syncManager.isRemembered());
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'setup') {
      if (passphrase.length < 8) {
        setError('Passphrase must be at least 8 characters');
        return;
      }
      if (passphrase !== confirmPassphrase) {
        setError('Passphrases do not match');
        return;
      }

      setIsLoading(true);
      try {
        await onSetup(passphrase);
        setPassphrase('');
        setConfirmPassphrase('');
        // Call onSuccess before closing modal to preserve pending flags
        onSuccess?.();
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to setup passphrase');
      } finally {
        setIsLoading(false);
      }
    } else if (mode === 'unlock') {
      setIsLoading(true);
      try {
        const success = await onUnlock(passphrase, rememberMe);
        if (success) {
          setPassphrase('');
          // Call onSuccess before closing modal to preserve pending flags
          onSuccess?.();
          onOpenChange(false);
        } else {
          setError('Incorrect passphrase');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to unlock');
      } finally {
        setIsLoading(false);
      }
    } else if (mode === 'change') {
      if (!currentPassphrase) {
        setError('Please enter your current passphrase');
        return;
      }
      if (passphrase.length < 8) {
        setError('New passphrase must be at least 8 characters');
        return;
      }
      if (passphrase !== confirmPassphrase) {
        setError('New passphrases do not match');
        return;
      }
      if (currentPassphrase === passphrase) {
        setError('New passphrase must be different from current');
        return;
      }

      setIsLoading(true);
      try {
        const result = await onChangePassphrase?.(currentPassphrase, passphrase);
        if (result?.success) {
          setCurrentPassphrase('');
          setPassphrase('');
          setConfirmPassphrase('');
          onOpenChange(false);
        } else {
          setError(result?.error || 'Failed to change passphrase');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to change passphrase');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleSkip = () => {
    setPassphrase('');
    setConfirmPassphrase('');
    setCurrentPassphrase('');
    setError(null);
    onSkip?.();
    onOpenChange(false);
  };

  const getTitle = () => {
    switch (mode) {
      case 'setup':
        return (
          <>
            <Shield className="w-5 h-5 text-primary" />
            Set Up Cloud Sync
          </>
        );
      case 'unlock':
        return (
          <>
            <Lock className="w-5 h-5 text-primary" />
            Unlock Cloud Sync
          </>
        );
      case 'change':
        return (
          <>
            <RefreshCw className="w-5 h-5 text-primary" />
            Change Passphrase
          </>
        );
    }
  };

  const getDescription = () => {
    switch (mode) {
      case 'setup':
        return 'Create a passphrase to encrypt your wallet data before syncing. This passphrase never leaves your device.';
      case 'unlock':
        return 'Enter your passphrase to decrypt and sync your wallet data.';
      case 'change':
        return 'Enter your current passphrase and choose a new one. Your data will be re-encrypted with the new passphrase.';
    }
  };

  const getSubmitLabel = () => {
    switch (mode) {
      case 'setup':
        return 'Enable Cloud Sync';
      case 'unlock':
        return 'Unlock & Sync';
      case 'change':
        return 'Change Passphrase';
    }
  };

  const isSubmitDisabled = () => {
    if (isLoading) return true;
    if (mode === 'unlock') return !passphrase;
    if (mode === 'setup') return !passphrase || !confirmPassphrase;
    if (mode === 'change') return !currentPassphrase || !passphrase || !confirmPassphrase;
    return false;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="sync-passphrase-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getTitle()}
          </DialogTitle>
          <DialogDescription>
            {getDescription()}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'setup' && (
            <Alert className="bg-blue-500/10 border-blue-500/30">
              <Cloud className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-sm">
                Your data is encrypted on your device before upload. We never see your passphrase or unencrypted data.
              </AlertDescription>
            </Alert>
          )}
          
          {mode === 'unlock' && (
            <Alert className="bg-green-500/10 border-green-500/30">
              <Cloud className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-sm">
                Your encrypted wallet data was found in the cloud. Enter the passphrase you created when you first set up sync to restore your wallets.
              </AlertDescription>
            </Alert>
          )}

          {mode === 'unlock' && onForgotPassphrase && (
            <div className="text-center">
              <button
                type="button"
                onClick={onForgotPassphrase}
                className="text-sm text-muted-foreground hover:text-primary underline"
                data-testid="button-forgot-passphrase"
              >
                Forgot passphrase? Reset cloud sync
              </button>
            </div>
          )}

          {mode === 'change' && (
            <div className="space-y-2">
              <Label htmlFor="current-passphrase">Current Passphrase</Label>
              <div className="relative">
                <Input
                  id="current-passphrase"
                  type={showPassphrase ? 'text' : 'password'}
                  value={currentPassphrase}
                  onChange={(e) => setCurrentPassphrase(e.target.value)}
                  placeholder="Enter current passphrase"
                  disabled={isLoading}
                  className="pr-10"
                  autoComplete="off"
                  data-testid="input-current-passphrase"
                />
                <button
                  type="button"
                  onClick={() => setShowPassphrase(!showPassphrase)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="passphrase">
              {mode === 'setup' ? 'Create Passphrase' : mode === 'change' ? 'New Passphrase' : 'Passphrase'}
            </Label>
            <div className="relative">
              <Input
                id="passphrase"
                type={showPassphrase ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder={mode === 'unlock' ? 'Enter your passphrase' : 'At least 8 characters'}
                disabled={isLoading}
                className="pr-10"
                autoComplete="off"
                data-testid="input-passphrase"
              />
              {mode === 'unlock' && (
                <button
                  type="button"
                  onClick={() => setShowPassphrase(!showPassphrase)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          {mode === 'unlock' && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(val) => setRememberMe(val === true)}
                disabled={isLoading}
                data-testid="checkbox-remember-passphrase"
              />
              <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer select-none">
                Remember on this device
              </Label>
            </div>
          )}

          {(mode === 'setup' || mode === 'change') && (
            <div className="space-y-2">
              <Label htmlFor="confirm-passphrase">
                {mode === 'change' ? 'Confirm New Passphrase' : 'Confirm Passphrase'}
              </Label>
              <Input
                id="confirm-passphrase"
                type={showPassphrase ? 'text' : 'password'}
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                placeholder="Re-enter your passphrase"
                disabled={isLoading}
                autoComplete="off"
                data-testid="input-confirm-passphrase"
              />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {(mode === 'setup' || mode === 'change') && (
            <Alert variant="destructive" className="bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {mode === 'setup' 
                  ? "Remember this passphrase! It cannot be recovered. If lost, you'll need to use manual backup/restore."
                  : "Make sure to remember your new passphrase! It cannot be recovered."}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="flex gap-2 sm:gap-0">
            {onSkip && mode !== 'change' && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleSkip}
                disabled={isLoading}
                data-testid="button-skip-sync"
              >
                {mode === 'setup' ? 'Skip for now' : 'Skip'}
              </Button>
            )}
            {mode === 'change' && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
                data-testid="button-cancel-change"
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={isSubmitDisabled()}
              data-testid="button-submit-passphrase"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {getSubmitLabel()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
