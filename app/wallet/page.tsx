import WalletPageClient from "./WalletPageClient";

type WalletPageProps = {
  searchParams: Promise<{
    embed?: string | string[];
  }>;
};

export default async function WalletPage({ searchParams }: WalletPageProps) {
  const params = await searchParams;
  const embed = Array.isArray(params.embed) ? params.embed[0] : params.embed;

  return <WalletPageClient isEmbedded={embed === "1"} />;
}
