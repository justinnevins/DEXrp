import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { xrplClient } from '@/lib/xrpl-client';
import { getTokenBalance as getTokenBalanceFromLines } from '@/lib/order-calculator';
import { parseAsset } from '@/lib/dex-asset-utils';
import type { ExecutionEstimate } from '@/lib/order-book-depth';

interface CurrencyOption {
  label: string;
  value: string;
  issuer?: string;
  key: string;
}

interface CreateOrderFormProps {
  orderSide: 'buy' | 'sell';
  setOrderSide: (side: 'buy' | 'sell') => void;
  orderType: 'limit' | 'market';
  setOrderType: (type: 'limit' | 'market') => void;
  baseAsset: string;
  setBaseAsset: (asset: string) => void;
  quoteAsset: string;
  setQuoteAsset: (asset: string) => void;
  amount: string;
  price: string;
  total: string;
  expirationDays: string;
  setExpirationDays: (days: string) => void;
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;
  tfPassive: boolean;
  setTfPassive: (passive: boolean) => void;
  tfFillOrKill: boolean;
  setTfFillOrKill: (fok: boolean) => void;
  marketPrice: number | null;
  slippageTolerance: number;
  setSlippageTolerance: (tolerance: number) => void;
  executionEstimate: ExecutionEstimate | null;
  isLoadingDepth: boolean;
  handleAmountChange: (value: string) => void;
  handlePriceChange: (value: string) => void;
  handleMaxAmount: () => void;
  swapPair: () => void;
  onSubmit: (e: React.FormEvent) => void;
  availableCurrencies: CurrencyOption[];
  accountLines: any;
  getXRPBalance: () => string;
}

export function CreateOrderForm({
  orderSide,
  setOrderSide,
  orderType,
  setOrderType,
  baseAsset,
  setBaseAsset,
  quoteAsset,
  setQuoteAsset,
  amount,
  price,
  total,
  expirationDays,
  setExpirationDays,
  showAdvanced,
  setShowAdvanced,
  tfPassive,
  setTfPassive,
  tfFillOrKill,
  setTfFillOrKill,
  marketPrice,
  slippageTolerance,
  setSlippageTolerance,
  executionEstimate,
  isLoadingDepth,
  handleAmountChange,
  handlePriceChange,
  handleMaxAmount,
  swapPair,
  onSubmit,
  availableCurrencies,
  accountLines,
  getXRPBalance,
}: CreateOrderFormProps) {
  const baseInfo = parseAsset(baseAsset);
  const quoteInfo = parseAsset(quoteAsset);

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Create Order</CardTitle>
        <CardDescription>Buy or sell on the XRPL DEX</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Buy/Sell Tabs */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={orderSide === 'buy' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setOrderSide('buy')}
              data-testid="button-buy-tab"
            >
              Buy
            </Button>
            <Button
              type="button"
              variant={orderSide === 'sell' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setOrderSide('sell')}
              data-testid="button-sell-tab"
            >
              Sell
            </Button>
          </div>

          {/* Market/Limit Toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={orderType === 'market' ? 'default' : 'outline'}
              className="flex-1"
              size="sm"
              onClick={() => {
                setOrderType('market');
                if (marketPrice) handlePriceChange(marketPrice.toString());
              }}
              data-testid="button-market-type"
            >
              Market
            </Button>
            <Button
              type="button"
              variant={orderType === 'limit' ? 'default' : 'outline'}
              className="flex-1"
              size="sm"
              onClick={() => setOrderType('limit')}
              data-testid="button-limit-type"
            >
              Limit
            </Button>
          </div>

          {/* Limit Price Field */}
          {orderType === 'limit' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Limit Price ({xrplClient.decodeCurrency(quoteInfo.currency)} per {xrplClient.decodeCurrency(baseInfo.currency)})
              </Label>
              <Input
                type="number"
                step="any"
                placeholder="0.00"
                value={price}
                onChange={(e) => handlePriceChange(e.target.value)}
                className="font-mono"
                data-testid="input-price"
              />
            </div>
          )}

          {/* Asset to Buy/Sell + Amount */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {orderSide === 'buy' ? 'Buy' : 'Sell'}
            </Label>
            <div className="grid grid-cols-[1fr,2fr] gap-2">
              <Select value={baseAsset} onValueChange={setBaseAsset}>
                <SelectTrigger data-testid="select-base-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCurrencies.map((currency) => (
                    <SelectItem key={`base-${currency.key}`} value={currency.value}>
                      {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Input
                  type="number"
                  step="any"
                  placeholder="Amount"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="font-mono pr-16"
                  data-testid="input-amount"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-7 text-xs"
                  onClick={handleMaxAmount}
                  disabled={!price || (orderType === 'market' && !marketPrice)}
                  data-testid="button-max-amount"
                >
                  MAX
                </Button>
              </div>
            </div>
            {orderSide === 'sell' && (() => {
              const balance = baseInfo.currency === 'XRP'
                ? parseFloat(getXRPBalance())
                : getTokenBalanceFromLines(baseInfo.currency, baseInfo.issuer, accountLines?.lines);
              const amountValue = parseFloat(amount) || 0;
              const hasInsufficient = amountValue > balance;
              return (
                <p className="text-xs text-muted-foreground">
                  Available: {balance} {xrplClient.decodeCurrency(baseInfo.currency)}
                  {hasInsufficient && (
                    <span className="text-red-500 ml-2">not enough {xrplClient.decodeCurrency(baseInfo.currency)}</span>
                  )}
                </p>
              );
            })()}
          </div>

          {/* Swap Button */}
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={swapPair}
              data-testid="button-swap-pair"
            >
              <ArrowUpDown className="w-4 h-4" />
            </Button>
          </div>

          {/* Pay with / Sell for */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {orderSide === 'buy' ? 'Pay with' : 'Sell for'}
            </Label>
            <Select value={quoteAsset} onValueChange={setQuoteAsset}>
              <SelectTrigger data-testid="select-quote-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableCurrencies.map((currency) => (
                  <SelectItem key={`quote-${currency.key}`} value={currency.value}>
                    {currency.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {orderSide === 'buy' && (() => {
              const balance = quoteInfo.currency === 'XRP'
                ? parseFloat(getXRPBalance())
                : getTokenBalanceFromLines(quoteInfo.currency, quoteInfo.issuer, accountLines?.lines);
              const totalNeeded = parseFloat(total) || 0;
              const hasInsufficient = totalNeeded > balance;
              return (
                <p className="text-xs text-muted-foreground">
                  Available: {balance} {xrplClient.decodeCurrency(quoteInfo.currency)}
                  {hasInsufficient && totalNeeded > 0 && (
                    <span className="text-red-500 ml-2">not enough {xrplClient.decodeCurrency(quoteInfo.currency)}</span>
                  )}
                </p>
              );
            })()}
          </div>

          {/* Order Summary */}
          {amount && total && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium mb-3">Order Summary</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span>You're {orderSide === 'buy' ? 'buying' : 'selling'}:</span>
                  <span className="font-semibold">{amount} {xrplClient.decodeCurrency(baseInfo.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>You'll {orderSide === 'buy' ? 'pay' : 'receive'}:</span>
                  <span className="font-semibold">~{total} {xrplClient.decodeCurrency(quoteInfo.currency)}</span>
                </div>
                {price && (
                  <div className="flex justify-between">
                    <span>At price:</span>
                    <span className="font-semibold">{parseFloat(price).toFixed(6)} {xrplClient.decodeCurrency(quoteInfo.currency)}/{xrplClient.decodeCurrency(baseInfo.currency)}</span>
                  </div>
                )}
              </div>
              
              <div className="pt-3 mt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">XRPL Technical Details:</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>TakerGets:</span>
                    <span className="font-mono">
                      {orderSide === 'buy' 
                        ? `${total} ${xrplClient.decodeCurrency(quoteInfo.currency)}`
                        : `${amount} ${xrplClient.decodeCurrency(baseInfo.currency)}`
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>TakerPays:</span>
                    <span className="font-mono">
                      {orderSide === 'buy' 
                        ? `${amount} ${xrplClient.decodeCurrency(baseInfo.currency)}`
                        : `${total} ${xrplClient.decodeCurrency(quoteInfo.currency)}`
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Flags:</span>
                    <span className="font-mono">
                      {orderSide === 'sell' && 'tfSell '}
                      {orderType === 'market' && 'tfImmediateOrCancel '}
                      {tfPassive && 'tfPassive '}
                      {tfFillOrKill && 'tfFillOrKill'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Execution Estimate for Market Orders */}
          {orderType === 'market' && executionEstimate && amount && parseFloat(amount) > 0 && (
            <Card className={executionEstimate.liquidityWarning ? 'border-yellow-500/50' : 'border-green-500/50'}>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Estimated {orderSide === 'buy' ? 'Cost' : 'Received'}:</span>
                    <span className="font-semibold">
                      {executionEstimate.totalCost.toFixed(6)} {xrplClient.decodeCurrency(quoteInfo.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Avg. Execution Price:</span>
                    <span className="font-mono text-xs">
                      {executionEstimate.averagePrice.toFixed(6)}
                    </span>
                  </div>
                  {executionEstimate.slippage > 0.01 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Market Slippage:</span>
                      <span className={`font-semibold ${executionEstimate.slippage > slippageTolerance * 100 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {executionEstimate.slippage.toFixed(2)}%
                      </span>
                    </div>
                  )}
                  {executionEstimate.priceImpact > 1 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Price Impact:</span>
                      <span className={`font-semibold ${executionEstimate.priceImpact > 5 ? 'text-red-600' : 'text-yellow-600'}`}>
                        {executionEstimate.priceImpact.toFixed(2)}%
                      </span>
                    </div>
                  )}
                  {executionEstimate.liquidityWarning && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-yellow-600 dark:text-yellow-500 flex items-start gap-1">
                        <span className="mt-0.5">⚠️</span>
                        <span>{executionEstimate.liquidityWarning}</span>
                      </p>
                    </div>
                  )}
                  {!executionEstimate.isFullyFillable && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-red-600 dark:text-red-500">
                        Only {executionEstimate.filledQuantity.toFixed(6)} can be filled. 
                        {executionEstimate.unfillableQuantity.toFixed(6)} will remain unfilled.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading indicator for depth analysis */}
          {orderType === 'market' && amount && parseFloat(amount) > 0 && (
            <div className="text-sm text-center min-h-[36px] flex items-center justify-center">
              {isLoadingDepth && (
                <span className="text-muted-foreground">Analyzing order book depth...</span>
              )}
            </div>
          )}

          {/* Advanced Options */}
          <div className="space-y-2">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              Advanced Options {showAdvanced ? '▲' : '▼'}
            </button>
            
            {showAdvanced && (
              <div className="space-y-3 pt-2">
                {orderType === 'market' && (
                  <div>
                    <Label htmlFor="slippage" className="text-sm">
                      Slippage Tolerance (%)
                    </Label>
                    <Input
                      id="slippage"
                      type="number"
                      min="0.1"
                      max="50"
                      step="0.1"
                      placeholder="2"
                      value={(slippageTolerance * 100).toString()}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        if (!isNaN(value) && value >= 0.1 && value <= 50) {
                          setSlippageTolerance(value / 100);
                        }
                      }}
                      data-testid="input-slippage"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Maximum price difference you'll accept ({(slippageTolerance * 100).toFixed(1)}%)
                    </p>
                  </div>
                )}
                <div>
                  <Label htmlFor="expiration" className="text-sm">Expiration (days)</Label>
                  <Input
                    id="expiration"
                    type="number"
                    placeholder="Optional (e.g., 7)"
                    value={expirationDays}
                    onChange={(e) => setExpirationDays(e.target.value)}
                    data-testid="input-expiration"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Order Flags</Label>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="tfPassive"
                      checked={tfPassive}
                      onCheckedChange={(checked) => setTfPassive(checked as boolean)}
                      data-testid="checkbox-passive"
                    />
                    <label htmlFor="tfPassive" className="text-sm cursor-pointer">
                      Passive (don't cross spread)
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="tfFillOrKill"
                      checked={tfFillOrKill}
                      onCheckedChange={(checked) => setTfFillOrKill(checked as boolean)}
                      data-testid="checkbox-fok"
                    />
                    <label htmlFor="tfFillOrKill" className="text-sm cursor-pointer">
                      Fill or Kill
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" data-testid="button-submit-offer">
            Place {orderSide === 'buy' ? 'Buy' : 'Sell'} Order
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
