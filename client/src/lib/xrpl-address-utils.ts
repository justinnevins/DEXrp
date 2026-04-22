import { Wallet as XRPLWallet } from 'xrpl';

export function isValidAddress(address: string): boolean {
  try {
    return /^r[a-zA-Z0-9]{24,34}$/.test(address);
  } catch {
    return false;
  }
}

export function generateTestWallet(): { address: string; seed: string } {
  const wallet = XRPLWallet.generate();
  return {
    address: wallet.address,
    seed: wallet.seed!
  };
}
