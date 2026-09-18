import { KycReviewDetailPage } from "@/features/finance/components/kyc-review-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KycReviewDetailPage id={id} />;
}
