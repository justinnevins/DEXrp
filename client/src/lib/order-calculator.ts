import { xrplClient } from './xrpl-client';

const TRANSACTION_FEE_XRP = 0.00001;

export interface OrderCalculation {
  amount: string;
  price: string;
  total: string;
}

export interface MaxCalculation {
  maxAmount: string;
  maxTotal: string;
  reason: string;
}

export interface ReserveInfo {
  baseReserve: number;
  ownerReserve: number;
  totalReserve: number;
  availableBalance: number;
}

export function calculateTotal(amount: string, price: string): string {
  if (!amount || !price || parseFloat(amount) <= 0 || parseFloat(price) <= 0) {
    return '';
  }
  
  const total = parseFloat(amount) * parseFloat(price);
  return total.toFixed(8).replace(/\.?0+$/, '');
}

export function calculateAmount(total: string, price: string): string {
  if (!total || !price || parseFloat(total) <= 0 || parseFloat(price) <= 0) {
    return '';
  }
  
  const amount = parseFloat(total) / parseFloat(price);
  return amount.toFixed(8).replace(/\.?0+$/, '');
}

export function calculatePrice(amount: string, total: string): string {
  if (!amount || !total || parseFloat(amount) <= 0 || parseFloat(total) <= 0) {
    return '';
  }
  
  const price = parseFloat(total) / parseFloat(amount);
  return price.toFixed(8).replace(/\.?0+$/, '');
}

export function calculateXRPReserves(
  trustlineCount: number,
  offerCount: number,
  baseReserve: number,
  incrementReserve: number
): ReserveInfo {
  // In XRPL, trustlines count toward the owner reserve with the increment value
  // Offers use a fractional reserve (typically 0.2 XRP but derived from increment)
  const offerReservePerItem = incrementReserve / 10; // Offers are 1/10th of increment
  const trustlineReserve = trustlineCount * incrementReserve;
  const offerReserve = offerCount * offerReservePerItem;
  const ownerReserve = trustlineReserve + offerReserve;
  const totalReserve = baseReserve + ownerReserve;
  
  return {
    baseReserve,
    ownerReserve,
    totalReserve,
    availableBalance: 0
  };
}

export function calculateAvailableXRP(
  xrpBalance: number,
  trustlineCount: number,
  offerCount: number,
  baseReserve: number,
  incrementReserve: number
): number {
  const reserves = calculateXRPReserves(trustlineCount, offerCount, baseReserve, incrementReserve);
  const available = xrpBalance - reserves.totalReserve - TRANSACTION_FEE_XRP;
  return Math.max(0, available);
}

export function calculateMaxBuy(
  quoteBalance: number,
  price: string,
  isQuoteXRP: boolean,
  trustlineCount: number = 0,
  offerCount: number = 0,
  baseReserve: number = 20,
  incrementReserve: number = 2
): MaxCalculation {
  if (!price || parseFloat(price) <= 0) {
    return {
      maxAmount: '',
      maxTotal: '',
      reason: 'Price required'
    };
  }

  const priceNum = parseFloat(price);
  let availableQuote = quoteBalance;

  if (isQuoteXRP) {
    availableQuote = calculateAvailableXRP(quoteBalance, trustlineCount, offerCount, baseReserve, incrementReserve);
    if (availableQuote <= 0) {
      return {
        maxAmount: '',
        maxTotal: '',
        reason: 'Insufficient XRP (reserves required)'
      };
    }
  }

  // Truncate to 8 decimals to avoid rounding up when multiplied back
  const maxAmount = Math.floor((availableQuote / priceNum) * 100000000) / 100000000;
  
  return {
    maxAmount: maxAmount.toFixed(8).replace(/\.?0+$/, ''),
    maxTotal: availableQuote.toFixed(8).replace(/\.?0+$/, ''),
    reason: 'success'
  };
}

export function calculateMaxSell(
  baseBalance: number,
  price: string,
  isBaseXRP: boolean,
  trustlineCount: number = 0,
  offerCount: number = 0,
  baseReserve: number = 20,
  incrementReserve: number = 2
): MaxCalculation {
  if (!price || parseFloat(price) <= 0) {
    return {
      maxAmount: '',
      maxTotal: '',
      reason: 'Price required'
    };
  }

  const priceNum = parseFloat(price);
  let availableBase = baseBalance;

  if (isBaseXRP) {
    availableBase = calculateAvailableXRP(baseBalance, trustlineCount, offerCount, baseReserve, incrementReserve);
    if (availableBase <= 0) {
      return {
        maxAmount: '',
        maxTotal: '',
        reason: 'Insufficient XRP (reserves required)'
      };
    }
  }

  // Truncate to 8 decimals to avoid rounding up when multiplied
  const maxTotal = Math.floor((availableBase * priceNum) * 100000000) / 100000000;
  
  return {
    maxAmount: availableBase.toFixed(8).replace(/\.?0+$/, ''),
    maxTotal: maxTotal.toFixed(8).replace(/\.?0+$/, ''),
    reason: 'success'
  };
}

export function formatOrderPrice(price: string, decimals: number = 6): string {
  if (!price) return '';
  const num = parseFloat(price);
  if (isNaN(num)) return '';
  return num.toFixed(decimals).replace(/\.?0+$/, '');
}

export function getTokenBalance(
  currency: string,
  issuer: string,
  accountLines: any[] | undefined
): number {
  if (!accountLines) return 0;
  
  const decodedCurrency = xrplClient.decodeCurrency(currency);
  const line = accountLines.find(
    (line) =>
      xrplClient.decodeCurrency(line.currency) === decodedCurrency &&
      line.account === issuer
  );
  
  return line ? parseFloat(line.balance) : 0;
}
