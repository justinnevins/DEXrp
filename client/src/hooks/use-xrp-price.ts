import { useQuery } from '@tanstack/react-query';
import { fetchXRPToRLUSDPrice, DEXPriceData } from '@/lib/xrp-price';
import { xrplClient } from '@/lib/xrpl-client';

export function useXRPPrice(network: 'mainnet' | 'testnet' = 'mainnet') {
  const isPersistent = xrplClient.isPersistentModeEnabled();
  
  return useQuery<DEXPriceData | null>({
    queryKey: ['xrp-price-dex', network],
    queryFn: async () => {
      try {
        const priceData = await fetchXRPToRLUSDPrice(network);
        return priceData;
      } catch {
        return null;
      }
    },
    refetchInterval: isPersistent ? 1000 : 5000,
    staleTime: isPersistent ? 500 : 2000,
  });
}