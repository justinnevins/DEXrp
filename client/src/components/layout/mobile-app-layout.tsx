import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { Moon, Sun, Home, ArrowLeftRight, Coins, Settings, TrendingUp, LineChart, RefreshCw } from 'lucide-react';
import { useTheme } from '@/lib/theme-provider';
import { Button } from '@/components/ui/button';
import { TestnetBanner } from '@/components/testnet-banner';
import { WalletLimitBanner } from '@/components/wallet-limit-banner';
import { LocalBackupBanner } from '@/components/local-backup-banner';
import { AccountSwitcher } from '@/components/account-switcher';
import { HardwareWalletConnectModal } from '@/components/modals/hardware-wallet-connect-modal';
import { fetchXRPToRLUSDPrice, formatPrice, type DEXPriceData } from '@/lib/xrp-price';
import { useWallet } from '@/hooks/use-wallet';
import { useFormSubmission } from '@/hooks/use-form-submission';
import { Footer } from './footer';

function ThemeToggleIcon({ theme }: { theme: 'light' | 'dark' | 'system' }) {
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const resolvedTheme = useMemo(() => {
    if (theme === 'system') {
      return systemPrefersDark ? 'dark' : 'light';
    }
    return theme;
  }, [theme, systemPrefersDark]);

  const isAuto = theme === 'system';
  const Icon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <div className="relative">
      <Icon className="w-4 h-4" />
      {isAuto && (
        <span className="absolute -bottom-1 -right-1 text-[8px] font-bold bg-primary text-primary-foreground rounded-full w-3 h-3 flex items-center justify-center leading-none">
          A
        </span>
      )}
    </div>
  );
}

interface MobileAppLayoutProps {
  children: React.ReactNode;
}

const PULL_THRESHOLD = 80; // pixels needed to trigger refresh

export function MobileAppLayout({ children }: MobileAppLayoutProps) {
  const { theme, setTheme } = useTheme();
  const [location] = useLocation();
  const { currentWallet } = useWallet();
  const [rlusdPrice, setRLUSDPrice] = useState<DEXPriceData | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const mainContentRef = useRef<HTMLElement>(null);
  const { isSubmitting } = useFormSubmission();
  const touchStartYRef = useRef<number>(0);
  const isPullingRef = useRef<boolean>(false);
  const pullDistanceRef = useRef<number>(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isSubmittingRef = useRef(isSubmitting);
  const isRefreshingRef = useRef(isRefreshing);

  // Keep refs in sync with state
  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };

  // Handle pull-to-refresh on mobile
  useEffect(() => {
    const mainContent = mainContentRef.current;
    if (!mainContent) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (isSubmittingRef.current || isRefreshingRef.current) return;
      touchStartYRef.current = e.touches[0].clientY;
      // Only enable pull mode if we're exactly at the top
      isPullingRef.current = mainContent.scrollTop <= 0;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isSubmittingRef.current || isRefreshingRef.current) return;

      const currentY = e.touches[0].clientY;
      const scrollTop = mainContent.scrollTop;
      const distance = currentY - touchStartYRef.current;

      // If user scrolls down into content, disable pull mode permanently for this touch
      if (scrollTop > 0) {
        if (isPullingRef.current) {
          isPullingRef.current = false;
          pullDistanceRef.current = 0;
          setPullDistance(0);
        }
        return; // Let normal scrolling happen
      }

      // Only track pull when at the very top, pulling down, and pull mode is active
      if (scrollTop <= 0 && distance > 0 && isPullingRef.current) {
        // Only prevent default and show pull UI after a meaningful pull distance
        // This gives the browser a chance to start normal scroll first
        if (distance > 15) {
          e.preventDefault();
          
          // Apply resistance to make it feel more natural
          const resistedDistance = Math.min((distance - 15) * 0.5, 120);
          pullDistanceRef.current = resistedDistance;
          setPullDistance(resistedDistance);
        }
      } else if (distance < 0) {
        // User is scrolling up (to see content below) - disable pull mode
        isPullingRef.current = false;
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    const handleTouchEnd = () => {
      if (isSubmittingRef.current || isRefreshingRef.current) return;

      if (pullDistanceRef.current >= PULL_THRESHOLD) {
        // Trigger refresh
        setIsRefreshing(true);
        setPullDistance(0);
        pullDistanceRef.current = 0;
        // Small delay to show the refreshing state
        setTimeout(() => {
          window.location.reload();
        }, 300);
      } else {
        // Reset without refreshing
        setPullDistance(0);
        pullDistanceRef.current = 0;
      }
      isPullingRef.current = false;
    };

    // Handle touchcancel - browser may fire this if it takes over the gesture
    const handleTouchCancel = () => {
      // Reset state without triggering refresh
      setPullDistance(0);
      pullDistanceRef.current = 0;
      isPullingRef.current = false;
    };

    mainContent.addEventListener('touchstart', handleTouchStart, { passive: true });
    // Use passive: false so we can call preventDefault to keep the gesture alive
    mainContent.addEventListener('touchmove', handleTouchMove, { passive: false });
    mainContent.addEventListener('touchend', handleTouchEnd, { passive: true });
    mainContent.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      mainContent.removeEventListener('touchstart', handleTouchStart);
      mainContent.removeEventListener('touchmove', handleTouchMove);
      mainContent.removeEventListener('touchend', handleTouchEnd);
      mainContent.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, []); // Empty dependency array - listeners stay stable

  // Fetch XRP/RLUSD price from DEX order book
  useEffect(() => {
    const network = currentWallet?.network ?? 'mainnet';

    const updatePrice = async () => {
      const price = await fetchXRPToRLUSDPrice(network);
      if (price) {
        setRLUSDPrice(price);
      }
    };

    // Initial fetch
    updatePrice();

    // Update price every 5 seconds
    const interval = setInterval(updatePrice, 5000);

    return () => clearInterval(interval);
  }, [currentWallet?.network]);

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/transactions', label: 'History', icon: ArrowLeftRight },
    { path: '/dex', label: 'DEX', icon: LineChart },
    { path: '/assets', label: 'Assets', icon: Coins },
    { path: '/profile', label: 'Settings', icon: Settings },
  ];

  return (
    <div 
      className="flex overflow-hidden bg-background w-full"
      style={{ 
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)'
      }}
    >
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:border-r border-border bg-white dark:bg-card">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <img src="/pwa-192x192.png" alt="DEXrp" className="w-8 h-8" />
            <h1 className="text-lg font-semibold">DEXrp Tools</h1>
          </div>
        </div>
        
        <nav className="flex-1 p-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              
              return (
                <Link key={item.path} href={item.path}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className={`w-full justify-start ${isActive ? 'bg-accent' : ''}`}
                  >
                    <Icon className="w-5 h-5 mr-3" />
                    <span>{item.label}</span>
                  </Button>
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col w-full h-full overflow-hidden">
        {/* Testnet Banner */}
        <TestnetBanner />

        {/* App Header */}
        <header className="flex-shrink-0 bg-white dark:bg-card shadow-sm border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0 max-w-[50%] md:max-w-none">
              <AccountSwitcher onAddAccount={() => setShowConnectModal(true)} />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {rlusdPrice && (
                <Link href="/dex" className="hover:opacity-80 transition-opacity">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mr-2 cursor-pointer">
                    <TrendingUp className="w-3 h-3 flex-shrink-0" />
                    <span className="whitespace-nowrap">XRP {formatPrice(rlusdPrice.price).replace('$', '')} (RLUSD)</span>
                  </div>
                </Link>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className="p-2 rounded-full bg-muted flex-shrink-0"
                data-testid="theme-toggle"
              >
                <ThemeToggleIcon theme={theme} />
              </Button>
            </div>
          </div>
        </header>

        {/* Pull to Refresh Indicator */}
        {(pullDistance > 0 || isRefreshing) && (
          <div 
            className="flex items-center justify-center bg-muted/50 overflow-hidden transition-all duration-150"
            style={{ height: isRefreshing ? 50 : pullDistance }}
          >
            <div 
              className={`flex items-center gap-2 text-sm text-muted-foreground transition-all ${
                pullDistance >= PULL_THRESHOLD || isRefreshing ? 'text-primary' : ''
              }`}
            >
              <RefreshCw 
                className={`w-5 h-5 transition-transform ${
                  isRefreshing ? 'animate-spin' : ''
                }`}
                style={{ 
                  transform: isRefreshing 
                    ? undefined 
                    : `rotate(${Math.min(pullDistance / PULL_THRESHOLD * 180, 180)}deg)` 
                }}
              />
              <span>
                {isRefreshing 
                  ? 'Refreshing...' 
                  : pullDistance >= PULL_THRESHOLD 
                    ? 'Release to refresh' 
                    : 'Pull to refresh'}
              </span>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main 
          ref={mainContentRef}
          className="flex-1 overflow-y-auto pb-20 md:pb-6"
          style={{ overscrollBehavior: 'contain' }}
        >
          <div className="md:px-12 lg:px-20">
            <div className="px-4 pt-4">
              <WalletLimitBanner />
              <LocalBackupBanner />
            </div>
            {children}
          </div>
          <Footer />
        </main>

        {/* Mobile Bottom Navigation (hidden on desktop) */}
        <nav 
          className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-card border-t border-border z-50"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex items-center justify-around py-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              
              return (
                <Link key={item.path} href={item.path}>
                  <Button
                    variant="ghost"
                    className={`flex flex-col items-center py-2 px-4 touch-target ${
                      isActive 
                        ? 'text-primary' 
                        : 'text-muted-foreground'
                    }`}
                  >
                    <Icon className="w-5 h-5 mb-1" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </Button>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Hardware Wallet Connect Modal */}
        <HardwareWalletConnectModal
          isOpen={showConnectModal}
          onClose={() => setShowConnectModal(false)}
        />
      </div>
    </div>
  );
}
