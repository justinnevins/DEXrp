import { ArrowUp, ArrowDown, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/hooks/use-wallet';
import { useAccountInfo, useServerInfo } from '@/hooks/use-xrpl';
import { useXRPPrice } from '@/hooks/use-xrp-price';
import { xrplClient } from '@/lib/xrpl-client';
import { useLocation } from 'wouter';

interface WalletBalanceProps {
  onReceiveClick: () => void;
}

export function WalletBalance({ onReceiveClick }: WalletBalanceProps) {
  const { currentWallet } = useWallet();
  const network = currentWallet?.network ?? 'mainnet';
  const { data: accountInfo, isLoading } = useAccountInfo(currentWallet?.address || null, network);
  const { data: xrpPrice, isLoading: priceLoading } = useXRPPrice(network);
  const { data: serverInfo } = useServerInfo(network);
  const [, setLocation] = useLocation();
  const isWatchOnly = currentWallet?.walletType === 'watchOnly';

  // Handle account not found on XRPL network (new/unactivated addresses)
  if (accountInfo && 'account_not_found' in accountInfo) {
    return (
      <section className="px-4 py-6 xrpl-gradient text-white">
        <div className="text-center mb-6">
          <h1 className="text-sm font-medium text-white/80 mb-1">
            {isWatchOnly ? 'Watch-Only Address' : 'Hardware Wallet Connected'}
          </h1>
          <div className="mb-2">
            <span className="text-3xl font-bold">0.000000</span>
            <span className="text-lg ml-1">XRP</span>
          </div>
          <p className="text-xs text-white/70">
            Account not activated on XRPL network
          </p>
          <p className="text-xs text-white/60 mt-1">
            Receive at least 1 XRP to activate this address
          </p>
        </div>

        {isWatchOnly && (
          <div className="mb-4 px-3 py-2 bg-amber-500/20 border border-amber-400/30 rounded-lg flex items-center gap-2">
            <Eye className="w-4 h-4 text-amber-200 shrink-0" />
            <p className="text-xs text-amber-100">
              Watch-only account – view balances only
            </p>
          </div>
        )}
      
        <div className="flex space-x-3">
          {!isWatchOnly && (
            <Button 
              variant="secondary" 
              size="sm" 
              className="flex-1 bg-white/20 hover:bg-white/30 text-white border-0"
              disabled
            >
              <ArrowUp className="w-4 h-4 mr-2" />
              Send
            </Button>
          )}
          <Button 
            variant="secondary" 
            size="sm" 
            className={`${isWatchOnly ? 'w-full' : 'flex-1'} bg-white/20 hover:bg-white/30 text-white border-0`}
            onClick={onReceiveClick}
          >
            <ArrowDown className="w-4 h-4 mr-2" />
            Receive
          </Button>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="px-4 py-6 xrpl-gradient text-white">
        <div className="text-center mb-6 animate-pulse">
          <div className="h-4 bg-white/20 rounded w-24 mx-auto mb-2"></div>
          <div className="h-8 bg-white/20 rounded w-32 mx-auto mb-1"></div>
          <div className="h-4 bg-white/20 rounded w-20 mx-auto"></div>
        </div>
      </section>
    );
  }

  const balance = (accountInfo && 'account_data' in accountInfo && accountInfo.account_data?.Balance)
    ? xrplClient.formatXRPAmount(accountInfo.account_data.Balance)
    : '0.000000';
    
  // Use dynamic XRPL reserves from server_info
  const baseReserve = serverInfo?.reserve_base_xrp ?? 1;
  const incrementReserve = serverInfo?.reserve_inc_xrp ?? 0.2;
  const ownerCount = (accountInfo && 'account_data' in accountInfo && accountInfo.account_data?.OwnerCount) || 0;
  const reservedBalance = ((ownerCount * incrementReserve) + baseReserve).toFixed(6);

  const availableBalance = Math.max(0, parseFloat(balance) - parseFloat(reservedBalance)).toFixed(6);
  const rlusdValue = xrpPrice?.price ? (parseFloat(balance) * xrpPrice.price).toFixed(4) : '0.0000';

  return (
    <section className="px-4 py-6 xrpl-gradient text-white">
      <div className="text-center mb-6">
        <p className="text-sm opacity-90 mb-2">Total Balance</p>
        <h2 className="text-3xl font-bold mb-1">{balance} XRP</h2>
        <p className="text-sm opacity-75">≈ ${rlusdValue} (RLUSD)</p>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center">
          <p className="text-xs opacity-75 mb-1">Available</p>
          <p className="font-semibold">{availableBalance} XRP</p>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center">
          <p className="text-xs opacity-75 mb-1">Reserved</p>
          <p className="font-semibold">{reservedBalance} XRP</p>
        </div>
      </div>

      {isWatchOnly && (
        <div className="mb-4 px-3 py-2 bg-amber-500/20 border border-amber-400/30 rounded-lg flex items-center gap-2">
          <Eye className="w-4 h-4 text-amber-200 shrink-0" />
          <p className="text-xs text-amber-100">
            Watch-only account – view balances only
          </p>
        </div>
      )}

      <div className="flex space-x-3">
        {!isWatchOnly && (
          <Button
            onClick={() => setLocation('/send')}
            className="flex-1 bg-white/20 backdrop-blur-sm hover:bg-white/30 border-0 rounded-xl py-3 px-4 touch-target"
            variant="ghost"
            disabled={parseFloat(availableBalance) <= 0}
          >
            <ArrowUp className="w-4 h-4 mr-2" />
            Send
          </Button>
        )}
        <Button
          onClick={onReceiveClick}
          className={`${isWatchOnly ? 'w-full' : 'flex-1'} bg-white/20 backdrop-blur-sm hover:bg-white/30 border-0 rounded-xl py-3 px-4 touch-target`}
          variant="ghost"
        >
          <ArrowDown className="w-4 h-4 mr-2" />
          Receive
        </Button>
      </div>
    </section>
  );
}
