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

export function resolveSolanaWalletAddress(
  user: PrivyUserRecord | null,
  walletAddress?: string | null
): string | null {
  if (walletAddress) return walletAddress;

  const linkedAccounts = user?.linkedAccounts ?? [];
  return (
    linkedAccounts.find(isEmbeddedSolanaWallet)?.address ??
    (isEmbeddedSolanaWallet(user?.wallet) ? user.wallet.address : null) ??
    linkedAccounts.find(isSolanaWallet)?.address ??
    (isSolanaWallet(user?.wallet) ? user.wallet.address : null)
  );
}
