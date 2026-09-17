import { InvoiceDetailPage } from "@/features/finance/components/invoices-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceDetailPage id={id} />;
}
