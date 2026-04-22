import { TrendingUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { xrplClient } from '@/lib/xrpl-client';
import { parseAsset } from '@/lib/dex-asset-utils';

interface MarketPriceCardProps {
  baseAsset: string;
  quoteAsset: string;
  marketPrice: number | null;
  isLoadingPrice: boolean;
  lastUpdate: Date | null;
  priceError: string | null;
  onRefresh: () => void;
}

export function MarketPriceCard({
  baseAsset,
  quoteAsset,
  marketPrice,
  isLoadingPrice,
  lastUpdate,
  priceError,
  onRefresh,
}: MarketPriceCardProps) {
  const baseInfo = parseAsset(baseAsset);
  const quoteInfo = parseAsset(quoteAsset);
  const baseLabel = baseInfo.currency === 'XRP' ? 'XRP' : xrplClient.decodeCurrency(baseInfo.currency);
  const quoteLabel = quoteInfo.currency === 'XRP' ? 'XRP' : xrplClient.decodeCurrency(quoteInfo.currency);

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Market Price</CardTitle>
            <span className="text-xs text-muted-foreground">
              ({baseLabel}/{quoteLabel})
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoadingPrice}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingPrice ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {marketPrice !== null ? (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {marketPrice.toFixed(6)}
              </span>
              <span className="text-sm text-muted-foreground">
                {quoteLabel} per {baseLabel}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {lastUpdate && (
                <div>
                  Updated {Math.floor((Date.now() - lastUpdate.getTime()) / 1000)}s ago
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {isLoadingPrice ? 'Loading market data...' : (priceError || 'No price data available')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
