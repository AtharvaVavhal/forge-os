import { ModulePlaceholder } from "@/features/workspace/module-placeholder";
import { WorkspaceIdentity } from "@/app/(workspace)/dashboard/workspace-identity";

export default function ProfilePage() {
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <ModulePlaceholder
        kicker="Settings"
        title="Profile"
        description="Profile editing will connect here. The identity below is the current session, not a mock user."
      />
      <WorkspaceIdentity />
    </div>
  );
}
