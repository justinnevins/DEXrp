import { xrplClient, type XRPLNetwork } from './xrpl-client';

export interface DeletionBlocker {
  type: string;
  label: string;
  description: string;
  count: number;
}

export interface AccountDeletePreflightResult {
  eligible: boolean;
  sequenceOk: boolean;
  objectCountOk: boolean;
  objectCount: number;
  blockers: DeletionBlocker[];
  currentLedgerIndex: number;
  accountSequence: number;
  sequenceReadyAt?: number;
  errorMessage?: string;
}

const BLOCKER_TYPE_LABELS: Record<string, { label: string; description: string }> = {
  RippleState: {
    label: 'Trust Lines with Balance',
    description: 'You hold token balances on trust lines. Send all tokens back to zero before deleting.',
  },
  Escrow: {
    label: 'Open Escrows',
    description: 'You have active escrows. Finish or cancel them before deleting.',
  },
  Check: {
    label: 'Outstanding Checks',
    description: 'You have uncashed checks. Cancel them before deleting.',
  },
  PayChannel: {
    label: 'Open Payment Channels',
    description: 'You have open payment channels. Close them before deleting.',
  },
  NFTokenPage: {
    label: 'NFTs Owned',
    description: 'You own NFTs. Burn or transfer all NFTs before deleting.',
  },
  Bridge: {
    label: 'Cross-Chain Bridge',
    description: 'You have an active cross-chain bridge, which cannot be removed.',
  },
  PermissionedDomain: {
    label: 'Permissioned Domain',
    description: 'Delete your permissioned domain first.',
  },
  Offer: {
    label: 'Open DEX Offers',
    description: 'You have open DEX offers. Cancel them all from the DEX page before deleting.',
  },
  SignerList: {
    label: 'Signer List (Multi-sig)',
    description: 'Your account has a signer list. Delete it first using an AccountSet transaction.',
  },
};

export async function checkAccountDeleteEligibility(
  address: string,
  network: XRPLNetwork,
): Promise<AccountDeletePreflightResult> {
  const accountInfo = await xrplClient.getAccountInfo(address, network);

  if (!accountInfo || 'account_not_found' in accountInfo) {
    return {
      eligible: false,
      sequenceOk: false,
      objectCountOk: false,
      objectCount: 0,
      blockers: [],
      currentLedgerIndex: 0,
      accountSequence: 0,
      errorMessage: 'Account not found on the XRPL. It may not be activated yet.',
    };
  }

  const accountData = (accountInfo as any).account_data;
  const currentLedger: number =
    (accountInfo as any).ledger_current_index ??
    (accountInfo as any).ledger_index ??
    0;
  const accountSequence: number = accountData?.Sequence ?? 0;

  const sequenceOk = accountSequence + 255 <= currentLedger;
  const sequenceReadyAt = sequenceOk ? undefined : accountSequence + 255;

  const objectsResult = await xrplClient.getAccountObjects(address, network);
  const objects: any[] = objectsResult?.account_objects ?? [];

  const objectCount = objects.length;
  const objectCountOk = objectCount <= 1000;

  const blockerMap: Record<string, number> = {};

  for (const obj of objects) {
    const lt: string = obj.LedgerEntryType ?? '';

    if (lt === 'RippleState') {
      const balance = parseFloat(obj.Balance?.value ?? '0');
      if (balance !== 0) {
        blockerMap['RippleState'] = (blockerMap['RippleState'] ?? 0) + 1;
      }
    } else if (
      lt === 'Escrow' ||
      lt === 'Check' ||
      lt === 'PayChannel' ||
      lt === 'NFTokenPage' ||
      lt === 'Bridge' ||
      lt === 'PermissionedDomain' ||
      lt === 'Offer' ||
      lt === 'SignerList'
    ) {
      blockerMap[lt] = (blockerMap[lt] ?? 0) + 1;
    }
  }

  const blockers: DeletionBlocker[] = Object.entries(blockerMap).map(
    ([type, count]) => ({
      type,
      count,
      label: BLOCKER_TYPE_LABELS[type]?.label ?? type,
      description:
        BLOCKER_TYPE_LABELS[type]?.description ??
        `Remove all ${type} objects before deleting.`,
    }),
  );

  const eligible = sequenceOk && objectCountOk && blockers.length === 0;

  return {
    eligible,
    sequenceOk,
    objectCountOk,
    objectCount,
    blockers,
    currentLedgerIndex: currentLedger,
    accountSequence,
    sequenceReadyAt,
  };
}
