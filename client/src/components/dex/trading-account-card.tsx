import { useState } from 'react';
import { Wallet, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface TradingAccountCardProps {
  address: string;
  xrpBalance: string;
}

export function TradingAccountCard({ address, xrpBalance }: TradingAccountCardProps) {
  const [addressCopied, setAddressCopied] = useState(false);

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    }
  };

  return (
    <Card className="mb-6 bg-primary/5 border-primary/20">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">Trading Account</p>
              <p className="text-sm font-semibold text-primary">{xrpBalance} XRP</p>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono bg-muted px-2 py-1 rounded truncate flex-1">
                {address}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyAddress}
                className="h-7 w-7 p-0 flex-shrink-0"
                data-testid="button-copy-address"
              >
                {addressCopied ? (
                  <Check className="w-3 h-3 text-green-600" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
