/**
 * Truncates an XRPL address for display purposes.
 * 
 * @param address - The full XRPL address
 * @param startChars - Number of characters to show at the start (default: 6)
 * @param endChars - Number of characters to show at the end (default: 4)
 * @returns Truncated address like "rN7n3x...4kqB"
 */
export function truncateAddress(
  address: string | undefined | null,
  startChars: number = 6,
  endChars: number = 4
): string {
  if (!address) return '';
  if (address.length <= startChars + endChars + 3) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Common presets for address truncation
 */
export const AddressFormat = {
  /** Short format: 4...4 (for compact displays) */
  short: (address: string) => truncateAddress(address, 4, 4),
  /** Medium format: 6...4 (default, balanced) */
  medium: (address: string) => truncateAddress(address, 6, 4),
  /** Long format: 8...8 (for detailed views) */
  long: (address: string) => truncateAddress(address, 8, 8),
} as const;
