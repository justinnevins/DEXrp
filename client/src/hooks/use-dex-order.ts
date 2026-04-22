import { useState, useEffect, useCallback } from 'react';
import { xrplClient, type XRPLNetwork } from '@/lib/xrpl-client';
import { 
  calculateTotal, 
  calculateMaxBuy, 
  calculateMaxSell,
  getTokenBalance as getTokenBalanceFromLines
} from '@/lib/order-calculator';
import { 
  analyzeOrderBookDepth, 
  estimateExecution,
  type OrderBookDepth,
  type ExecutionEstimate
} from '@/lib/order-book-depth';
import { XRPL_RESERVES, DEX_DEFAULTS } from '@/lib/constants';
import { parseAsset, getRLUSDAsset, updateAssetForNetwork } from '@/lib/dex-asset-utils';

interface UseDexOrderProps {
  network: XRPLNetwork;
  accountInfo: any;
  accountLines: any;
  accountOffers: any;
}

export function useDexOrder({ network, accountInfo, accountLines, accountOffers }: UseDexOrderProps) {
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'limit' | 'market'>('market');
  const [baseAsset, setBaseAsset] = useState('XRP');
  const [quoteAsset, setQuoteAsset] = useState('');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [total, setTotal] = useState('');
  const [expirationDays, setExpirationDays] = useState('');
  const [limitPriceInitialized, setLimitPriceInitialized] = useState(false);
  
  const [baseReserve, setBaseReserve] = useState(XRPL_RESERVES.BASE_RESERVE);
  const [incrementReserve, setIncrementReserve] = useState(XRPL_RESERVES.INCREMENT_RESERVE);
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tfPassive, setTfPassive] = useState(false);
  const [tfFillOrKill, setTfFillOrKill] = useState(false);
  
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  
  const [slippageTolerance, setSlippageTolerance] = useState(DEX_DEFAULTS.SLIPPAGE_TOLERANCE);
  const [orderBookDepth, setOrderBookDepth] = useState<OrderBookDepth | null>(null);
  const [executionEstimate, setExecutionEstimate] = useState<ExecutionEstimate | null>(null);
  const [isLoadingDepth, setIsLoadingDepth] = useState(false);

  const getXRPBalance = useCallback(() => {
    if (accountInfo && 'account_data' in accountInfo && accountInfo.account_data?.Balance) {
      return xrplClient.formatXRPAmount(accountInfo.account_data.Balance);
    }
    return '0.000000';
  }, [accountInfo]);

  useEffect(() => {
    if (!quoteAsset) {
      setQuoteAsset(getRLUSDAsset(network));
    }
  }, []);

  useEffect(() => {
    const fetchReserves = async () => {
      try {
        const reserves = await xrplClient.getReserveRequirements(network);
        setBaseReserve(reserves.baseReserve);
        setIncrementReserve(reserves.incrementReserve);
      } catch {
      }
    };
    fetchReserves();
  }, [network]);

  useEffect(() => {
    const newBaseAsset = updateAssetForNetwork(baseAsset, network, 'XRP');
    if (newBaseAsset !== baseAsset) {
      setBaseAsset(newBaseAsset);
    }

    const newQuoteAsset = updateAssetForNetwork(quoteAsset, network, getRLUSDAsset(network));
    if (newQuoteAsset !== quoteAsset) {
      setQuoteAsset(newQuoteAsset);
    }
  }, [network]);

  useEffect(() => {
    if (orderType === 'limit' && !limitPriceInitialized && marketPrice) {
      setPrice(marketPrice.toString());
      setLimitPriceInitialized(true);
    } else if (orderType === 'market') {
      setLimitPriceInitialized(false);
      if (marketPrice) {
        setPrice(marketPrice.toString());
        if (amount) {
          const newTotal = calculateTotal(amount, marketPrice.toString());
          setTotal(newTotal);
        }
      }
    }
  }, [orderType, marketPrice, limitPriceInitialized, amount]);

  useEffect(() => {
    if (amount && price) {
      const newTotal = calculateTotal(amount, price);
      setTotal(newTotal);
    } else if (!price) {
      setTotal('');
    }
  }, [amount, price]);

  const handleAmountChange = useCallback((value: string) => {
    setAmount(value);
    if (price && value) {
      const newTotal = calculateTotal(value, price);
      setTotal(newTotal);
    }
  }, [price]);

  const handlePriceChange = useCallback((value: string) => {
    setPrice(value);
    if (amount && value) {
      const newTotal = calculateTotal(amount, value);
      setTotal(newTotal);
    }
  }, [amount]);

  const handleMaxAmount = useCallback(() => {
    const trustlineCount = accountLines?.lines?.length || 0;
    const offerCount = accountOffers?.offers?.length || 0;
    const pendingOfferCount = offerCount + 1;

    const baseInfo = parseAsset(baseAsset);
    const quoteInfo = parseAsset(quoteAsset);

    if (orderSide === 'buy') {
      const quoteBalance = quoteInfo.currency === 'XRP'
        ? parseFloat(getXRPBalance())
        : getTokenBalanceFromLines(quoteInfo.currency, quoteInfo.issuer, accountLines?.lines);

      const maxCalc = calculateMaxBuy(
        quoteBalance,
        price,
        quoteInfo.currency === 'XRP',
        trustlineCount,
        pendingOfferCount,
        baseReserve,
        incrementReserve
      );

      if (maxCalc.maxAmount) {
        setAmount(maxCalc.maxAmount);
      }
    } else {
      const baseBalance = baseInfo.currency === 'XRP'
        ? parseFloat(getXRPBalance())
        : getTokenBalanceFromLines(baseInfo.currency, baseInfo.issuer, accountLines?.lines);

      const maxCalc = calculateMaxSell(
        baseBalance,
        price,
        baseInfo.currency === 'XRP',
        trustlineCount,
        pendingOfferCount,
        baseReserve,
        incrementReserve
      );

      if (maxCalc.maxAmount) {
        setAmount(maxCalc.maxAmount);
      }
    }
  }, [orderSide, baseAsset, quoteAsset, price, accountLines, accountOffers, baseReserve, incrementReserve, getXRPBalance]);

  const swapPair = useCallback(() => {
    const temp = baseAsset;
    setBaseAsset(quoteAsset);
    setQuoteAsset(temp);
    setAmount('');
    setPrice('');
    setTotal('');
  }, [baseAsset, quoteAsset]);

  const fetchMarketPrice = useCallback(async () => {
    const baseInfo = parseAsset(baseAsset);
    const quoteInfo = parseAsset(quoteAsset);

    setIsLoadingPrice(true);
    setPriceError(null);
    try {
      const takerGets = baseInfo.currency === 'XRP'
        ? { currency: 'XRP' }
        : { currency: baseInfo.currency, issuer: baseInfo.issuer };
      
      const takerPays = quoteInfo.currency === 'XRP'
        ? { currency: 'XRP' }
        : { currency: quoteInfo.currency, issuer: quoteInfo.issuer };

      const priceData = await xrplClient.getOrderBookPrice(network, takerGets, takerPays);

      if (priceData.bidPrice && priceData.askPrice) {
        const midPrice = (priceData.bidPrice + priceData.askPrice) / 2;
        setMarketPrice(midPrice);
        setLastUpdate(new Date());
      } else if (priceData.bidPrice) {
        setMarketPrice(priceData.bidPrice);
        setLastUpdate(new Date());
      } else if (priceData.askPrice) {
        setMarketPrice(priceData.askPrice);
        setLastUpdate(new Date());
      } else {
        setMarketPrice(null);
        setPriceError('No liquidity found for this trading pair');
      }
    } catch (error: any) {
      setMarketPrice(null);
      setPriceError(error.message || 'Failed to load price data');
    } finally {
      setIsLoadingPrice(false);
    }
  }, [baseAsset, quoteAsset, network]);

  const analyzeDepth = useCallback(async () => {
    if (orderType !== 'market' || !amount || parseFloat(amount) <= 0) {
      setOrderBookDepth(null);
      setExecutionEstimate(null);
      return;
    }

    const baseInfo = parseAsset(baseAsset);
    const quoteInfo = parseAsset(quoteAsset);

    setIsLoadingDepth(true);
    try {
      const takerGets = baseInfo.currency === 'XRP'
        ? { currency: 'XRP' }
        : { currency: baseInfo.currency, issuer: baseInfo.issuer };
      
      const takerPays = quoteInfo.currency === 'XRP'
        ? { currency: 'XRP' }
        : { currency: quoteInfo.currency, issuer: quoteInfo.issuer };

      const depth = await analyzeOrderBookDepth(
        network,
        takerGets,
        takerPays,
        orderSide,
        50
      );

      setOrderBookDepth(depth);

      const orderSize = parseFloat(amount);
      const estimate = estimateExecution(depth, orderSize, slippageTolerance);
      setExecutionEstimate(estimate);
    } catch {
      setOrderBookDepth(null);
      setExecutionEstimate(null);
    } finally {
      setIsLoadingDepth(false);
    }
  }, [orderType, amount, baseAsset, quoteAsset, network, orderSide, slippageTolerance]);

  useEffect(() => {
    if (!baseAsset || !quoteAsset) return;
    
    fetchMarketPrice();
    const interval = setInterval(fetchMarketPrice, 15000);
    return () => clearInterval(interval);
  }, [baseAsset, quoteAsset, network, fetchMarketPrice]);

  useEffect(() => {
    if (orderType === 'market' && amount && parseFloat(amount) > 0) {
      analyzeDepth();
    } else {
      setOrderBookDepth(null);
      setExecutionEstimate(null);
    }
  }, [orderType, amount, orderSide, baseAsset, quoteAsset, slippageTolerance, network, analyzeDepth]);

  const resetForm = useCallback(() => {
    setAmount('');
    setPrice('');
    setTotal('');
    setExpirationDays('');
    setTfPassive(false);
    setTfFillOrKill(false);
  }, []);

  const calculateFlags = useCallback(() => {
    // Always include tfFullyCanonicalSig (0x80000000) for transaction malleability protection
    // This is required by Keystone 3 Pro firmware for signing DEX transactions
    let flags = 0x80000000;
    if (tfPassive) flags |= 0x00010000;
    if (orderType === 'market') flags |= 0x00020000;
    if (tfFillOrKill) flags |= 0x00040000;
    if (orderSide === 'sell') flags |= 0x00080000;
    return flags;
  }, [tfPassive, orderType, tfFillOrKill, orderSide]);

  return {
    orderSide,
    setOrderSide,
    orderType,
    setOrderType,
    baseAsset,
    setBaseAsset,
    quoteAsset,
    setQuoteAsset,
    amount,
    price,
    total,
    expirationDays,
    setExpirationDays,
    showAdvanced,
    setShowAdvanced,
    tfPassive,
    setTfPassive,
    tfFillOrKill,
    setTfFillOrKill,
    marketPrice,
    isLoadingPrice,
    lastUpdate,
    priceError,
    slippageTolerance,
    setSlippageTolerance,
    executionEstimate,
    isLoadingDepth,
    handleAmountChange,
    handlePriceChange,
    handleMaxAmount,
    swapPair,
    fetchMarketPrice,
    resetForm,
    calculateFlags,
    getXRPBalance,
  };
}
