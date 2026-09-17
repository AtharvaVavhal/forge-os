import { LeadDetailPage } from "@/features/crm/components/leads-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeadDetailPage id={id} />;
}
