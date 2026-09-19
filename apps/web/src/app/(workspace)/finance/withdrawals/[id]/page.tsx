import { PayoutDetailPage } from "@/features/earnings/components/payout-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayoutDetailPage id={id} />;
}
