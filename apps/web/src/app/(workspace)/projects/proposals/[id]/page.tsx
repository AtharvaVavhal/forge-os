import { ProposalDetailPage } from "@/features/sales/components/proposals-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProposalDetailPage id={id} />;
}
