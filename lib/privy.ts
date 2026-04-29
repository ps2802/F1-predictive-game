function isLocalDevEnvironment(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_VERCEL_ENV !== "preview"
  );
}

export function getPrivyAppId(): string | undefined {
  if (isLocalDevEnvironment() && process.env.NEXT_PUBLIC_PRIVY_APP_ID_LOCAL) {
    return process.env.NEXT_PUBLIC_PRIVY_APP_ID_LOCAL;
  }

  return process.env.NEXT_PUBLIC_PRIVY_APP_ID;
}

export function hasPrivyClientConfig(): boolean {
  return Boolean(getPrivyAppId());
}

export function getPrivyClientId(): string | undefined {
  if (isLocalDevEnvironment() && process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID_LOCAL) {
    return process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID_LOCAL;
  }

  return process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;
}

export function getPrivyAppSecret(): string | undefined {
  if (isLocalDevEnvironment() && process.env.PRIVY_APP_SECRET_LOCAL) {
    return process.env.PRIVY_APP_SECRET_LOCAL;
  }

  return process.env.PRIVY_APP_SECRET;
}

export function shouldEnablePrivyEmbeddedWallets(): boolean {
  if (process.env.NEXT_PUBLIC_PRIVY_DISABLE_EMBEDDED_WALLETS === "true") {
    return false;
  }

  if (
    isLocalDevEnvironment() &&
    process.env.NEXT_PUBLIC_PRIVY_DISABLE_EMBEDDED_WALLETS_LOCAL === "true"
  ) {
    return false;
  }

  return true;
}

export function isPrivyEmailOnlyEnvironment(): boolean {
  return (
    process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" ||
    (isLocalDevEnvironment() &&
      process.env.NEXT_PUBLIC_PRIVY_FORCE_EMAIL_ONLY_LOCAL === "true")
  );
}
