/**
 * Order Book Depth Analysis
 * 
 * Analyzes XRPL DEX order book depth to calculate realistic execution prices,
 * slippage estimates, and liquidity warnings for market orders
 */

import { xrplClient } from './xrpl-client';
import type { XRPLNetwork } from './xrpl-client';

export interface OrderBookOffer {
  price: number;
  quantity: number;
  cumulativeQuantity: number;
  cumulativeCost: number;
}

export interface OrderBookDepth {
  side: 'buy' | 'sell';
  offers: OrderBookOffer[];
  totalLiquidity: number;
  bestPrice: number | null;
  worstPrice: number | null;
}

export interface ExecutionEstimate {
  averagePrice: number;
  totalCost: number;
  priceImpact: number;
  slippage: number;
  filledQuantity: number;
  unfillableQuantity: number;
  worstPrice: number;
  isFullyFillable: boolean;
  liquidityWarning: string | null;
}

/**
 * Fetch and analyze order book depth for a trading pair
 */
export async function analyzeOrderBookDepth(
  network: XRPLNetwork,
  takerGets: { currency: string; issuer?: string },
  takerPays: { currency: string; issuer?: string },
  side: 'buy' | 'sell',
  limit: number = 50
): Promise<OrderBookDepth> {
  const state = xrplClient['clients'].get(network);
  if (!state) {
    throw new Error(`Client not initialized for network: ${network}`);
  }

  await xrplClient.connect(network);

  // For buy orders: we want asks (people selling what we want to buy)
  // For sell orders: we want bids (people buying what we want to sell)
  const bookRequest = side === 'buy'
    ? {
        // Asks: We're buying base with quote currency
        // We want offers where TakerGets = base (what they're selling/we're buying)
        // and TakerPays = quote (what they want/we're paying)
        taker_gets: takerGets.currency === 'XRP'
          ? { currency: 'XRP' }
          : { currency: takerGets.currency, issuer: takerGets.issuer },
        taker_pays: takerPays.currency === 'XRP'
          ? { currency: 'XRP' }
          : { currency: takerPays.currency, issuer: takerPays.issuer },
      }
    : {
        // Bids: We're selling base for quote currency
        // We want offers where TakerGets = quote (what they're paying/we're receiving)
        // and TakerPays = base (what they want/we're selling)
        taker_gets: takerPays.currency === 'XRP'
          ? { currency: 'XRP' }
          : { currency: takerPays.currency, issuer: takerPays.issuer },
        taker_pays: takerGets.currency === 'XRP'
          ? { currency: 'XRP' }
          : { currency: takerGets.currency, issuer: takerGets.issuer },
      };

  try {
    const response = await state.connector.request({
      command: 'book_offers',
      ...bookRequest,
      limit
    });

    const offers = response?.result?.offers || [];
    
    let cumulativeQuantity = 0;
    let cumulativeCost = 0;
    const processedOffers: OrderBookOffer[] = [];

    for (const offer of offers) {
      // Parse amounts based on whether they're XRP or tokens
      const getsAmount = typeof offer.TakerGets === 'string'
        ? parseFloat(xrplClient.formatXRPAmount(offer.TakerGets))
        : parseFloat(offer.TakerGets.value);
      
      const paysAmount = typeof offer.TakerPays === 'string'
        ? parseFloat(xrplClient.formatXRPAmount(offer.TakerPays))
        : parseFloat(offer.TakerPays.value);

      // For buy orders: TakerGets=base, TakerPays=quote
      //   - quantity is in base (what we're buying) = getsAmount
      //   - cost is in quote (what we're paying) = paysAmount
      //   - price (quote per base) = paysAmount / getsAmount
      // For sell orders: TakerGets=quote, TakerPays=base
      //   - quantity is in base (what we're selling) = paysAmount
      //   - cost is in quote (what we're receiving) = getsAmount
      //   - price (quote per base) = getsAmount / paysAmount
      const quantity = side === 'buy' ? getsAmount : paysAmount;
      const cost = side === 'buy' ? paysAmount : getsAmount;
      
      // Calculate price (always in terms of quote per base)
      const price = side === 'buy' 
        ? (getsAmount > 0 ? paysAmount / getsAmount : 0)
        : (paysAmount > 0 ? getsAmount / paysAmount : 0);

      if (quantity > 0 && price > 0) {
        cumulativeQuantity += quantity;
        cumulativeCost += cost;

        processedOffers.push({
          price,
          quantity,
          cumulativeQuantity,
          cumulativeCost
        });
      }
    }

    return {
      side,
      offers: processedOffers,
      totalLiquidity: cumulativeQuantity,
      bestPrice: processedOffers.length > 0 ? processedOffers[0].price : null,
      worstPrice: processedOffers.length > 0 ? processedOffers[processedOffers.length - 1].price : null
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Estimate execution for a given order size based on order book depth
 */
export function estimateExecution(
  orderBookDepth: OrderBookDepth,
  orderSize: number,
  slippageTolerance: number = 0.02 // 2% default
): ExecutionEstimate {
  const { offers, bestPrice } = orderBookDepth;

  if (!bestPrice || offers.length === 0) {
    return {
      averagePrice: 0,
      totalCost: 0,
      priceImpact: 0,
      slippage: 0,
      filledQuantity: 0,
      unfillableQuantity: orderSize,
      worstPrice: 0,
      isFullyFillable: false,
      liquidityWarning: 'No liquidity available in the order book'
    };
  }

  let remainingSize = orderSize;
  let totalCost = 0;
  let totalQuantity = 0;
  let worstPrice = bestPrice;

  // Simulate walking through the order book
  for (const offer of offers) {
    if (remainingSize <= 0) break;

    const quantityFromThisOffer = Math.min(remainingSize, offer.quantity);
    const costFromThisOffer = quantityFromThisOffer * offer.price;

    totalQuantity += quantityFromThisOffer;
    totalCost += costFromThisOffer;
    remainingSize -= quantityFromThisOffer;
    worstPrice = offer.price;
  }

  const filledQuantity = totalQuantity;
  const unfillableQuantity = remainingSize;
  const isFullyFillable = unfillableQuantity === 0;
  const averagePrice = totalQuantity > 0 ? totalCost / totalQuantity : 0;

  // Calculate price impact and slippage
  const priceImpact = bestPrice > 0 
    ? Math.abs((worstPrice - bestPrice) / bestPrice) * 100 
    : 0;
  
  const slippage = bestPrice > 0
    ? Math.abs((averagePrice - bestPrice) / bestPrice) * 100
    : 0;

  // Generate warnings
  let liquidityWarning: string | null = null;

  if (!isFullyFillable) {
    liquidityWarning = `Insufficient liquidity: Only ${((filledQuantity / orderSize) * 100).toFixed(1)}% of your order can be filled`;
  } else if (priceImpact > slippageTolerance * 100) {
    liquidityWarning = `High price impact: ${priceImpact.toFixed(2)}% (exceeds ${(slippageTolerance * 100).toFixed(0)}% tolerance)`;
  } else if (slippage > slippageTolerance * 100 * 0.5) {
    liquidityWarning = `Moderate slippage expected: ${slippage.toFixed(2)}%`;
  }

  return {
    averagePrice,
    totalCost,
    priceImpact,
    slippage,
    filledQuantity,
    unfillableQuantity,
    worstPrice,
    isFullyFillable,
    liquidityWarning
  };
}

/**
 * Calculate safe price with slippage buffer for market orders
 */
export function calculateSlippageProtectedPrice(
  bestPrice: number,
  slippageTolerance: number,
  side: 'buy' | 'sell'
): number {
  // For buy orders, add slippage buffer (willing to pay more)
  // For sell orders, subtract slippage buffer (willing to receive less)
  const multiplier = side === 'buy' 
    ? (1 + slippageTolerance)
    : (1 - slippageTolerance);
  
  return bestPrice * multiplier;
}
