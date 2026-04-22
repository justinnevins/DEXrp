/**
 * DEX Offer Tracking Types
 * 
 * These types support comprehensive tracking of XRPL DEX offers including:
 * - Original offer amounts (stored at creation)
 * - Fill history from transaction metadata
 * - Partial fill tracking
 * - Execution price analytics
 */

export interface Amount {
  currency: string;
  issuer?: string;
  value: string;
}

export interface OfferFill {
  txHash: string;
  timestamp: number;
  ledgerIndex: number;
  takerGotAmount: Amount | string; // Amount the taker received (what we gave)
  takerPaidAmount: Amount | string; // Amount the taker paid (what we received)
  executionPrice?: number; // Calculated price for this fill
}

export interface StoredOffer {
  sequence: number; // Offer sequence number (unique identifier)
  walletAddress: string; // Address of the wallet that created this offer
  network: 'mainnet' | 'testnet';
  
  // Original amounts when offer was created
  originalTakerGets: Amount | string;
  originalTakerPays: Amount | string;
  
  // Metadata
  createdAt: number; // Timestamp
  createdTxHash: string;
  createdLedgerIndex: number;
  
  // Fill tracking
  fills: OfferFill[];
  
  // Optional fields
  expiration?: number; // Ripple epoch expiration time
  flags?: number;
}

export interface OfferWithStatus extends StoredOffer {
  // Current status (from account_offers query)
  currentTakerGets?: Amount | string;
  currentTakerPays?: Amount | string;
  
  // Calculated fields
  fillPercentage: number; // 0-100
  totalFilled: {
    takerGets: string; // Amount filled from original TakerGets
    takerPays: string; // Amount received from fills
  };
  averageExecutionPrice?: number;
  isFullyExecuted: boolean;
  isCancelled: boolean;
}

/**
 * Parse transaction metadata to extract offer fills
 */
export interface OfferNode {
  LedgerEntryType: 'Offer';
  LedgerIndex: string;
  PreviousFields?: {
    TakerGets?: Amount | string;
    TakerPays?: Amount | string;
  };
  FinalFields?: {
    TakerGets?: Amount | string;
    TakerPays?: Amount | string;
    Account?: string;
    Sequence?: number;
  };
  PreviousTxnID?: string;
}
