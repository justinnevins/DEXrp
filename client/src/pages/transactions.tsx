import { ArrowUp, ArrowDown, Filter, ArrowLeftRight, Settings, Link, ShieldCheck, Key, Users, Clock, CreditCard, CheckCircle, Ticket, Image, Droplets, FileText, Lock, Unlock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWallet, useTransactions } from '@/hooks/use-wallet';
import { useAccountTransactions } from '@/hooks/use-xrpl';
import { xrplClient } from '@/lib/xrpl-client';
import { extractOfferFills, calculateBalanceChanges, enrichOfferWithStatus } from '@/lib/dex-utils';
import { browserStorage } from '@/lib/browser-storage';
import { EXPLORER_URLS } from '@/lib/constants';
import { truncateAddress } from '@/lib/format-address';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useEffect, useState, useRef } from 'react';

// Helper to get human-readable transaction type labels
function getTransactionLabel(tx: any): string {
  if (tx.type === 'sent') return 'Sent';
  if (tx.type === 'received') return 'Received';
  if (tx.type === 'dex-fill') {
    // Check if this is an instant trade (our own OfferCreate that was immediately filled)
    if (tx.transactionType === 'DEX Trade') return 'DEX Trade';
    return 'DEX Fill';
  }
  if (tx.type === 'exchange') {
    if (tx.transactionType === 'OfferCreate') return 'DEX Offer Created';
    if (tx.transactionType === 'OfferCancel') return 'DEX Offer Cancelled';
    return 'DEX Trade';
  }
  if (tx.type === 'trustline') return 'Trust Line';
  if (tx.type === 'account-set') return 'Account Settings';
  if (tx.type === 'regular-key') return 'Regular Key';
  if (tx.type === 'signer-list') return 'Multi-Signature';
  if (tx.type === 'escrow') return tx.transactionType?.replace('Escrow', 'Escrow ') || 'Escrow';
  if (tx.type === 'payment-channel') return tx.transactionType?.replace('PaymentChannel', 'Channel ') || 'Payment Channel';
  if (tx.type === 'check') return tx.transactionType?.replace('Check', 'Check ') || 'Check';
  if (tx.type === 'ticket') return 'Ticket Created';
  if (tx.type === 'deposit-preauth') return 'Deposit Auth';
  if (tx.type === 'nft') {
    const nftType = tx.transactionType?.replace('NFToken', '') || '';
    return `NFT ${nftType}`;
  }
  if (tx.type === 'uri-token') return 'URI Token';
  if (tx.type === 'amm') {
    const ammType = tx.transactionType?.replace('AMM', '') || '';
    return `AMM ${ammType}`;
  }
  if (tx.type === 'clawback') return 'Clawback';
  if (tx.type === 'other') return tx.transactionType || 'Transaction';
  return tx.transactionType || 'Transaction';
}

export default function Transactions() {
  const [filterType, setFilterType] = useState<'all' | 'sent' | 'received' | 'dex' | 'trustlines' | 'nft' | 'other'>('all');
  const [rawTransactions, setRawTransactions] = useState<any[]>([]);
  const [marker, setMarker] = useState<unknown>(undefined);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  const { currentWallet } = useWallet();
  const network = currentWallet?.network ?? 'mainnet';
  const { data: dbTransactions, isLoading: dbLoading } = useTransactions(currentWallet?.id || null);
  const { data: xrplTransactions, isLoading: xrplLoading } = useAccountTransactions(currentWallet?.address || null, network);

  const isLoading = dbLoading || xrplLoading;
  
  const prevWalletKeyRef = useRef<string | null>(null);
  const loadedBeyondFirstPageRef = useRef(false);
  const currentWalletKey = currentWallet ? `${currentWallet.id}-${network}` : null;
  
  useEffect(() => {
    if (prevWalletKeyRef.current !== currentWalletKey) {
      if (prevWalletKeyRef.current !== null) {
        setRawTransactions([]);
        setMarker(undefined);
        setHasMore(true);
        loadedBeyondFirstPageRef.current = false;
      }
      prevWalletKeyRef.current = currentWalletKey;
    }
  }, [currentWalletKey]);
  
  useEffect(() => {
    if (xrplTransactions?.transactions) {
      if (!loadedBeyondFirstPageRef.current) {
        setRawTransactions(xrplTransactions.transactions);
        setMarker(xrplTransactions.marker);
        setHasMore(!!xrplTransactions.marker);
      } else {
        setRawTransactions(prev => {
          const existingHashes = new Set(prev.map((tx: any) =>
            tx.hash || tx.tx_json?.hash || tx.tx?.hash
          ));
          const newTxs = xrplTransactions.transactions.filter((tx: any) => {
            const hash = tx.hash || tx.tx_json?.hash || tx.tx?.hash;
            return !existingHashes.has(hash);
          });
          return newTxs.length > 0 ? [...newTxs, ...prev] : prev;
        });
      }
    }
  }, [xrplTransactions]);
  
  const loadMoreTransactions = async () => {
    if (!currentWallet?.address || !marker || isLoadingMore) return;
    
    loadedBeyondFirstPageRef.current = true;
    setIsLoadingMore(true);
    try {
      const result = await xrplClient.getAccountTransactions(currentWallet.address, network, 20, marker);
      if (result?.transactions) {
        setRawTransactions(prev => [...prev, ...result.transactions]);
        setMarker(result.marker);
        setHasMore(!!result.marker);
      }
    } catch (error) {
      console.error('Failed to load more transactions:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };
  const currentNetwork = network;
  
  // Process and save offer fills from transaction metadata (run once when transactions change)
  useEffect(() => {
    if (!rawTransactions.length || !currentWallet) return;
    
    // FIRST PASS: Save all OfferCreate transactions with authoritative original amounts
    // This must happen BEFORE processing fills to avoid creating placeholders with wrong amounts
    rawTransactions.forEach((tx: any) => {
      const transaction = tx.tx_json || tx.tx || tx;
      const txHash = transaction.hash || tx.hash;
      
      if (transaction.TransactionType === 'OfferCreate' && transaction.Account === currentWallet.address) {
        const existingOffer = browserStorage.getOffer(currentWallet.address, network, transaction.Sequence);
        
        // Create or update the stored offer with TRUE original amounts from the transaction
        const storedOffer = {
          sequence: transaction.Sequence,
          walletAddress: currentWallet.address,
          network: network,
          originalTakerGets: transaction.TakerGets,
          originalTakerPays: transaction.TakerPays,
          createdAt: transaction.date ? (transaction.date * 1000 + 946684800000) : Date.now(),
          createdTxHash: txHash,
          createdLedgerIndex: tx.ledger_index || tx.ledger_current_index || 0,
          fills: existingOffer?.fills || [], // Preserve existing fills if any
          expiration: transaction.Expiration,
          flags: transaction.Flags
        };
        
        browserStorage.saveOffer(storedOffer);
      }
    });
    
    // SECOND PASS: Process fills now that all offers have correct original amounts
    rawTransactions.forEach((tx: any) => {
      const offerFills = extractOfferFills(tx, currentWallet.address);
      if (offerFills.length > 0) {
        offerFills.forEach(fill => {
          browserStorage.addOfferFill(currentWallet.address, network, fill.offerSequence, {
            txHash: fill.txHash,
            timestamp: fill.timestamp,
            ledgerIndex: fill.ledgerIndex,
            takerGotAmount: fill.takerGotAmount,
            takerPaidAmount: fill.takerPaidAmount,
            executionPrice: fill.executionPrice
          });
        });
      }
    });
  }, [rawTransactions, currentWallet, network]);
  
  const getXRPScanUrl = (hash: string) => {
    const baseUrl = currentNetwork === 'mainnet' 
      ? EXPLORER_URLS.XRPSCAN_MAINNET 
      : EXPLORER_URLS.XRPSCAN_TESTNET;
    return `${baseUrl}/tx/${hash}`;
  };

  // Combine and format transactions from both sources
  const formatTransactions = () => {
    const transactions: any[] = [];

    // Preload stored offers for enrichment
    const storedOffers = currentWallet 
      ? browserStorage.getOffersByWallet(currentWallet.address, network)
      : [];
    
    // Create maps for quick lookup by both transaction hash AND sequence number
    // (sequence number is more reliable for historical fills that don't have createdTxHash)
    const offersByTxHash = new Map(
      storedOffers
        .filter(offer => offer.createdTxHash) // Only map non-empty tx hashes
        .map(offer => [offer.createdTxHash, offer])
    );
    
    const offersBySequence = new Map(
      storedOffers.map(offer => [offer.sequence, offer])
    );

    // Add XRPL transactions first
    if (rawTransactions.length > 0) {
      rawTransactions.forEach((tx: any) => {
        // Handle both tx.tx_json (historical) and tx structure (real-time)
        const transaction = tx.tx_json || tx.tx || tx;
        
        if (transaction?.TransactionType === 'Payment') {
          // Check if this payment was generated by an offer fill (fills are saved in useEffect)
          const offerFills = currentWallet ? extractOfferFills(tx, currentWallet.address) : [];
          const isDEXFill = offerFills.length > 0;
          
          // Calculate actual balance changes from metadata (more accurate for DEX fills)
          const balanceChanges = currentWallet ? calculateBalanceChanges(tx, currentWallet.address) : { xrpChange: null, tokenChanges: [] };
          
          
          // Skip transactions where current wallet is neither sender nor receiver
          // UNLESS there are balance changes (which means we're involved indirectly via DEX)
          const isSender = transaction.Account === currentWallet?.address;
          const isReceiver = transaction.Destination === currentWallet?.address;
          const hasBalanceChanges = balanceChanges.xrpChange || balanceChanges.tokenChanges.length > 0;
          
          if (!isSender && !isReceiver && !hasBalanceChanges) {
            return; // Skip this transaction
          }
          
          let displayAmount = '';
          let isOutgoing = isSender;
          
          // For DEX fills, show both sides of the trade (what was paid and what was received)
          if (isDEXFill || hasBalanceChanges) {
            const increases: string[] = [];
            const decreases: string[] = [];
            
            // Add XRP changes
            if (balanceChanges.xrpChange) {
              const xrpDisplay = `${balanceChanges.xrpChange.replace('-', '')} XRP`;
              if (balanceChanges.xrpChange.startsWith('-')) {
                decreases.push(xrpDisplay);
              } else {
                increases.push(xrpDisplay);
              }
            }
            
            // Add token changes
            for (const tc of balanceChanges.tokenChanges) {
              const tokenDisplay = `${tc.change.replace('-', '')} ${tc.currency}`;
              if (tc.change.startsWith('-')) {
                decreases.push(tokenDisplay);
              } else {
                increases.push(tokenDisplay);
              }
            }
            
            // Build display showing both sides
            if (decreases.length > 0 && increases.length > 0) {
              displayAmount = `-${decreases.join(', -')} → +${increases.join(', +')}`;
            } else if (increases.length > 0) {
              displayAmount = `+${increases.join(', +')}`;
            } else if (decreases.length > 0) {
              displayAmount = `-${decreases.join(', -')}`;
            }
            
            isOutgoing = decreases.length > 0;
          }
          
          // Fallback to transaction amount for regular payments
          if (!displayAmount) {
            let amountField = transaction.DeliverMax || transaction.Amount;
            
            // Check if this is a path payment (has delivered_amount in metadata)
            if (tx.meta && tx.meta.delivered_amount) {
              amountField = tx.meta.delivered_amount;
            }
            
            let amount = '0';
            let currency = 'XRP';
            
            if (typeof amountField === 'string') {
              // XRP payment (in drops)
              amount = xrplClient.formatXRPAmount(amountField);
              currency = 'XRP';
            } else if (typeof amountField === 'object' && amountField.value) {
              // Token payment
              amount = amountField.value;
              currency = xrplClient.decodeCurrency(amountField.currency);
            }
            
            displayAmount = `${isOutgoing ? '-' : '+'}${amount} ${currency}`;
          }
          
          transactions.push({
            id: transaction.hash || tx.hash,
            type: isDEXFill ? 'dex-fill' : (isOutgoing ? 'sent' : 'received'),
            amount: displayAmount,
            address: isOutgoing ? transaction.Destination : transaction.Account,
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: isDEXFill ? ArrowLeftRight : (isOutgoing ? ArrowUp : ArrowDown),
            isDEXFill,
            iconBg: isDEXFill ? 'bg-purple-100 dark:bg-purple-900/30' : (isOutgoing ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'),
            iconColor: isDEXFill ? 'text-purple-600 dark:text-purple-400' : (isOutgoing ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'),
            amountColor: isDEXFill ? 'text-purple-600 dark:text-purple-400' : (isOutgoing ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'),
          });
        } else if (transaction?.TransactionType === 'OfferCreate' || transaction?.TransactionType === 'OfferCancel') {
          // Handle DEX offer transactions
          if (transaction.TransactionType === 'OfferCancel') {
            // OfferCancel only has OfferSequence, not TakerGets/TakerPays
            transactions.push({
              id: transaction.hash || tx.hash,
              type: 'exchange',
              transactionType: transaction.TransactionType,
              amount: `Offer #${transaction.OfferSequence || 'Unknown'}`,
              paidAmount: '',
              receivedAmount: '',
              address: 'DEX Trading',
              time: new Date((transaction.date || 0) * 1000 + 946684800000),
              hash: transaction.hash || tx.hash,
              status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
              icon: ArrowLeftRight,
              iconBg: 'bg-blue-100 dark:bg-blue-900/30',
              iconColor: 'text-blue-600 dark:text-blue-400',
              amountColor: 'text-blue-600 dark:text-blue-400',
            });
          } else {
            // OfferCreate has TakerGets/TakerPays
            const takerGets = transaction.TakerGets;
            const takerPays = transaction.TakerPays;
            const txHash = transaction.hash || tx.hash;
            
            if (takerGets && takerPays) {
              // Check if this OfferCreate is from another wallet
              const isFromOtherWallet = transaction.Account !== currentWallet?.address;
              
              // Determine what was received and what was paid
              let getsAmount = '0';
              let getsCurrency = 'XRP';
              let paysAmount = '0';
              let paysCurrency = 'XRP';
              
              // Determine which of our offers was filled (if from other wallet)
              let filledOfferSequences: number[] = [];
              if (isFromOtherWallet) {
                const offerFills = extractOfferFills(tx, currentWallet!.address);
                filledOfferSequences = offerFills.map(fill => fill.offerSequence);
              }
              
              // For all OfferCreate transactions, use actual balance changes to show what really happened
              const balanceChanges = calculateBalanceChanges(tx, currentWallet!.address);
              
              // Track if we found actual balance changes (indicating the offer was filled)
              let hasBalanceChanges = balanceChanges.xrpChange || balanceChanges.tokenChanges.length > 0;
              
              if (hasBalanceChanges) {
                // Extract what was paid (decreased) and received (increased) from actual balance changes
                
                // Check XRP changes
                if (balanceChanges.xrpChange) {
                  const xrpAmount = balanceChanges.xrpChange.replace('-', '');
                  if (balanceChanges.xrpChange.startsWith('-')) {
                    // XRP was paid (we spent XRP)
                    getsAmount = xrpAmount;
                    getsCurrency = 'XRP';
                  } else {
                    // XRP was received (we got XRP)
                    paysAmount = xrpAmount;
                    paysCurrency = 'XRP';
                  }
                }
                
                // Check token changes
                balanceChanges.tokenChanges.forEach(tokenChange => {
                  const amount = tokenChange.change.replace('-', '');
                  const currency = xrplClient.decodeCurrency(tokenChange.currency);
                  
                  if (tokenChange.change.startsWith('-')) {
                    // Token was paid (we spent token)
                    getsAmount = amount;
                    getsCurrency = currency;
                  } else {
                    // Token was received (we got token)
                    paysAmount = amount;
                    paysCurrency = currency;
                  }
                });
              } else if (!isFromOtherWallet) {
                // No balance changes detected - show the submitted offer amounts (unfilled offer)
                // Parse TakerGets (what taker gets = what YOU pay as offer creator)
                if (typeof takerGets === 'string') {
                  getsAmount = xrplClient.formatXRPAmount(takerGets);
                  getsCurrency = 'XRP';
                } else if (typeof takerGets === 'object' && takerGets.value) {
                  getsAmount = takerGets.value;
                  getsCurrency = xrplClient.decodeCurrency(takerGets.currency);
                }
                
                // Parse TakerPays (what taker pays = what YOU receive as offer creator)
                if (typeof takerPays === 'string') {
                  paysAmount = xrplClient.formatXRPAmount(takerPays);
                  paysCurrency = 'XRP';
                } else if (typeof takerPays === 'object' && takerPays.value) {
                  paysAmount = takerPays.value;
                  paysCurrency = xrplClient.decodeCurrency(takerPays.currency);
                }
              }
              
              // Check if we have this offer stored and enrich with fill status (only for our own offers)
              let storedOffer = null;
              if (!isFromOtherWallet) {
                // Try lookup by transaction hash first, then by sequence number
                storedOffer = offersByTxHash.get(txHash);
                
                if (!storedOffer && transaction.Sequence) {
                  storedOffer = offersBySequence.get(transaction.Sequence);
                }
              }
              
              // Round amounts to 4 decimal places
              const roundedGetsAmount = parseFloat(getsAmount).toFixed(4);
              const roundedPaysAmount = parseFloat(paysAmount).toFixed(4);
              
              // Calculate price per XRP
              let pricePerXRP = '';
              if (getsCurrency === 'XRP' && paysCurrency !== 'XRP') {
                // Paying XRP, receiving token: price = token/XRP
                const price = parseFloat(paysAmount) / parseFloat(getsAmount);
                pricePerXRP = `Price: ${price.toFixed(4)} ${paysCurrency} /XRP`;
              } else if (paysCurrency === 'XRP' && getsCurrency !== 'XRP') {
                // Receiving XRP, paying token: price = token/XRP
                const price = parseFloat(getsAmount) / parseFloat(paysAmount);
                pricePerXRP = `Price: ${price.toFixed(4)} ${getsCurrency} /XRP`;
              }
              
              let displayAmount = '';
              let displayAddress = 'DEX Trading';
              let transactionTypeOverride: string | undefined;
              
              if (isFromOtherWallet && filledOfferSequences.length > 0) {
                // Show which of our offers was filled by another wallet's OfferCreate
                const offerSeqDisplay = filledOfferSequences.length === 1 
                  ? `Offer #${filledOfferSequences[0]}`
                  : `Offers #${filledOfferSequences.join(', #')}`;
                displayAddress = `Partial Fill - ${offerSeqDisplay}`;
                // For fills, highlight the received amount in green
                displayAmount = `Paid: ${roundedGetsAmount} ${getsCurrency} - <span class="text-green-600 dark:text-green-400">Received: ${roundedPaysAmount} ${paysCurrency}</span>`;
                if (pricePerXRP) {
                  displayAmount += `<br/>${pricePerXRP}`;
                }
              } else if (!isFromOtherWallet && hasBalanceChanges) {
                // Our own OfferCreate that was immediately filled (taker trade)
                // Show the actual amounts traded with "Traded" label
                displayAddress = `DEX Trade`;
                transactionTypeOverride = 'DEX Trade';
                displayAmount = `Paid: ${roundedGetsAmount} ${getsCurrency} - <span class="text-green-600 dark:text-green-400">Received: ${roundedPaysAmount} ${paysCurrency}</span>`;
                if (pricePerXRP) {
                  displayAmount += `<br/>${pricePerXRP}`;
                }
              } else if (!isFromOtherWallet) {
                // Our own OfferCreate that created an offer on the book (unfilled or partial)
                displayAddress = `Offer #${transaction.Sequence}`;
                displayAmount = `Pay: ${roundedGetsAmount} ${getsCurrency} to Receive: ${roundedPaysAmount} ${paysCurrency}`;
                if (pricePerXRP) {
                  displayAmount += `<br/>${pricePerXRP}`;
                }
                
                // Add fill status if there are fills from stored offer data
                if (storedOffer && storedOffer.fills.length > 0) {
                  const enriched = enrichOfferWithStatus(storedOffer);
                  const fillStatus = enriched.isFullyExecuted 
                    ? 'Fully Filled'
                    : `${enriched.fillPercentage.toFixed(0)}% Filled`;
                  displayAmount = `${fillStatus} - ${displayAmount}`;
                }
              } else {
                // Other wallet's OfferCreate that didn't fill our offers
                displayAmount = `Pay: ${roundedGetsAmount} ${getsCurrency} to Receive: ${roundedPaysAmount} ${paysCurrency}`;
                if (pricePerXRP) {
                  displayAmount += `<br/>${pricePerXRP}`;
                }
              }
              
              // Use green styling for filled trades to indicate XRP/tokens received
              const isFilled = hasBalanceChanges && !isFromOtherWallet;
              
              transactions.push({
                id: txHash,
                type: isFilled ? 'dex-fill' : 'exchange',
                transactionType: transactionTypeOverride || transaction.TransactionType,
                amount: displayAmount,
                paidAmount: `${getsAmount} ${getsCurrency}`,
                receivedAmount: `${paysAmount} ${paysCurrency}`,
                address: displayAddress,
                time: new Date((transaction.date || 0) * 1000 + 946684800000),
                hash: txHash,
                status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
                icon: ArrowLeftRight,
                iconBg: isFilled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-blue-100 dark:bg-blue-900/30',
                iconColor: isFilled ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400',
                amountColor: isFilled ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400',
              });
            }
          }
        } else if (transaction?.TransactionType === 'TrustSet') {
          // TrustSet - Adding or modifying trust lines
          const limitAmount = transaction.LimitAmount;
          let currency = 'Unknown';
          let issuer = 'Unknown';
          let limit = '0';
          
          if (typeof limitAmount === 'object' && limitAmount.currency) {
            currency = xrplClient.decodeCurrency(limitAmount.currency);
            issuer = limitAmount.issuer || 'Unknown';
            limit = limitAmount.value || '0';
          }
          
          const isRemovingTrust = limit === '0';
          
          transactions.push({
            id: transaction.hash || tx.hash,
            type: 'trustline',
            transactionType: 'TrustSet',
            amount: isRemovingTrust ? `Removed ${currency} trustline` : `Set ${currency} limit: ${limit}`,
            address: `Issuer: ${truncateAddress(issuer)}`,
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: isRemovingTrust ? X : Link,
            iconBg: isRemovingTrust ? 'bg-red-100 dark:bg-red-900/30' : 'bg-cyan-100 dark:bg-cyan-900/30',
            iconColor: isRemovingTrust ? 'text-red-600 dark:text-red-400' : 'text-cyan-600 dark:text-cyan-400',
            amountColor: isRemovingTrust ? 'text-red-600 dark:text-red-400' : 'text-cyan-600 dark:text-cyan-400',
          });
        } else if (transaction?.TransactionType === 'AccountSet') {
          // AccountSet - Account settings changes
          let description = 'Account settings updated';
          
          // Check for common account flags
          if (transaction.SetFlag !== undefined || transaction.ClearFlag !== undefined) {
            const flagDescriptions: Record<number, string> = {
              1: 'Require Destination Tag',
              2: 'Require Authorization',
              3: 'Disallow XRP',
              4: 'Disable Master Key',
              5: 'Account Transaction ID',
              6: 'No Freeze',
              7: 'Global Freeze',
              8: 'Default Ripple',
              9: 'Deposit Auth',
              10: 'Authorized NFT Minter',
              12: 'Disallow Incoming NFT Offers',
              13: 'Disallow Incoming Checks',
              14: 'Disallow Incoming Payment Channels',
              15: 'Disallow Incoming Trust Lines',
              16: 'Allow Trustline Clawback',
            };
            
            if (transaction.SetFlag !== undefined) {
              description = `Enabled: ${flagDescriptions[transaction.SetFlag] || `Flag ${transaction.SetFlag}`}`;
            } else if (transaction.ClearFlag !== undefined) {
              description = `Disabled: ${flagDescriptions[transaction.ClearFlag] || `Flag ${transaction.ClearFlag}`}`;
            }
          } else if (transaction.Domain) {
            description = 'Domain updated';
          } else if (transaction.EmailHash) {
            description = 'Email hash updated';
          } else if (transaction.MessageKey) {
            description = 'Message key updated';
          } else if (transaction.TransferRate) {
            description = `Transfer rate: ${(transaction.TransferRate / 1000000000 * 100 - 100).toFixed(2)}%`;
          }
          
          transactions.push({
            id: transaction.hash || tx.hash,
            type: 'account-set',
            transactionType: 'AccountSet',
            amount: description,
            address: 'Account Configuration',
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: Settings,
            iconBg: 'bg-gray-100 dark:bg-gray-800',
            iconColor: 'text-gray-600 dark:text-gray-400',
            amountColor: 'text-gray-600 dark:text-gray-400',
          });
        } else if (transaction?.TransactionType === 'SetRegularKey') {
          // SetRegularKey - Setting a regular key for the account
          const hasKey = !!transaction.RegularKey;
          
          transactions.push({
            id: transaction.hash || tx.hash,
            type: 'regular-key',
            transactionType: 'SetRegularKey',
            amount: hasKey ? 'Regular key set' : 'Regular key removed',
            address: hasKey ? `Key: ${truncateAddress(transaction.RegularKey)}` : 'Security Update',
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: Key,
            iconBg: 'bg-amber-100 dark:bg-amber-900/30',
            iconColor: 'text-amber-600 dark:text-amber-400',
            amountColor: 'text-amber-600 dark:text-amber-400',
          });
        } else if (transaction?.TransactionType === 'SignerListSet') {
          // SignerListSet - Multi-signature configuration
          const signerCount = transaction.SignerEntries?.length || 0;
          const quorum = transaction.SignerQuorum || 0;
          
          transactions.push({
            id: transaction.hash || tx.hash,
            type: 'signer-list',
            transactionType: 'SignerListSet',
            amount: signerCount > 0 ? `Multi-sig: ${signerCount} signers, quorum ${quorum}` : 'Multi-sig removed',
            address: 'Multi-signature Setup',
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: Users,
            iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
            iconColor: 'text-indigo-600 dark:text-indigo-400',
            amountColor: 'text-indigo-600 dark:text-indigo-400',
          });
        } else if (transaction?.TransactionType?.startsWith('Escrow')) {
          // Escrow transactions
          let amount = '0 XRP';
          if (transaction.Amount) {
            amount = `${xrplClient.formatXRPAmount(transaction.Amount)} XRP`;
          }
          
          let escrowType = transaction.TransactionType.replace('Escrow', '');
          let IconComponent = Clock;
          let bgColor = 'bg-orange-100 dark:bg-orange-900/30';
          let textColor = 'text-orange-600 dark:text-orange-400';
          
          if (escrowType === 'Create') {
            IconComponent = Lock;
          } else if (escrowType === 'Finish') {
            IconComponent = Unlock;
            bgColor = 'bg-green-100 dark:bg-green-900/30';
            textColor = 'text-green-600 dark:text-green-400';
          } else if (escrowType === 'Cancel') {
            IconComponent = X;
            bgColor = 'bg-red-100 dark:bg-red-900/30';
            textColor = 'text-red-600 dark:text-red-400';
          }
          
          transactions.push({
            id: transaction.hash || tx.hash,
            type: 'escrow',
            transactionType: transaction.TransactionType,
            amount: `Escrow ${escrowType}: ${amount}`,
            address: transaction.Destination ? `To: ${truncateAddress(transaction.Destination)}` : 'Escrow',
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: IconComponent,
            iconBg: bgColor,
            iconColor: textColor,
            amountColor: textColor,
          });
        } else if (transaction?.TransactionType?.startsWith('PaymentChannel')) {
          // Payment Channel transactions
          let amount = '';
          if (transaction.Amount) {
            amount = `${xrplClient.formatXRPAmount(transaction.Amount)} XRP`;
          } else if (transaction.Balance) {
            amount = `${xrplClient.formatXRPAmount(transaction.Balance)} XRP`;
          }
          
          let channelType = transaction.TransactionType.replace('PaymentChannel', '');
          
          transactions.push({
            id: transaction.hash || tx.hash,
            type: 'payment-channel',
            transactionType: transaction.TransactionType,
            amount: `Channel ${channelType}${amount ? `: ${amount}` : ''}`,
            address: transaction.Destination ? `To: ${truncateAddress(transaction.Destination)}` : 'Payment Channel',
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: CreditCard,
            iconBg: 'bg-violet-100 dark:bg-violet-900/30',
            iconColor: 'text-violet-600 dark:text-violet-400',
            amountColor: 'text-violet-600 dark:text-violet-400',
          });
        } else if (transaction?.TransactionType?.startsWith('Check')) {
          // Check transactions
          let amount = '';
          if (transaction.SendMax) {
            if (typeof transaction.SendMax === 'string') {
              amount = `${xrplClient.formatXRPAmount(transaction.SendMax)} XRP`;
            } else if (transaction.SendMax.value) {
              amount = `${transaction.SendMax.value} ${xrplClient.decodeCurrency(transaction.SendMax.currency)}`;
            }
          } else if (transaction.Amount) {
            if (typeof transaction.Amount === 'string') {
              amount = `${xrplClient.formatXRPAmount(transaction.Amount)} XRP`;
            } else if (transaction.Amount.value) {
              amount = `${transaction.Amount.value} ${xrplClient.decodeCurrency(transaction.Amount.currency)}`;
            }
          }
          
          let checkType = transaction.TransactionType.replace('Check', '');
          let IconComponent = CheckCircle;
          let bgColor = 'bg-teal-100 dark:bg-teal-900/30';
          let textColor = 'text-teal-600 dark:text-teal-400';
          
          if (checkType === 'Cancel') {
            IconComponent = X;
            bgColor = 'bg-red-100 dark:bg-red-900/30';
            textColor = 'text-red-600 dark:text-red-400';
          }
          
          transactions.push({
            id: transaction.hash || tx.hash,
            type: 'check',
            transactionType: transaction.TransactionType,
            amount: `Check ${checkType}${amount ? `: ${amount}` : ''}`,
            address: transaction.Destination ? `To: ${truncateAddress(transaction.Destination)}` : 'Check',
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: IconComponent,
            iconBg: bgColor,
            iconColor: textColor,
            amountColor: textColor,
          });
        } else if (transaction?.TransactionType === 'TicketCreate') {
          // Ticket creation
          const ticketCount = transaction.TicketCount || 1;
          
          transactions.push({
            id: transaction.hash || tx.hash,
            type: 'ticket',
            transactionType: 'TicketCreate',
            amount: `Created ${ticketCount} ticket${ticketCount > 1 ? 's' : ''}`,
            address: 'Ticket Reservation',
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: Ticket,
            iconBg: 'bg-pink-100 dark:bg-pink-900/30',
            iconColor: 'text-pink-600 dark:text-pink-400',
            amountColor: 'text-pink-600 dark:text-pink-400',
          });
        } else if (transaction?.TransactionType === 'DepositPreauth') {
          // Deposit preauthorization
          const isAuthorize = !!transaction.Authorize;
          
          transactions.push({
            id: transaction.hash || tx.hash,
            type: 'deposit-preauth',
            transactionType: 'DepositPreauth',
            amount: isAuthorize ? 'Deposit authorized' : 'Authorization removed',
            address: `Account: ${truncateAddress(transaction.Authorize || transaction.Unauthorize || '')}`,
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: ShieldCheck,
            iconBg: isAuthorize ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30',
            iconColor: isAuthorize ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
            amountColor: isAuthorize ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
          });
        } else if (transaction?.TransactionType?.startsWith('NFToken')) {
          // NFT transactions
          let nftType = transaction.TransactionType.replace('NFToken', '');
          let description = `NFT ${nftType}`;
          let IconComponent = Image;
          let bgColor = 'bg-fuchsia-100 dark:bg-fuchsia-900/30';
          let textColor = 'text-fuchsia-600 dark:text-fuchsia-400';
          
          if (nftType === 'Mint') {
            description = 'NFT Minted';
          } else if (nftType === 'Burn') {
            description = 'NFT Burned';
            bgColor = 'bg-red-100 dark:bg-red-900/30';
            textColor = 'text-red-600 dark:text-red-400';
          } else if (nftType === 'CreateOffer') {
            description = transaction.Flags & 1 ? 'NFT Sell Offer' : 'NFT Buy Offer';
          } else if (nftType === 'AcceptOffer') {
            description = 'NFT Offer Accepted';
            bgColor = 'bg-green-100 dark:bg-green-900/30';
            textColor = 'text-green-600 dark:text-green-400';
          } else if (nftType === 'CancelOffer') {
            description = 'NFT Offer Cancelled';
            bgColor = 'bg-gray-100 dark:bg-gray-800';
            textColor = 'text-gray-600 dark:text-gray-400';
          }
          
          // Add price if available
          if (transaction.Amount) {
            if (typeof transaction.Amount === 'string') {
              description += ` - ${xrplClient.formatXRPAmount(transaction.Amount)} XRP`;
            } else if (transaction.Amount.value) {
              description += ` - ${transaction.Amount.value} ${xrplClient.decodeCurrency(transaction.Amount.currency)}`;
            }
          }
          
          transactions.push({
            id: transaction.hash || tx.hash,
            type: 'nft',
            transactionType: transaction.TransactionType,
            amount: description,
            address: transaction.NFTokenID ? `Token: ${truncateAddress(transaction.NFTokenID)}` : 'NFT',
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: IconComponent,
            iconBg: bgColor,
            iconColor: textColor,
            amountColor: textColor,
          });
        } else if (transaction?.TransactionType?.startsWith('URIToken')) {
          // URI Token transactions
          let uriType = transaction.TransactionType.replace('URIToken', '');
          
          transactions.push({
            id: transaction.hash || tx.hash,
            type: 'uri-token',
            transactionType: transaction.TransactionType,
            amount: `URI Token ${uriType}`,
            address: 'URI Token',
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: FileText,
            iconBg: 'bg-slate-100 dark:bg-slate-800',
            iconColor: 'text-slate-600 dark:text-slate-400',
            amountColor: 'text-slate-600 dark:text-slate-400',
          });
        } else if (transaction?.TransactionType?.startsWith('AMM')) {
          // AMM (Automated Market Maker) transactions
          let ammType = transaction.TransactionType.replace('AMM', '');
          let description = `AMM ${ammType}`;
          let IconComponent = Droplets;
          let bgColor = 'bg-sky-100 dark:bg-sky-900/30';
          let textColor = 'text-sky-600 dark:text-sky-400';
          
          // Parse amounts if available
          const amounts: string[] = [];
          if (transaction.Amount) {
            if (typeof transaction.Amount === 'string') {
              amounts.push(`${xrplClient.formatXRPAmount(transaction.Amount)} XRP`);
            } else if (transaction.Amount.value) {
              amounts.push(`${transaction.Amount.value} ${xrplClient.decodeCurrency(transaction.Amount.currency)}`);
            }
          }
          if (transaction.Amount2) {
            if (typeof transaction.Amount2 === 'string') {
              amounts.push(`${xrplClient.formatXRPAmount(transaction.Amount2)} XRP`);
            } else if (transaction.Amount2.value) {
              amounts.push(`${transaction.Amount2.value} ${xrplClient.decodeCurrency(transaction.Amount2.currency)}`);
            }
          }
          
          if (amounts.length > 0) {
            description += `: ${amounts.join(' + ')}`;
          }
          
          if (ammType === 'Delete') {
            bgColor = 'bg-red-100 dark:bg-red-900/30';
            textColor = 'text-red-600 dark:text-red-400';
          } else if (ammType === 'Withdraw') {
            bgColor = 'bg-orange-100 dark:bg-orange-900/30';
            textColor = 'text-orange-600 dark:text-orange-400';
          }
          
          transactions.push({
            id: transaction.hash || tx.hash,
            type: 'amm',
            transactionType: transaction.TransactionType,
            amount: description,
            address: 'Liquidity Pool',
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: IconComponent,
            iconBg: bgColor,
            iconColor: textColor,
            amountColor: textColor,
          });
        } else if (transaction?.TransactionType === 'Clawback') {
          // Clawback transaction
          let amount = '';
          if (transaction.Amount) {
            if (typeof transaction.Amount === 'object' && transaction.Amount.value) {
              amount = `${transaction.Amount.value} ${xrplClient.decodeCurrency(transaction.Amount.currency)}`;
            }
          }
          
          transactions.push({
            id: transaction.hash || tx.hash,
            type: 'clawback',
            transactionType: 'Clawback',
            amount: `Clawback${amount ? `: ${amount}` : ''}`,
            address: transaction.Amount?.issuer ? `From: ${truncateAddress(transaction.Amount.issuer)}` : 'Clawback',
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: ArrowDown,
            iconBg: 'bg-red-100 dark:bg-red-900/30',
            iconColor: 'text-red-600 dark:text-red-400',
            amountColor: 'text-red-600 dark:text-red-400',
          });
        } else if (transaction?.TransactionType) {
          // Catch-all for any other transaction types not explicitly handled
          transactions.push({
            id: transaction.hash || tx.hash,
            type: 'other',
            transactionType: transaction.TransactionType,
            amount: transaction.TransactionType,
            address: 'Transaction',
            time: new Date((transaction.date || 0) * 1000 + 946684800000),
            hash: transaction.hash || tx.hash,
            status: tx.meta?.TransactionResult === 'tesSUCCESS' ? 'confirmed' : 'failed',
            icon: FileText,
            iconBg: 'bg-gray-100 dark:bg-gray-800',
            iconColor: 'text-gray-600 dark:text-gray-400',
            amountColor: 'text-gray-600 dark:text-gray-400',
          });
        }
      });
    }

    // Add database transactions if no XRPL data
    if (transactions.length === 0 && dbTransactions) {
      dbTransactions.forEach((tx) => {
        const isOutgoing = tx.type === 'sent';
        transactions.push({
          id: tx.id.toString(),
          type: tx.type,
          amount: `${isOutgoing ? '-' : '+'}${tx.amount} ${tx.currency}`,
          address: tx.toAddress || tx.fromAddress || 'Unknown',
          time: new Date(tx.createdAt),
          hash: tx.txHash || null,
          status: tx.status,
          icon: isOutgoing ? ArrowUp : ArrowDown,
          iconBg: isOutgoing ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30',
          iconColor: isOutgoing ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
          amountColor: isOutgoing ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
        });
      });
    }

    // Sort by time (newest first)
    return transactions.sort((a, b) => b.time.getTime() - a.time.getTime());
  };

  const allTransactions = formatTransactions();

  // Apply filter
  const transactions = allTransactions.filter(tx => {
    if (filterType === 'all') return true;
    if (filterType === 'sent') return tx.type === 'sent';
    if (filterType === 'received') return tx.type === 'received';
    if (filterType === 'dex') return tx.isDEXFill || tx.type === 'exchange' || tx.type === 'amm';
    if (filterType === 'trustlines') return tx.type === 'trustline';
    if (filterType === 'nft') return tx.type === 'nft' || tx.type === 'uri-token';
    if (filterType === 'other') return ['account-set', 'regular-key', 'signer-list', 'escrow', 'payment-channel', 'check', 'ticket', 'deposit-preauth', 'clawback', 'other'].includes(tx.type);
    return true;
  });


  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'text-green-600 dark:text-green-400';
      case 'pending':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'failed':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Transaction History</h1>
          <Button variant="outline" size="sm" disabled>
            <Filter className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white dark:bg-card border border-border rounded-xl p-4 animate-pulse">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-muted rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded w-24 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-32"></div>
                </div>
                <div>
                  <div className="h-4 bg-muted rounded w-16 mb-1"></div>
                  <div className="h-3 bg-muted rounded w-12"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Transaction History</h1>
        <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
          <SelectTrigger className="w-44">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Transactions</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="dex">DEX & AMM</SelectItem>
            <SelectItem value="trustlines">Trust Lines</SelectItem>
            <SelectItem value="nft">NFTs</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {transactions.length === 0 ? (
        <div className="bg-white dark:bg-card border border-border rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <ArrowLeftRight className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-2">No Transactions Yet</h3>
          <p className="text-muted-foreground text-sm">
            Your transaction history will appear here once you start using your wallet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((transaction) => {
            const Icon = transaction.icon;
            return (
              <div
                key={transaction.id}
                className="bg-white dark:bg-card border border-border rounded-xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 ${transaction.iconBg} rounded-full flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${transaction.iconColor}`} />
                    </div>
                    <div>
                      <p className="font-medium">
                        {getTransactionLabel(transaction)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {transaction.type === 'sent' && `To: ${truncateAddress(transaction.address, 6, 6)}`}
                        {transaction.type === 'received' && `From: ${truncateAddress(transaction.address, 6, 6)}`}
                        {transaction.type === 'dex-fill' && 'Offer executed automatically'}
                        {transaction.type === 'exchange' && transaction.address}
                        {transaction.type === 'trustline' && transaction.address}
                        {transaction.type === 'account-set' && transaction.address}
                        {transaction.type === 'regular-key' && transaction.address}
                        {transaction.type === 'signer-list' && transaction.address}
                        {transaction.type === 'escrow' && transaction.address}
                        {transaction.type === 'payment-channel' && transaction.address}
                        {transaction.type === 'check' && transaction.address}
                        {transaction.type === 'ticket' && transaction.address}
                        {transaction.type === 'deposit-preauth' && transaction.address}
                        {transaction.type === 'nft' && transaction.address}
                        {transaction.type === 'uri-token' && transaction.address}
                        {transaction.type === 'amm' && transaction.address}
                        {transaction.type === 'clawback' && transaction.address}
                        {transaction.type === 'other' && transaction.address}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p 
                      className={`font-semibold ${transaction.amountColor}`}
                      dangerouslySetInnerHTML={{ __html: transaction.amount }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {formatDate(transaction.time)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs mt-3 pt-3 border-t border-border">
                  <span className={`px-2 py-1 rounded-full ${getStatusColor(transaction.status)} bg-muted`}>
                    {transaction.status}
                  </span>
                  {transaction.hash && (
                    <a 
                      href={getXRPScanUrl(transaction.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 font-mono text-xs break-all transition-colors"
                      data-testid={`link-xrpscan-${transaction.hash}`}
                    >
                      {transaction.hash}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          
          {hasMore && transactions.length > 0 && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={loadMoreTransactions}
                disabled={isLoadingMore}
                data-testid="button-load-more-transactions"
              >
                {isLoadingMore ? (
                  <>
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load More'
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
