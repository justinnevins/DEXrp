import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

interface SyncResetConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

export function SyncResetConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
}: SyncResetConfirmationDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="sync-reset-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Reset Cloud Sync
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              If you've forgotten your passphrase, you can reset cloud sync to start fresh with a new passphrase.
            </p>
            
            <Alert variant="destructive">
              <Trash2 className="h-4 w-4" />
              <AlertDescription>
                <strong>This will permanently delete your cloud backup.</strong> Your encrypted wallet data stored in the cloud will be erased and cannot be recovered.
              </AlertDescription>
            </Alert>
            
            <p className="text-sm">
              Your local wallet data will remain unchanged. After reset, you can enable cloud sync again with a new passphrase.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            data-testid="button-cancel-reset"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
            data-testid="button-confirm-reset"
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Delete Cloud Data & Reset
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
