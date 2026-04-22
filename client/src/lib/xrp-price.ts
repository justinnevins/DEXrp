import { xrplClient } from './xrpl-client';
import { RLUSD_ISSUERS, CURRENCY_CODES } from './constants';

export interface XRPPriceData {
  price: number;
  currency: string;
  issuer: string;
  timestamp: number;
  ledgerIndex?: number;
  txHash?: string;
}

export interface DEXPriceData {
  price: number;
  currency: string;
  issuer: string;
  timestamp: number;
}

/**
 * Fetches XRP/RLUSD price directly from XRPL order book
 */
export async function fetchXRPToRLUSDPrice(network: 'mainnet' | 'testnet' = 'mainnet'): Promise<DEXPriceData | null> {
  try {
    const isMainnet = network === 'mainnet';
    const rlusdIssuer = isMainnet 
      ? RLUSD_ISSUERS.MAINNET
      : RLUSD_ISSUERS.TESTNET;

    const takerGets = { currency: 'XRP' };
    const takerPays = { currency: CURRENCY_CODES.RLUSD_HEX, issuer: rlusdIssuer };

    const priceData = await xrplClient.getOrderBookPrice(network, takerGets, takerPays);

    // Use mid-market price or best available price
    const price = priceData.askPrice && priceData.bidPrice
      ? (priceData.askPrice + priceData.bidPrice) / 2
      : (priceData.askPrice || priceData.bidPrice);

    if (!price) {
      return null;
    }

    return {
      price,
      currency: 'RLUSD',
      issuer: rlusdIssuer,
      timestamp: Date.now()
    };
  } catch {
    return null;
  }
}

/**
 * Formats price for display
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(price);
}
