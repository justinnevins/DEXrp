import { useSync } from '@/hooks/useSync';
import { Cloud, CloudOff, Loader2, Lock, AlertTriangle, CheckCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

interface SyncStatusIndicatorProps {
  className?: string;
  showLabel?: boolean;
}

export function SyncStatusIndicator({ className, showLabel = false }: SyncStatusIndicatorProps) {
  const { syncState, canSync, needsSetup, needsUnlock } = useSync();

  if (!canSync) {
    return null;
  }

  const getStatusInfo = () => {
    if (needsSetup) {
      return {
        icon: CloudOff,
        label: 'Sync not set up',
        color: 'text-muted-foreground',
        description: 'Set up your passphrase to enable cloud sync',
      };
    }

    if (needsUnlock) {
      return {
        icon: Lock,
        label: 'Sync locked',
        color: 'text-yellow-500',
        description: 'Enter your passphrase to unlock sync',
      };
    }

    if (syncState.status === 'syncing') {
      return {
        icon: Loader2,
        label: 'Syncing...',
        color: 'text-blue-500',
        description: 'Syncing your data to the cloud',
        animate: true,
      };
    }

    if (syncState.error) {
      return {
        icon: AlertTriangle,
        label: 'Sync error',
        color: 'text-red-500',
        description: syncState.error,
      };
    }

    if (syncState.lastSyncedAt) {
      const lastSync = new Date(syncState.lastSyncedAt);
      const timeAgo = getTimeAgo(lastSync);
      return {
        icon: CheckCircle,
        label: `Synced ${timeAgo}`,
        color: 'text-green-500',
        description: `Last synced ${lastSync.toLocaleString()}`,
      };
    }

    return {
      icon: Cloud,
      label: 'Sync ready',
      color: 'text-muted-foreground',
      description: 'Your data will sync automatically',
    };
  };

  const status = getStatusInfo();
  const Icon = status.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('flex items-center gap-1.5', className)}>
          <Icon 
            className={cn(
              'h-4 w-4', 
              status.color,
              status.animate && 'animate-spin'
            )} 
          />
          {showLabel && (
            <span className={cn('text-xs', status.color)}>{status.label}</span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{status.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
