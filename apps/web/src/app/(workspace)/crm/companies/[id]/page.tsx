import { CompanyDetailPage } from "@/features/crm/components/company-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompanyDetailPage id={id} />;
}
