import { PortalProjectDetailPage } from "@/features/portal/components/portal-project-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PortalProjectDetailPage id={id} />;
}
