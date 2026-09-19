import { ProjectAllocationDetailPage } from "@/features/earnings/components/project-allocation-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectAllocationDetailPage id={id} />;
}
