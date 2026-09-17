import { ProjectDetailPage } from "@/features/projects/components/projects-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectDetailPage id={id} />;
}
