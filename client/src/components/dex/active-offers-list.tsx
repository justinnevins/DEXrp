import { TrendingUp, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { xrplClient, type XRPLNetwork } from '@/lib/xrpl-client';
import { browserStorage } from '@/lib/browser-storage';
import { enrichOfferWithStatus, formatOfferAmount } from '@/lib/dex-utils';

interface ActiveOffersListProps {
  offers: any[] | undefined;
  isLoading: boolean;
  walletAddress: string;
  network: XRPLNetwork;
  onCancelOffer: (sequence: number) => void;
}

function formatAmount(amount: any) {
  if (typeof amount === 'string') {
    return parseFloat(xrplClient.formatXRPAmount(amount)).toFixed(6) + ' XRP';
  }
  return `${parseFloat(amount.value).toFixed(6)} ${xrplClient.decodeCurrency(amount.currency)}`;
}

function calculatePricePerUnit(pays: any, gets: any) {
  let payValue = 0;
  let payLabel = '';
  let getLabel = '';
  
  if (typeof pays === 'string') {
    payValue = parseFloat(xrplClient.formatXRPAmount(pays));
    payLabel = 'XRP';
  } else {
    payValue = parseFloat(pays.value);
    payLabel = xrplClient.decodeCurrency(pays.currency);
  }
  
  let getsValue = 0;
  
  if (typeof gets === 'string') {
    getsValue = parseFloat(xrplClient.formatXRPAmount(gets));
    getLabel = 'XRP';
  } else {
    getsValue = parseFloat(gets.value);
    getLabel = xrplClient.decodeCurrency(gets.currency);
  }
  
  if (getsValue === 0 || payValue === 0) return null;
  
  const price = payValue / getsValue;
  const inversePrice = getsValue / payValue;
  return `${price.toFixed(4)} ${payLabel} (${inversePrice.toFixed(4)} ${getLabel})`;
}

export function ActiveOffersList({
  offers,
  isLoading,
  walletAddress,
  network,
  onCancelOffer,
}: ActiveOffersListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="pt-6">
              <div className="h-20 bg-muted rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!offers || offers.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">
            No active offers. Create one to start trading!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {offers.map((offer: any, index: number) => {
        const storedOffer = browserStorage.getOffer(walletAddress, network, offer.seq);
        const enrichedOffer = storedOffer ? enrichOfferWithStatus(storedOffer, offer) : null;
        
        return (
          <Card key={index} data-testid={`offer-${offer.seq}`}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <span className="font-medium">Order #{offer.seq}</span>
                    {enrichedOffer && enrichedOffer.fillPercentage >= 0.1 && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {enrichedOffer.fillPercentage.toFixed(1)}% Filled
                      </span>
                    )}
                  </div>
                  
                  {enrichedOffer ? (
                    <div className="text-sm space-y-2">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Original Pay:</span>
                          <span className="font-mono text-xs">{formatOfferAmount(enrichedOffer.originalTakerGets)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Remaining:</span>
                          <span className="font-mono">{formatAmount(offer.taker_gets)}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Original to Receive:</span>
                          <span className="font-mono text-xs">{formatOfferAmount(enrichedOffer.originalTakerPays)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Remaining:</span>
                          <span className="font-mono">{formatAmount(offer.taker_pays)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Price per Unit:</span>
                          <span className="font-mono text-xs">
                            {calculatePricePerUnit(enrichedOffer.originalTakerPays, enrichedOffer.originalTakerGets)}
                          </span>
                        </div>
                      </div>
                      {enrichedOffer && enrichedOffer.fillPercentage >= 0.1 && enrichedOffer.fills && enrichedOffer.fills.length > 0 && (
                        <div className="mt-2 pt-2 border-t">
                          <p className="text-xs text-muted-foreground mb-1">
                            Fill History ({enrichedOffer.fills.length} fill{enrichedOffer.fills.length > 1 ? 's' : ''})
                          </p>
                          <div className="space-y-1">
                            {enrichedOffer.fills.slice(0, 3).map((fill, i) => (
                              <div key={i} className="text-xs flex items-center justify-between">
                                <span className="text-muted-foreground">
                                  {new Date(fill.timestamp).toLocaleDateString()}
                                </span>
                                <span className="font-mono">
                                  {formatOfferAmount(fill.takerPaidAmount)}
                                </span>
                              </div>
                            ))}
                            {enrichedOffer.fills.length > 3 && (
                              <p className="text-xs text-muted-foreground">
                                +{enrichedOffer.fills.length - 3} more
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Pay:</span>
                        <span className="font-mono">{formatAmount(offer.taker_gets)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">to Receive:</span>
                        <span className="font-mono">{formatAmount(offer.taker_pays)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Price per Unit:</span>
                        <span className="font-mono text-xs">
                          {calculatePricePerUnit(offer.taker_pays, offer.taker_gets)}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {offer.expiration && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                      <Calendar className="w-3 h-3" />
                      Expires: {new Date((offer.expiration + 946684800) * 1000).toLocaleString()}
                    </div>
                  )}
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onCancelOffer(offer.seq)}
                  data-testid={`button-cancel-${offer.seq}`}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
