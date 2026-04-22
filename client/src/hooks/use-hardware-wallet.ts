import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { realHardwareWalletService as hardwareWalletService, type HardwareWalletType, type HardwareWalletConnection, type TransactionRequest, type SignedTransaction } from '@/lib/real-hardware-wallet';

export function useHardwareWallet() {
  const [connection, setConnection] = useState<HardwareWalletConnection | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const { toast } = useToast();

  const connect = useCallback(async (type: HardwareWalletType) => {
    setIsConnecting(true);
    try {
      const newConnection = await hardwareWalletService.connectHardwareWallet(type);
      setConnection(newConnection);
      
      toast({
        title: "Hardware Wallet Connected",
        description: `Successfully connected to ${type}`,
      });
      
      return newConnection;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect hardware wallet';
      
      toast({
        title: "Connection Failed",
        description: errorMessage,
        variant: "destructive",
      });
      
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [toast]);

  const disconnect = useCallback(async () => {
    try {
      await hardwareWalletService.disconnect();
      setConnection(null);
    } catch {
    }
  }, []);

  const getAddress = useCallback(async (type?: HardwareWalletType): Promise<string> => {
    try {
      const address = await hardwareWalletService.getAddress(type);
      return address;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get address';
      
      toast({
        title: "Address Error",
        description: errorMessage,
        variant: "destructive",
      });
      
      throw error;
    }
  }, [toast]);

  const signTransaction = useCallback(async (txRequest: TransactionRequest, type?: HardwareWalletType): Promise<SignedTransaction> => {
    setIsSigning(true);
    try {
      const signedTx = await hardwareWalletService.signTransaction(txRequest, type);
      
      toast({
        title: "Transaction Signed",
        description: "Transaction successfully signed by hardware wallet",
      });
      
      return signedTx;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign transaction';
      
      toast({
        title: "Signing Failed",
        description: errorMessage,
        variant: "destructive",
      });
      
      throw error;
    } finally {
      setIsSigning(false);
    }
  }, [toast]);

  const detectAvailableWallets = useCallback(async (): Promise<HardwareWalletType[]> => {
    // Keystone 3 Pro is always available (QR code based, no special hardware required)
    return ['Keystone 3 Pro'];
  }, []);

  // Initialize connection state from service
  useEffect(() => {
    const currentConnection = hardwareWalletService.getCurrentConnection();
    setConnection(currentConnection);
  }, []);

  return {
    connection,
    isConnected: connection?.connected || false,
    isConnecting,
    isSigning,
    connect,
    disconnect,
    getAddress,
    signTransaction,
    detectAvailableWallets,
  };
}