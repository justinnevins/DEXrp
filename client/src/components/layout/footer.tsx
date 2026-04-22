import { SiGithub } from 'react-icons/si';
import { useWallet } from '@/hooks/use-wallet';
import { xrplClient } from '@/lib/xrpl-client';
import { useState, useEffect } from 'react';

const KEYSTONE_AFFILIATE_URL = 'https://keyst.one/?rfsn=8924031.c9a3ff&utm_source=refersion&utm_medium=affiliate&utm_campaign=8924031.c9a3ff';
const GITHUB_URL = 'https://github.com/justinnevins/dexrp-tools';

export function Footer() {
  const { currentWallet } = useWallet();
  const network = currentWallet?.network ?? 'mainnet';
  const nodeUrl = xrplClient.getEndpoint(network);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const checkConnection = () => {
      const info = xrplClient.getNetworkInfo(network);
      setIsConnected(info.isConnected);
    };
    
    checkConnection();
    const interval = setInterval(checkConnection, 2000);
    return () => clearInterval(interval);
  }, [network]);

  return (
    <div className="px-4 py-6 sm:py-8 bg-muted border-t border-border">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-4 sm:mb-6 text-center">
          <a 
            href="https://x.com/JustinNevins" 
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors text-xs sm:text-sm" 
            data-testid="footer-x"
          >
            X (@JustinNevins)
          </a>
          <a
            href={KEYSTONE_AFFILIATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors text-xs sm:text-sm"
            data-testid="footer-keystone"
          >
            Get Keystone
          </a>
          <a 
            href="/privacy" 
            className="text-muted-foreground hover:text-foreground transition-colors text-xs sm:text-sm" 
            data-testid="footer-privacy"
          >
            Privacy
          </a>
          <a 
            href="https://x.com/JustinNevins" 
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors text-xs sm:text-sm" 
            data-testid="footer-contact"
          >
            Contact
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors text-xs sm:text-sm flex items-center justify-center gap-1"
            data-testid="footer-github"
          >
            <SiGithub className="w-3 h-3" />
            GitHub
          </a>
        </div>

        <div className="border-t border-border pt-4 sm:pt-6 text-center space-y-2">
          <p className="text-muted-foreground text-xs sm:text-sm">© 2026 DEXrp Tools  |  Self-custodial XRPL Tools by CarbonVibe</p>
          <div className="flex items-center justify-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground/60">
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span>{isConnected ? 'Connected to' : 'Disconnected from'} {network === 'mainnet' ? 'Mainnet' : 'Testnet'}:</span>
            <span className="font-mono truncate max-w-[200px] sm:max-w-none">{nodeUrl}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
