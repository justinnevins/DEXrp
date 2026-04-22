import type { AccountInfoResponse } from 'xrpl';

export interface BalanceInfo {
  totalBalance: number;
  reserved: number;
  available: number;
  availableMinusFees: number;
}

const STANDARD_FEE_DROPS = 12;
const DROPS_PER_XRP = 1000000;

/**
 * Calculate available XRP balance accounting for reserves and fees
 * @param accountInfo - XRPL account info response
 * @param feeDrops - Transaction fee in drops (default: 12)
 * @param baseReserve - Base reserve requirement in XRP (fetched from ledger via server_info)
 * @param incrementReserve - Increment reserve per owned object in XRP (fetched from ledger via server_info)
 * @returns Balance breakdown with total, reserved, available, and available minus fees
 */
export function calculateAvailableBalance(
  accountInfo: AccountInfoResponse | { account_not_found: string } | null | undefined,
  feeDrops: number = STANDARD_FEE_DROPS,
  baseReserve: number = 1,  // Current XRPL base reserve (Dec 2024)
  incrementReserve: number = 0.2  // Current XRPL increment reserve (Dec 2024)
): BalanceInfo {
  const defaultBalance: BalanceInfo = {
    totalBalance: 0,
    reserved: baseReserve,
    available: 0,
    availableMinusFees: 0
  };

  if (!accountInfo || 'account_not_found' in accountInfo || !('account_data' in accountInfo)) {
    return defaultBalance;
  }

  const { account_data } = accountInfo;
  
  if (!account_data?.Balance) {
    return defaultBalance;
  }

  // Parse total balance
  const totalBalanceDrops = parseInt(account_data.Balance);
  const totalBalance = totalBalanceDrops / DROPS_PER_XRP;

  // Calculate reserve using dynamic values from ledger
  const ownerCount = account_data.OwnerCount || 0;
  const reserved = baseReserve + (ownerCount * incrementReserve);

  // Calculate available (total - reserve, clamped to 0)
  const available = Math.max(0, totalBalance - reserved);

  // Calculate available minus transaction fee
  const feeXRP = feeDrops / DROPS_PER_XRP;
  const availableMinusFees = Math.max(0, available - feeXRP);

  return {
    totalBalance,
    reserved,
    available,
    availableMinusFees
  };
}

/**
 * Get token balance from trustline
 * @param accountLines - Account lines response
 * @param currency - Currency code
 * @param issuer - Issuer address
 * @returns Token balance as a number
 */
export function getTokenBalance(
  accountLines: any,
  currency: string,
  issuer: string
): number {
  if (!accountLines?.lines) {
    return 0;
  }

  const trustline = accountLines.lines.find(
    (line: any) => line.currency === currency && line.account === issuer
  );

  if (!trustline) {
    return 0;
  }

  return Math.max(0, parseFloat(trustline.balance || '0'));
}
