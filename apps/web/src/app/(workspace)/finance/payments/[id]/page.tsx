import { PaymentDetailPage } from "@/features/finance/components/payments-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaymentDetailPage id={id} />;
}
