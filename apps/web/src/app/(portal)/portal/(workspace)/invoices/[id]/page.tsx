import { PortalInvoiceDetailPage } from "@/features/portal/components/portal-invoice-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PortalInvoiceDetailPage id={id} />;
}
