import { COMMON_TOKENS, CURRENCY_CODES } from '@/lib/constants';
import type { XRPLNetwork } from '@/lib/xrpl-client';

export interface ParsedAsset {
  currency: string;
  issuer: string;
}

export function parseAsset(asset: string): ParsedAsset {
  if (asset === 'XRP' || !asset) {
    return { currency: 'XRP', issuer: '' };
  }
  const [currency, issuer] = asset.split(':');
  return { currency: currency || 'XRP', issuer: issuer || '' };
}

export function createAsset(currency: string, issuer?: string): string {
  if (currency === 'XRP' || !currency) {
    return 'XRP';
  }
  return issuer ? `${currency}:${issuer}` : currency;
}

export function getRLUSDAsset(network: XRPLNetwork): string {
  const rlusdToken = COMMON_TOKENS.find(t => t.name === 'Ripple USD (RLUSD)');
  const rlusdIssuer = network === 'mainnet'
    ? rlusdToken?.mainnetIssuer
    : rlusdToken?.testnetIssuer;
  return `${CURRENCY_CODES.RLUSD_HEX}:${rlusdIssuer}`;
}

export function updateAssetForNetwork(
  currentAsset: string,
  network: XRPLNetwork,
  fallbackAsset: string
): string {
  const assetInfo = parseAsset(currentAsset);
  if (assetInfo.currency === 'XRP') {
    return currentAsset;
  }
  
  const commonToken = COMMON_TOKENS.find(t => t.currency === assetInfo.currency);
  if (commonToken) {
    const validIssuer = network === 'mainnet' 
      ? commonToken.mainnetIssuer 
      : commonToken.testnetIssuer;
    
    if (validIssuer) {
      return createAsset(assetInfo.currency, validIssuer);
    } else {
      return fallbackAsset;
    }
  }
  return currentAsset;
}
