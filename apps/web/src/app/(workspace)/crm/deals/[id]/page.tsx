import { DealDetailPage } from "@/features/crm/components/deals-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DealDetailPage id={id} />;
}
