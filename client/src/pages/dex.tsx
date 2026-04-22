import { useState, useMemo } from 'react';
import { Plus, X, Eye, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useWallet } from '@/hooks/use-wallet';
import { useAccountOffers, useAccountInfo, useAccountLines } from '@/hooks/use-xrpl';
import { useToast } from '@/hooks/use-toast';
import { xrplClient } from '@/lib/xrpl-client';
import { KeystoneTransactionSigner } from '@/components/keystone-transaction-signer';

import { useDexOrder } from '@/hooks/use-dex-order';
import { useDexTransaction } from '@/hooks/use-dex-transaction';
import { TradingAccountCard } from '@/components/dex/trading-account-card';
import { MarketPriceCard } from '@/components/dex/market-price-card';
import { CreateOrderForm } from '@/components/dex/create-order-form';
import { ActiveOffersList } from '@/components/dex/active-offers-list';

export default function DEX() {
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { currentWallet, isWalletActive } = useWallet();
  const network = currentWallet?.network ?? 'mainnet';
  const walletIsActive = currentWallet ? isWalletActive(currentWallet) : false;
  const { data: accountOffers, isLoading: offersLoading } = useAccountOffers(currentWallet?.address || null, network);
  const { data: accountInfo } = useAccountInfo(currentWallet?.address || null, network);
  const { data: accountLines } = useAccountLines(currentWallet?.address || null, network);
  const { toast } = useToast();

  const orderHook = useDexOrder({
    network,
    accountInfo,
    accountLines,
    accountOffers,
  });

  const transactionHook = useDexTransaction({
    currentWallet,
    network,
    accountInfo,
    toast,
  });

  const availableCurrencies = useMemo(() => {
    const currencies: Array<{ label: string; value: string; issuer?: string; key: string }> = [
      { label: 'XRP', value: 'XRP', key: 'XRP' }
    ];

    if (Array.isArray(accountLines?.lines)) {
      accountLines.lines
        .filter((line: any) => parseFloat(line.limit || '0') > 0)
        .forEach((line: any) => {
          const decodedCurrency = xrplClient.decodeCurrency(line.currency);
          currencies.push({
            label: `${decodedCurrency} (${line.account.substring(0, 8)}...)`,
            value: `${line.currency}:${line.account}`,
            issuer: line.account,
            key: `${line.currency}-${line.account}`
          });
        });
    }

    return currencies;
  }, [accountLines]);

  const handleFormSubmit = (e: React.FormEvent) => {
    transactionHook.handleCreateOffer(e, {
      orderSide: orderHook.orderSide,
      orderType: orderHook.orderType,
      baseAsset: orderHook.baseAsset,
      quoteAsset: orderHook.quoteAsset,
      amount: orderHook.amount,
      price: orderHook.price,
      marketPrice: orderHook.marketPrice,
      slippageTolerance: orderHook.slippageTolerance,
      expirationDays: orderHook.expirationDays,
      calculateFlags: orderHook.calculateFlags,
    });
  };

  const handleSigningSuccess = (txHash: string) => {
    transactionHook.handleSigningSuccess(txHash, () => {
      orderHook.resetForm();
      setShowCreateForm(false);
    });
  };

  if (!currentWallet) {
    return (
      <div className="px-4 py-6">
        <h1 className="text-2xl font-bold mb-4">DEX Trading</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center">
              Please set up an account to trade on the DEX
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isWatchOnly = currentWallet.walletType === 'watchOnly';
  const isInactive = !walletIsActive;

  if (isWatchOnly || isInactive) {
    return (
      <div className="px-4 py-6">
        <h1 className="text-2xl font-bold mb-4">DEX Trading</h1>
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
            <Eye className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold mb-2">{isWatchOnly ? 'Watch-Only Account' : 'Wallet Inactive'}</h2>
          <p className="text-muted-foreground mb-6 max-w-sm">
            {isWatchOnly 
              ? 'This is a watch-only account. To trade on the DEX, switch to a Keystone 3 Pro wallet address or connect a new one.'
              : 'This wallet exceeds your plan limits. Upgrade to Premium or switch to an active wallet to trade.'}
          </p>
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg max-w-sm">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300 text-left">
              {isWatchOnly
                ? 'Watch-only accounts can view open orders, but cannot create or cancel offers. Connect a Keystone 3 Pro to enable trading.'
                : 'Inactive wallets can view open orders, but cannot create or cancel offers. Upgrade to Premium to unlock all wallets.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">DEX Trading</h1>
          <p className="text-sm text-muted-foreground">Create and manage orders</p>
        </div>
        <Button
          onClick={() => setShowCreateForm(!showCreateForm)}
          size="sm"
          data-testid="button-create-offer"
        >
          {showCreateForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      <TradingAccountCard
        address={currentWallet.address}
        xrpBalance={orderHook.getXRPBalance()}
      />

      <MarketPriceCard
        baseAsset={orderHook.baseAsset}
        quoteAsset={orderHook.quoteAsset}
        marketPrice={orderHook.marketPrice}
        isLoadingPrice={orderHook.isLoadingPrice}
        lastUpdate={orderHook.lastUpdate}
        priceError={orderHook.priceError}
        onRefresh={orderHook.fetchMarketPrice}
      />

      {showCreateForm && (
        <CreateOrderForm
          orderSide={orderHook.orderSide}
          setOrderSide={orderHook.setOrderSide}
          orderType={orderHook.orderType}
          setOrderType={orderHook.setOrderType}
          baseAsset={orderHook.baseAsset}
          setBaseAsset={orderHook.setBaseAsset}
          quoteAsset={orderHook.quoteAsset}
          setQuoteAsset={orderHook.setQuoteAsset}
          amount={orderHook.amount}
          price={orderHook.price}
          total={orderHook.total}
          expirationDays={orderHook.expirationDays}
          setExpirationDays={orderHook.setExpirationDays}
          showAdvanced={orderHook.showAdvanced}
          setShowAdvanced={orderHook.setShowAdvanced}
          tfPassive={orderHook.tfPassive}
          setTfPassive={orderHook.setTfPassive}
          tfFillOrKill={orderHook.tfFillOrKill}
          setTfFillOrKill={orderHook.setTfFillOrKill}
          marketPrice={orderHook.marketPrice}
          slippageTolerance={orderHook.slippageTolerance}
          setSlippageTolerance={orderHook.setSlippageTolerance}
          executionEstimate={orderHook.executionEstimate}
          isLoadingDepth={orderHook.isLoadingDepth}
          handleAmountChange={orderHook.handleAmountChange}
          handlePriceChange={orderHook.handlePriceChange}
          handleMaxAmount={orderHook.handleMaxAmount}
          swapPair={orderHook.swapPair}
          onSubmit={handleFormSubmit}
          availableCurrencies={availableCurrencies}
          accountLines={accountLines}
          getXRPBalance={orderHook.getXRPBalance}
        />
      )}

      <div>
        <h2 className="text-lg font-semibold mb-4">Your Active Offers</h2>
        <ActiveOffersList
          offers={accountOffers?.offers}
          isLoading={offersLoading}
          walletAddress={currentWallet.address}
          network={network}
          onCancelOffer={transactionHook.handleCancelOffer}
        />
      </div>

      {transactionHook.showSigner && transactionHook.transactionUR && transactionHook.unsignedTransaction && currentWallet && (
        <KeystoneTransactionSigner
          isOpen={transactionHook.showSigner}
          transactionUR={transactionHook.transactionUR}
          unsignedTransaction={transactionHook.unsignedTransaction}
          transactionType={transactionHook.transactionType as any}
          walletId={currentWallet.id}
          onSuccess={handleSigningSuccess}
          onClose={transactionHook.handleSignerClose}
          network={network}
        />
      )}
    </div>
  );
}
