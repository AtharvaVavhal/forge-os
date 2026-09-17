import { ContactDetailPage } from "@/features/crm/components/contacts-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContactDetailPage id={id} />;
}
