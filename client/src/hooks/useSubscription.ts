import { useAuth } from "./useAuth";

export type SubscriptionTier = 'free';

export interface WalletLimits {
  maxSigningWallets: number;
  maxWatchOnlyWallets: number;
  canAddSigningWallet: boolean;
  canAddWatchOnlyWallet: boolean;
  currentSigningWallets: number;
  currentWatchOnlyWallets: number;
}

export interface WalletOverageInfo {
  isOverLimit: boolean;
  signingOverage: number;
  watchOnlyOverage: number;
  totalSigningWallets: number;
  totalWatchOnlyWallets: number;
  allowedSigning: number;
  allowedWatchOnly: number;
}

export function useSubscription() {
  const { isAuthenticated } = useAuth();

  return {
    tier: 'free' as SubscriptionTier,
    isPremium: false,
    isAuthenticated,
    isLoading: false,
    subscription: null,
  };
}

export function useWalletLimits(currentSigningWallets: number, currentWatchOnlyWallets: number): WalletLimits {
  return {
    maxSigningWallets: Infinity,
    maxWatchOnlyWallets: Infinity,
    canAddSigningWallet: true,
    canAddWatchOnlyWallet: true,
    currentSigningWallets,
    currentWatchOnlyWallets,
  };
}

export function getWalletLimitsForTier(_tier: SubscriptionTier, _isPremium: boolean) {
  return { maxSigning: Infinity, maxWatchOnly: Infinity };
}

export function computeWalletOverage(
  signingCount: number,
  watchOnlyCount: number,
  _tier: SubscriptionTier,
  _isPremium: boolean
): WalletOverageInfo {
  return {
    isOverLimit: false,
    signingOverage: 0,
    watchOnlyOverage: 0,
    totalSigningWallets: signingCount,
    totalWatchOnlyWallets: watchOnlyCount,
    allowedSigning: Infinity,
    allowedWatchOnly: Infinity,
  };
}
