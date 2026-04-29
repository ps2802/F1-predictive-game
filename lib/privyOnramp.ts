export type PrivyWalletRecord = {
  address?: string;
  chainType?: string;
  type?: string;
  walletClientType?: string;
};

export type PrivyUserRecord = {
  wallet?: PrivyWalletRecord;
  linkedAccounts?: PrivyWalletRecord[];
};

function isEmbeddedSolanaWallet(
  wallet: PrivyWalletRecord | undefined
): wallet is PrivyWalletRecord & { address: string } {
  return (
    Boolean(wallet?.address) &&
    wallet?.chainType === "solana" &&
    (wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2")
  );
}

function isSolanaWallet(
  wallet: PrivyWalletRecord | undefined
): wallet is PrivyWalletRecord & { address: string } {
  return Boolean(wallet?.address) && wallet?.chainType === "solana";
}

export function resolveSolanaWalletAddressFromLinkedAccounts(
  linkedAccounts: PrivyWalletRecord[] | undefined,
  wallet?: PrivyWalletRecord
): string | null {
  const accounts = linkedAccounts ?? [];

  return (
    accounts.find(isEmbeddedSolanaWallet)?.address ??
    (isEmbeddedSolanaWallet(wallet) ? wallet.address : null) ??
    accounts.find(isSolanaWallet)?.address ??
    (isSolanaWallet(wallet) ? wallet.address : null)
  );
}

export function resolveSolanaWalletAddress(
  user: PrivyUserRecord | null,
  walletAddress?: string | null
): string | null {
  if (walletAddress) return walletAddress;

  return resolveSolanaWalletAddressFromLinkedAccounts(
    user?.linkedAccounts,
    user?.wallet
  );
}
