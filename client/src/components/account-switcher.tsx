import { Check, ChevronDown, Wallet, Plus, Eye, Lock } from 'lucide-react';
import { useWallet } from '@/hooks/use-wallet';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/cn';
import { truncateAddress } from '@/lib/format-address';
import { useToast } from '@/hooks/use-toast';

interface AccountSwitcherProps {
  onAddAccount?: () => void;
}

export function AccountSwitcher({ onAddAccount }: AccountSwitcherProps = {}) {
  const { currentWallet, wallets, setCurrentWallet, isWalletActive } = useWallet();
  const { toast } = useToast();

  const availableWallets = wallets.data || [];

  const handleWalletSwitch = (wallet: typeof availableWallets[0]) => {
    if (!isWalletActive(wallet)) {
      toast({
        title: "Wallet Inactive",
        description: "This wallet exceeds your plan limits. Upgrade to Premium to access all wallets.",
        variant: "destructive",
      });
      return;
    }
    setCurrentWallet(wallet);
  };

  if (availableWallets.length === 0) {
    return null;
  }

  const getNetworkBadgeColor = (network: 'mainnet' | 'testnet') => {
    return network === 'testnet' 
      ? 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400'
      : 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400';
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="flex items-center gap-2 h-auto py-2 px-3 border-border w-full max-w-full"
          data-testid="account-switcher-trigger"
        >
          {currentWallet?.walletType === 'watchOnly' ? (
            <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          ) : (
            <Wallet className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
          {currentWallet ? (
            <div className="flex flex-col items-start gap-0.5 min-w-0 flex-1 overflow-hidden">
              <div className="flex items-center gap-2 max-w-full">
                <span className="text-sm font-medium truncate">
                  {currentWallet.name || truncateAddress(currentWallet.address)}
                </span>
                <span 
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase flex-shrink-0",
                    getNetworkBadgeColor(currentWallet.network)
                  )}
                >
                  {currentWallet.network === 'testnet' ? 'Test' : 'Main'}
                </span>
              </div>
              <span className="text-xs text-muted-foreground truncate max-w-full">
                {truncateAddress(currentWallet.address)}
              </span>
            </div>
          ) : (
            <span className="text-sm font-medium">Select Account</span>
          )}
          <ChevronDown className="w-4 h-4 text-muted-foreground ml-1 flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {onAddAccount && (
          <>
            <DropdownMenuItem
              onClick={onAddAccount}
              className="flex items-center gap-2 cursor-pointer text-primary"
              data-testid="add-account-from-switcher"
            >
              <Plus className="w-4 h-4" />
              <span>Add Account</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Switch Account
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableWallets.map((wallet) => {
          const isSelected = currentWallet ? wallet.id === currentWallet.id : false;
          const walletActive = isWalletActive(wallet);
          return (
            <DropdownMenuItem
              key={wallet.id}
              onClick={() => !isSelected && handleWalletSwitch(wallet)}
              className={cn(
                "flex items-center gap-3 py-3",
                isSelected && "bg-accent",
                walletActive ? "cursor-pointer" : "cursor-not-allowed opacity-60"
              )}
              data-testid={`account-option-${wallet.id}`}
            >
              <div className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full",
                !walletActive ? 'bg-muted' : wallet.walletType === 'watchOnly' ? 'bg-amber-500/10' : 'bg-primary/10'
              )}>
                {!walletActive ? (
                  <Lock className="w-4 h-4 text-muted-foreground" />
                ) : wallet.walletType === 'watchOnly' ? (
                  <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Wallet className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-medium truncate", !walletActive && "text-muted-foreground")}>
                    {wallet.name || truncateAddress(wallet.address)}
                  </span>
                  {!walletActive && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase bg-muted text-muted-foreground">
                      Inactive
                    </span>
                  )}
                  <span 
                    className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase",
                      getNetworkBadgeColor(wallet.network)
                    )}
                  >
                    {wallet.network === 'testnet' ? 'Test' : 'Main'}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {truncateAddress(wallet.address)}
                </span>
              </div>
              {isSelected && (
                <Check className="w-4 h-4 text-primary flex-shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
