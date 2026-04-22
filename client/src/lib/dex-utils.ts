/**
 * DEX Utilities
 * 
 * Parses XRPL transaction metadata to detect DEX offer fills and calculate statistics.
 * Used for tracking maker-side offer execution, partial fills, and order history.
 * 
 * Key concepts:
 * - Maker orders: Orders placed on the DEX order book (OfferCreate that doesn't immediately fill)
 * - Taker orders: Orders that consume existing order book offers (immediate execution)
 * - Partial fills: When only part of a maker order is consumed by a taker
 * - AffectedNodes: XRPL transaction metadata containing balance/offer changes
 * 
 * @module dex-utils
 */

import type { StoredOffer, OfferFill, Amount, OfferWithStatus } from './dex-types';
import { xrplClient } from './xrpl-client';

/**
 * Extended OfferFill with the sequence number of the filled offer.
 * Used to match fills to specific offers in the user's offer history.
 */
export interface OfferFillWithSequence extends OfferFill {
  /** The sequence number of the offer that was partially or fully filled */
  offerSequence: number;
}

/**
 * Extracts offer fill information from XRPL transaction metadata.
 * 
 * Parses AffectedNodes to detect when offers belonging to the wallet were
 * partially or fully consumed. Handles both:
 * 1. Immediate partial fills when creating an offer (OfferCreate that crosses existing offers)
 * 2. Later fills when other users take from our resting offers
 * 
 * @param tx - XRPL transaction object containing meta.AffectedNodes
 * @param walletAddress - The wallet address to find fills for
 * @returns Array of fill events with amounts, prices, and offer sequence numbers
 * 
 * @example
 * ```typescript
 * const fills = extractOfferFills(transaction, 'rWalletAddress...');
 * fills.forEach(fill => {
 *   console.log(`Offer ${fill.offerSequence} filled at price ${fill.executionPrice}`);
 * });
 * ```
 */
export function extractOfferFills(
  tx: any,
  walletAddress: string
): OfferFillWithSequence[] {
  const fills: OfferFillWithSequence[] = [];
  
  if (!tx.meta || !tx.meta.AffectedNodes) {
    return fills;
  }
  
  const transaction = tx.tx_json || tx.tx || tx;
  const txHash = transaction.hash || tx.hash;
  const timestamp = transaction.date ? (transaction.date * 1000 + 946684800000) : Date.now();
  const ledgerIndex = tx.ledger_index || tx.ledger_current_index || 0;
  
  // Check for immediate partial fill when creating an offer
  // This happens when OfferCreate transaction consumes existing offers
  if (transaction.TransactionType === 'OfferCreate' && transaction.Account === walletAddress) {
    for (const node of tx.meta.AffectedNodes) {
      if (node.CreatedNode?.LedgerEntryType === 'Offer') {
        const newFields = node.CreatedNode.NewFields;
        if (newFields?.Account === walletAddress) {
          // Compare submitted amounts with created amounts
          const submittedGets = transaction.TakerGets;
          const submittedPays = transaction.TakerPays;
          const createdGets = newFields.TakerGets;
          const createdPays = newFields.TakerPays;
          
          // Calculate immediate fill (submitted - created = consumed)
          const immediateFillGets = calculateAmountDifference(submittedGets, createdGets);
          const immediateFillPays = calculateAmountDifference(submittedPays, createdPays);
          
          if (immediateFillGets || immediateFillPays) {
            fills.push({
              offerSequence: transaction.Sequence,
              txHash,
              timestamp,
              ledgerIndex,
              takerGotAmount: immediateFillGets || submittedGets,
              takerPaidAmount: immediateFillPays || submittedPays,
              executionPrice: calculateExecutionPrice(
                immediateFillGets || submittedGets,
                immediateFillPays || submittedPays
              )
            });
          }
          break; // Found our created offer
        }
      }
    }
  }
  
  // Look for ModifiedNode or DeletedNode of type Offer belonging to our wallet
  for (const node of tx.meta.AffectedNodes) {
    const nodeData = node.ModifiedNode || node.DeletedNode;
    
    if (!nodeData || nodeData.LedgerEntryType !== 'Offer') {
      continue;
    }
    
    const finalFields = nodeData.FinalFields;
    const previousFields = nodeData.PreviousFields;
    
    // Check if this offer belongs to our wallet
    // For DeletedNode, Account/Sequence might only be in PreviousFields
    const offerAccount = finalFields?.Account || previousFields?.Account;
    if (offerAccount !== walletAddress) {
      continue;
    }
    
    const offerSequence = finalFields?.Sequence || previousFields?.Sequence;
    if (!offerSequence) {
      continue;
    }
    
    // Calculate the fill amount by comparing previous and final fields
    if (previousFields && (previousFields.TakerGets || previousFields.TakerPays)) {
      const previousGets = previousFields.TakerGets;
      const previousPays = previousFields.TakerPays;
      const finalGets = finalFields?.TakerGets;
      const finalPays = finalFields?.TakerPays;
      
      // Calculate how much was filled
      const takerGotAmount = calculateAmountDifference(previousGets, finalGets);
      const takerPaidAmount = calculateAmountDifference(previousPays, finalPays);
      
      if (takerGotAmount || takerPaidAmount) {
        fills.push({
          offerSequence,
          txHash,
          timestamp,
          ledgerIndex,
          takerGotAmount: takerGotAmount || previousGets,
          takerPaidAmount: takerPaidAmount || previousPays,
          executionPrice: calculateExecutionPrice(takerGotAmount || previousGets, takerPaidAmount || previousPays)
        });
      }
    } else if (node.DeletedNode) {
      // Offer was fully consumed
      const previousGets = previousFields?.TakerGets || finalFields?.TakerGets;
      const previousPays = previousFields?.TakerPays || finalFields?.TakerPays;
      
      if (previousGets && previousPays) {
        fills.push({
          offerSequence,
          txHash,
          timestamp,
          ledgerIndex,
          takerGotAmount: previousGets,
          takerPaidAmount: previousPays,
          executionPrice: calculateExecutionPrice(previousGets, previousPays)
        });
      }
    }
  }
  
  return fills;
}

/**
 * Calculates the difference between two XRPL amounts (previous - current).
 * Used to determine how much of an offer was consumed in a transaction.
 * 
 * @param previous - The amount before the transaction (string for XRP drops, Amount object for tokens)
 * @param current - The amount after the transaction
 * @returns The consumed amount, or null if no consumption occurred
 * @internal
 */
function calculateAmountDifference(
  previous: Amount | string | undefined,
  current: Amount | string | undefined
): Amount | string | null {
  if (!previous) return null;
  if (!current) return previous; // Fully consumed
  
  if (typeof previous === 'string' && typeof current === 'string') {
    // XRP amounts in drops
    const diff = BigInt(previous) - BigInt(current);
    return diff > 0 ? diff.toString() : null;
  }
  
  if (typeof previous === 'object' && typeof current === 'object') {
    // Token amounts
    const prevValue = parseFloat(previous.value);
    const currValue = parseFloat(current.value);
    const diff = prevValue - currValue;
    
    if (diff > 0) {
      return {
        currency: previous.currency,
        issuer: previous.issuer,
        value: diff.toString()
      };
    }
  }
  
  return null;
}

/**
 * Calculates the execution price from TakerGets and TakerPays amounts.
 * Price is expressed as takerPays/takerGets (how much paid per unit received).
 * 
 * @param takerGets - Amount the offer maker receives (string for XRP drops, Amount for tokens)
 * @param takerPays - Amount the offer maker pays
 * @returns Execution price as a number, or undefined if calculation fails
 * @internal
 */
function calculateExecutionPrice(
  takerGets: Amount | string,
  takerPays: Amount | string
): number | undefined {
  try {
    let getsValue: number;
    let paysValue: number;
    
    if (typeof takerGets === 'string') {
      getsValue = parseFloat(xrplClient.formatXRPAmount(takerGets));
    } else {
      getsValue = parseFloat(takerGets.value);
    }
    
    if (typeof takerPays === 'string') {
      paysValue = parseFloat(xrplClient.formatXRPAmount(takerPays));
    } else {
      paysValue = parseFloat(takerPays.value);
    }
    
    if (getsValue > 0) {
      return paysValue / getsValue;
    }
  } catch {
  }
  
  return undefined;
}

/**
 * Enriches a stored offer with current on-chain status and calculated fields.
 * 
 * Combines persisted offer data (from browser storage) with live XRPL data
 * to provide a complete view of an offer's execution status.
 * 
 * @param storedOffer - The offer from browser storage with fill history
 * @param currentOffer - Current offer data from XRPL account_offers (undefined if no longer active)
 * @returns Enhanced offer with fill percentage, execution prices, and status flags
 * 
 * @example
 * ```typescript
 * const enriched = enrichOfferWithStatus(storedOffer, currentLiveOffer);
 * if (enriched.isFullyExecuted) {
 *   console.log(`Offer fully filled at avg price ${enriched.averageExecutionPrice}`);
 * }
 * ```
 */
export function enrichOfferWithStatus(
  storedOffer: StoredOffer,
  currentOffer?: any // From account_offers query
): OfferWithStatus {
  const currentTakerGets = currentOffer?.taker_gets;
  const currentTakerPays = currentOffer?.taker_pays;
  
  // Calculate total filled amounts
  const totalFilledGets = calculateTotalFilled(storedOffer.fills, 'takerGotAmount');
  const totalFilledPays = calculateTotalFilled(storedOffer.fills, 'takerPaidAmount');
  
  // Calculate fill percentage
  const fillPercentage = calculateFillPercentage(
    storedOffer.originalTakerGets,
    totalFilledGets
  );
  
  // Calculate average execution price
  const averageExecutionPrice = calculateAverageExecutionPrice(storedOffer.fills);
  
  // Determine if fully executed or cancelled
  // An offer is fully executed if fill percentage is >= 99.9% (allowing for rounding)
  const isFullyExecuted = fillPercentage >= 99.9;
  const isCancelled = !currentOffer && storedOffer.fills.length === 0;
  
  return {
    ...storedOffer,
    currentTakerGets,
    currentTakerPays,
    totalFilled: {
      takerGets: totalFilledGets,
      takerPays: totalFilledPays
    },
    fillPercentage,
    averageExecutionPrice,
    isFullyExecuted,
    isCancelled
  };
}

/**
 * Calculates the total filled amount from an array of fill events.
 * 
 * @param fills - Array of fill events from offer history
 * @param field - Which amount field to sum ('takerGotAmount' or 'takerPaidAmount')
 * @returns Total filled amount as a formatted string
 * @internal
 */
function calculateTotalFilled(fills: OfferFill[], field: 'takerGotAmount' | 'takerPaidAmount'): string {
  let total = 0;
  let isXRP = true;
  
  for (const fill of fills) {
    const amount = fill[field];
    if (typeof amount === 'string') {
      total += parseFloat(xrplClient.formatXRPAmount(amount));
    } else {
      isXRP = false;
      total += parseFloat(amount.value);
    }
  }
  
  return total.toFixed(isXRP ? 6 : 6);
}

/**
 * Calculates what percentage of an offer has been filled.
 * 
 * @param original - The original offer amount when created
 * @param filled - The total amount that has been filled
 * @returns Fill percentage (0-100), capped at 100
 * @internal
 */
function calculateFillPercentage(original: Amount | string, filled: string): number {
  try {
    let originalValue: number;
    
    if (typeof original === 'string') {
      originalValue = parseFloat(xrplClient.formatXRPAmount(original));
    } else {
      originalValue = parseFloat(original.value);
    }
    
    const filledValue = parseFloat(filled);
    
    if (originalValue > 0) {
      return Math.min(100, (filledValue / originalValue) * 100);
    }
  } catch {
  }
  
  return 0;
}

/**
 * Calculates the volume-weighted average execution price from fill events.
 * 
 * Weights each fill by its quantity to get the true average price paid/received.
 * 
 * @param fills - Array of fill events with execution prices
 * @returns Weighted average price, or undefined if no fills have prices
 * @internal
 */
function calculateAverageExecutionPrice(fills: OfferFill[]): number | undefined {
  if (fills.length === 0) return undefined;
  
  let totalValue = 0;
  let totalWeight = 0;
  
  for (const fill of fills) {
    if (fill.executionPrice !== undefined) {
      const weight = typeof fill.takerGotAmount === 'string'
        ? parseFloat(xrplClient.formatXRPAmount(fill.takerGotAmount))
        : parseFloat((fill.takerGotAmount as Amount).value);
      
      totalValue += fill.executionPrice * weight;
      totalWeight += weight;
    }
  }
  
  return totalWeight > 0 ? totalValue / totalWeight : undefined;
}

/**
 * Formats an XRPL amount for display in the UI.
 * 
 * Handles both XRP (drops as string) and token amounts (Amount objects).
 * 
 * @param amount - The amount to format (string for XRP drops, Amount for tokens)
 * @returns Formatted string like "123.456789 XRP" or "1000.000000 USD"
 */
export function formatOfferAmount(amount: Amount | string): string {
  if (typeof amount === 'string') {
    return `${xrplClient.formatXRPAmount(amount)} XRP`;
  }
  return `${parseFloat(amount.value).toFixed(6)} ${xrplClient.decodeCurrency(amount.currency)}`;
}

/**
 * Calculates the wallet's actual balance changes from transaction metadata.
 * 
 * Parses AffectedNodes to determine exact XRP and token balance changes
 * for a specific wallet address. Useful for displaying transaction impact.
 * 
 * @param tx - XRPL transaction object containing meta.AffectedNodes
 * @param walletAddress - The wallet address to calculate changes for
 * @returns Object with XRP change (signed string) and array of token changes
 * 
 * @example
 * ```typescript
 * const changes = calculateBalanceChanges(tx, walletAddress);
 * if (changes.xrpChange) {
 *   console.log(`XRP changed by ${changes.xrpChange}`);
 * }
 * changes.tokenChanges.forEach(tc => {
 *   console.log(`${tc.currency} changed by ${tc.change}`);
 * });
 * ```
 */
export function calculateBalanceChanges(tx: any, walletAddress: string): {
  xrpChange: string | null;
  tokenChanges: Array<{ currency: string; issuer: string; change: string }>;
} {
  const result = {
    xrpChange: null as string | null,
    tokenChanges: [] as Array<{ currency: string; issuer: string; change: string }>
  };

  if (!tx.meta || !tx.meta.AffectedNodes) {
    return result;
  }

  // Look through AffectedNodes for balance changes
  for (const node of tx.meta.AffectedNodes) {
    const nodeData = node.ModifiedNode || node.CreatedNode || node.DeletedNode;
    
    if (!nodeData) continue;

    // Check AccountRoot for XRP balance changes
    if (nodeData.LedgerEntryType === 'AccountRoot') {
      const finalFields = nodeData.FinalFields;
      const previousFields = nodeData.PreviousFields;
      
      // Only process if this is our wallet
      const account = finalFields?.Account || previousFields?.Account;
      if (account === walletAddress) {
        const prevBalance = previousFields?.Balance;
        const finalBalance = finalFields?.Balance;
        
        if (prevBalance && finalBalance) {
          const change = BigInt(finalBalance) - BigInt(prevBalance);
          if (change !== BigInt(0)) {
            result.xrpChange = xrplClient.formatXRPAmount(change.toString().replace('-', ''));
            if (change < BigInt(0)) {
              result.xrpChange = '-' + result.xrpChange;
            }
          }
        }
      }
    }
    
    // Check RippleState for token balance changes
    if (nodeData.LedgerEntryType === 'RippleState') {
      const finalFields = nodeData.FinalFields;
      const previousFields = nodeData.PreviousFields;
      
      // RippleState has HighLimit and LowLimit representing the two parties
      const highLimit = finalFields?.HighLimit || previousFields?.HighLimit;
      const lowLimit = finalFields?.LowLimit || previousFields?.LowLimit;
      
      // Check if our wallet is involved
      const isHighParty = highLimit?.issuer === walletAddress;
      const isLowParty = lowLimit?.issuer === walletAddress;
      
      if (isHighParty || isLowParty) {
        const prevBalance = previousFields?.Balance;
        const finalBalance = finalFields?.Balance;
        
        if (prevBalance && finalBalance && prevBalance.value && finalBalance.value) {
          let change = parseFloat(finalBalance.value) - parseFloat(prevBalance.value);
          
          // Balance is from the perspective of the low party
          // If we're the high party, invert the change
          if (isHighParty) {
            change = -change;
          }
          
          if (change !== 0) {
            const currency = xrplClient.decodeCurrency(finalBalance.currency || prevBalance.currency);
            const issuer = isHighParty ? lowLimit.issuer : highLimit.issuer;
            
            result.tokenChanges.push({
              currency,
              issuer,
              change: change.toString()
            });
          }
        }
      }
    }
  }

  return result;
}
