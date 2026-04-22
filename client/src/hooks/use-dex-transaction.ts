import { useState, useCallback } from 'react';
import { xrplClient, type XRPLNetwork } from '@/lib/xrpl-client';
import { calculateSlippageProtectedPrice } from '@/lib/order-book-depth';
import { calculateTotal } from '@/lib/order-calculator';
import { browserStorage } from '@/lib/browser-storage';
import { queryClient } from '@/lib/queryClient';
import type { StoredOffer } from '@/lib/dex-types';
import { parseAsset } from '@/lib/dex-asset-utils';

interface UseDexTransactionProps {
  currentWallet: any;
  network: XRPLNetwork;
  accountInfo: any;
  toast: (props: { title: string; description: string; variant?: 'default' | 'destructive' }) => void;
}

interface OrderParams {
  orderSide: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  baseAsset: string;
  quoteAsset: string;
  amount: string;
  price: string;
  marketPrice: number | null;
  slippageTolerance: number;
  expirationDays: string;
  calculateFlags: () => number | undefined;
}

export function useDexTransaction({ currentWallet, network, accountInfo, toast }: UseDexTransactionProps) {
  const [showSigner, setShowSigner] = useState(false);
  const [transactionUR, setTransactionUR] = useState<{ type: string; cbor: string } | null>(null);
  const [unsignedTransaction, setUnsignedTransaction] = useState<any>(null);
  const [transactionType, setTransactionType] = useState<'OfferCreate' | 'OfferCancel'>('OfferCreate');
  const [offerToCancel, setOfferToCancel] = useState<any>(null);

  const encodeOfferTransaction = async (transaction: any): Promise<{ type: string; cbor: string }> => {
    const { prepareXrpSignRequest } = await import('@/lib/keystone-client');
    return prepareXrpSignRequest(transaction);
  };

  const handleCreateOffer = useCallback(async (e: React.FormEvent, params: OrderParams) => {
    e.preventDefault();
    
    if (!currentWallet) {
      toast({
        title: "No Account Selected",
        description: "Please select an account first",
        variant: "destructive",
      });
      return;
    }

    const { orderSide, orderType, baseAsset, quoteAsset, amount, price, marketPrice, slippageTolerance, expirationDays, calculateFlags } = params;

    const amountValue = parseFloat(amount);
    if (!amount || isNaN(amountValue) || amountValue <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0",
        variant: "destructive",
      });
      return;
    }

    let effectivePrice = price;
    if (orderType === 'market') {
      if (!marketPrice || marketPrice <= 0) {
        toast({
          title: "Market Price Unavailable",
          description: "Please wait for market price to load or switch to limit order",
          variant: "destructive",
        });
        return;
      }
      
      const slippageProtectedPrice = calculateSlippageProtectedPrice(
        marketPrice,
        slippageTolerance,
        orderSide
      );
      effectivePrice = slippageProtectedPrice.toString();
    } else {
      const priceValue = parseFloat(price);
      if (!price || isNaN(priceValue) || priceValue <= 0) {
        toast({
          title: "Invalid Price",
          description: "Please enter a valid price greater than 0",
          variant: "destructive",
        });
        return;
      }
      effectivePrice = price;
    }

    const effectivePriceValue = parseFloat(effectivePrice);
    if (isNaN(effectivePriceValue) || effectivePriceValue <= 0) {
      toast({
        title: "Invalid Price",
        description: "Price must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    const calculatedTotal = calculateTotal(amount, effectivePrice);
    const calculatedTotalValue = parseFloat(calculatedTotal);
    if (!calculatedTotal || isNaN(calculatedTotalValue) || calculatedTotalValue <= 0) {
      toast({
        title: "Invalid Total",
        description: "Unable to calculate order total. Please check amount and price.",
        variant: "destructive",
      });
      return;
    }

    const baseInfo = parseAsset(baseAsset);
    const quoteInfo = parseAsset(quoteAsset);

    const MIN_XRP_AMOUNT = 0.000001;
    if (baseInfo.currency === 'XRP' && amountValue < MIN_XRP_AMOUNT) {
      toast({
        title: "Amount Too Small",
        description: "XRP amount must be at least 1 drop (0.000001 XRP)",
        variant: "destructive",
      });
      return;
    }
    if (quoteInfo.currency === 'XRP' && calculatedTotalValue < MIN_XRP_AMOUNT) {
      toast({
        title: "Total Too Small",
        description: "XRP total must be at least 1 drop (0.000001 XRP)",
        variant: "destructive",
      });
      return;
    }

    if (baseInfo.currency !== 'XRP' && !baseInfo.issuer) {
      toast({
        title: "Missing Issuer",
        description: "Non-XRP currencies require an issuer address",
        variant: "destructive",
      });
      return;
    }

    if (quoteInfo.currency !== 'XRP' && !quoteInfo.issuer) {
      toast({
        title: "Missing Issuer",
        description: "Non-XRP currencies require an issuer address",
        variant: "destructive",
      });
      return;
    }

    try {
      let transactionSequence = 1;
      let transactionLedger = 1000;
      
      if (accountInfo && 'account_data' in accountInfo && accountInfo.account_data) {
        transactionSequence = accountInfo.account_data.Sequence || 1;
        transactionLedger = accountInfo.ledger_current_index || accountInfo.ledger_index || 1000;
      }

      let takerGets: any;
      let takerPays: any;

      // Check if quote is XRP (handle both 'XRP' string and empty issuer as XRP indicator)
      const quoteIsXRP = quoteInfo.currency === 'XRP' || quoteAsset === 'XRP';
      const baseIsXRP = baseInfo.currency === 'XRP' || baseAsset === 'XRP';

      if (orderSide === 'buy') {
        if (quoteIsXRP) {
          const drops = xrplClient.convertXRPToDrops(calculatedTotal);
          if (drops === '0' || parseInt(drops) === 0) {
            toast({
              title: "Amount Too Small",
              description: "XRP total rounds to 0 drops. Increase the amount or price.",
              variant: "destructive",
            });
            return;
          }
          takerGets = drops;
        } else {
          takerGets = { currency: quoteInfo.currency, issuer: quoteInfo.issuer, value: calculatedTotal };
        }
        
        if (baseIsXRP) {
          const drops = xrplClient.convertXRPToDrops(amount);
          if (drops === '0' || parseInt(drops) === 0) {
            toast({
              title: "Amount Too Small",
              description: "XRP amount rounds to 0 drops. Increase the amount.",
              variant: "destructive",
            });
            return;
          }
          takerPays = drops;
        } else {
          takerPays = { currency: baseInfo.currency, issuer: baseInfo.issuer, value: amount };
        }
      } else {
        if (baseIsXRP) {
          const drops = xrplClient.convertXRPToDrops(amount);
          if (drops === '0' || parseInt(drops) === 0) {
            toast({
              title: "Amount Too Small",
              description: "XRP amount rounds to 0 drops. Increase the amount.",
              variant: "destructive",
            });
            return;
          }
          takerGets = drops;
        } else {
          takerGets = { currency: baseInfo.currency, issuer: baseInfo.issuer, value: amount };
        }
        
        if (quoteIsXRP) {
          const drops = xrplClient.convertXRPToDrops(calculatedTotal);
          if (drops === '0' || parseInt(drops) === 0) {
            toast({
              title: "Amount Too Small",
              description: "XRP total rounds to 0 drops. Increase the amount or price.",
              variant: "destructive",
            });
            return;
          }
          takerPays = drops;
        } else {
          takerPays = { currency: quoteInfo.currency, issuer: quoteInfo.issuer, value: calculatedTotal };
        }
      }

      if (!currentWallet.publicKey) {
        toast({
          title: "Missing Public Key",
          description: "This wallet is missing its public key. Please reconnect your Keystone device to fix this.",
          variant: "destructive",
        });
        return;
      }

      const transaction: any = {
        TransactionType: 'OfferCreate',
        Account: currentWallet.address,
        TakerGets: takerGets,
        TakerPays: takerPays,
        Sequence: transactionSequence,
        LastLedgerSequence: transactionLedger + 1000,
        Fee: '12',
        Flags: 2147483648, // tfFullyCanonicalSig - required by Keystone 3 Pro
        SigningPubKey: currentWallet.publicKey
      };

      const userFlags = calculateFlags();
      if (userFlags !== undefined) {
        // Use >>> 0 to ensure unsigned 32-bit integer (JavaScript bitwise ops use signed 32-bit)
        transaction.Flags = (transaction.Flags | userFlags) >>> 0;
      }

      if (expirationDays) {
        const rippleEpoch = 946684800;
        const nowInSeconds = Math.floor(Date.now() / 1000);
        const expirationTime = nowInSeconds + (parseInt(expirationDays) * 24 * 60 * 60);
        transaction.Expiration = expirationTime - rippleEpoch;
      }

      const keystoneUR = await encodeOfferTransaction(transaction);
      
      setTransactionUR(keystoneUR);
      setUnsignedTransaction(transaction);
      setTransactionType('OfferCreate');
      setShowSigner(true);

    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create offer",
        variant: "destructive",
      });
    }
  }, [currentWallet, accountInfo, toast]);

  const handleCancelOffer = useCallback(async (offerSequence: number) => {
    if (!currentWallet) return;

    if (!currentWallet.publicKey) {
      toast({
        title: "Missing Public Key",
        description: "This wallet is missing its public key. Please reconnect your Keystone device to fix this.",
        variant: "destructive",
      });
      return;
    }

    try {
      let transactionSequence = 1;
      let transactionLedger = 1000;
      
      if (accountInfo && 'account_data' in accountInfo && accountInfo.account_data) {
        transactionSequence = accountInfo.account_data.Sequence || 1;
        transactionLedger = accountInfo.ledger_current_index || accountInfo.ledger_index || 1000;
      }

      const transaction = {
        TransactionType: 'OfferCancel',
        Account: currentWallet.address,
        OfferSequence: Number(offerSequence), // Ensure numeric type for Keystone
        Sequence: transactionSequence,
        LastLedgerSequence: transactionLedger + 1000,
        Fee: '12',
        Flags: 2147483648, // tfFullyCanonicalSig - required by Keystone 3 Pro
        SigningPubKey: currentWallet.publicKey
      };

      const keystoneUR = await encodeOfferTransaction(transaction);
      
      setTransactionUR(keystoneUR);
      setUnsignedTransaction(transaction);
      setTransactionType('OfferCancel');
      setOfferToCancel({ sequence: offerSequence });
      setShowSigner(true);

    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel offer",
        variant: "destructive",
      });
    }
  }, [currentWallet, accountInfo, toast]);

  const handleSigningSuccess = useCallback(async (txHash: string, onSuccess?: () => void) => {
    if (transactionType === 'OfferCreate' && unsignedTransaction && currentWallet) {
      const storedOffer: StoredOffer = {
        sequence: unsignedTransaction.Sequence,
        walletAddress: currentWallet.address,
        network: network,
        originalTakerGets: unsignedTransaction.TakerGets,
        originalTakerPays: unsignedTransaction.TakerPays,
        createdAt: Date.now(),
        createdTxHash: txHash,
        createdLedgerIndex: unsignedTransaction.LastLedgerSequence ? unsignedTransaction.LastLedgerSequence - 1000 : 0,
        fills: [],
        expiration: unsignedTransaction.Expiration,
        flags: unsignedTransaction.Flags
      };
      
      browserStorage.saveOffer(storedOffer);
    }
    
    if (currentWallet) {
      setTimeout(async () => {
        await queryClient.refetchQueries({ 
          predicate: (query) => 
            query.queryKey[0] === 'accountOffers' && 
            query.queryKey[1] === currentWallet.address 
        });
      }, 4000);
    }
    
    setShowSigner(false);
    setTransactionUR(null);
    setUnsignedTransaction(null);
    setOfferToCancel(null);
    
    toast({
      title: transactionType === 'OfferCreate' ? "Offer Created" : "Offer Cancelled",
      description: transactionType === 'OfferCreate' 
        ? "Your order has been placed on the DEX"
        : "Your order has been cancelled",
    });

    if (onSuccess) {
      onSuccess();
    }
  }, [transactionType, unsignedTransaction, currentWallet, network, toast]);

  const handleSignerClose = useCallback(() => {
    setShowSigner(false);
    setTransactionUR(null);
    setUnsignedTransaction(null);
    setOfferToCancel(null);
  }, []);

  return {
    showSigner,
    transactionUR,
    unsignedTransaction,
    transactionType,
    offerToCancel,
    handleCreateOffer,
    handleCancelOffer,
    handleSigningSuccess,
    handleSignerClose,
  };
}
