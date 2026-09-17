import { PortalProposalDetailPage } from "@/features/portal/components/portal-proposal-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PortalProposalDetailPage id={id} />;
}
