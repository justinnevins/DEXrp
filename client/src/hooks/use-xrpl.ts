import { useQuery } from '@tanstack/react-query';
import { xrplClient, type XRPLNetwork } from '@/lib/xrpl-client';

const NORMAL_INTERVALS = {
  accountInfo: 30000,
  accountTransactions: 60000,
  accountLines: 60000,
  accountOffers: 30000,
  serverInfo: 300000,
};

const PERSISTENT_INTERVALS = {
  accountInfo: 10000,
  accountTransactions: 15000,
  accountLines: 30000,
  accountOffers: 10000,
  serverInfo: 120000,
};

function getRefetchInterval(key: keyof typeof NORMAL_INTERVALS): number {
  const isPersistent = xrplClient.isPersistentModeEnabled();
  return isPersistent ? PERSISTENT_INTERVALS[key] : NORMAL_INTERVALS[key];
}

export function useXRPL() {
  return {
    client: xrplClient
  };
}

export function useAccountInfo(address: string | null, network: XRPLNetwork) {
  return useQuery({
    queryKey: ['accountInfo', address, network],
    queryFn: async () => {
      if (!address) return null;
      try {
        return await xrplClient.getAccountInfo(address, network);
      } catch (error: any) {
        if (error.data?.error === 'actNotFound') {
          return { 
            account_not_found: true,
            address,
            error: 'Account not activated on XRPL network'
          };
        }
        throw error;
      }
    },
    enabled: !!address,
    refetchInterval: getRefetchInterval('accountInfo'),
  });
}

export function useAccountTransactions(address: string | null, network: XRPLNetwork, limit = 20) {
  return useQuery({
    queryKey: ['accountTransactions', address, network, limit],
    queryFn: async () => {
      if (!address) return null;
      try {
        return await xrplClient.getAccountTransactions(address, network, limit);
      } catch {
        return { transactions: [] };
      }
    },
    enabled: !!address,
    refetchInterval: getRefetchInterval('accountTransactions'),
    retry: 3,
    retryDelay: 1000,
  });
}

export function useAccountLines(address: string | null, network: XRPLNetwork) {
  return useQuery({
    queryKey: ['accountLines', address, network],
    queryFn: async () => {
      if (!address) return null;
      try {
        return await xrplClient.getAccountLines(address, network);
      } catch {
        return { lines: [] };
      }
    },
    enabled: !!address,
    refetchInterval: getRefetchInterval('accountLines'),
    retry: 3,
    retryDelay: 1000,
  });
}

export function useAccountOffers(address: string | null, network: XRPLNetwork) {
  return useQuery({
    queryKey: ['accountOffers', address, network],
    queryFn: async () => {
      if (!address) return null;
      try {
        return await xrplClient.getAccountOffers(address, network);
      } catch {
        return { offers: [] };
      }
    },
    enabled: !!address,
    refetchInterval: getRefetchInterval('accountOffers'),
    retry: 3,
    retryDelay: 1000,
  });
}

export function useServerInfo(network: XRPLNetwork) {
  return useQuery({
    queryKey: ['serverInfo', network],
    queryFn: async () => {
      return await xrplClient.getServerInfo(network);
    },
    refetchInterval: getRefetchInterval('serverInfo'),
    staleTime: 60000,
  });
}
