import { ProposalsPage } from "@/features/sales/components/proposals-pages";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ dealId?: string }>;
}) {
  const { dealId } = await searchParams;
  return <ProposalsPage presetDealId={dealId} />;
}
