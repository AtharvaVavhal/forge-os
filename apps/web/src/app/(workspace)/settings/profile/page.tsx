"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { WorkspaceIdentity } from "@/app/(workspace)/dashboard/workspace-identity";
import { PageHeader } from "@/features/crm/components/page-chrome";
import { Tabs, TabPanel } from "@/components/data-display/tabs";
import { useAuthorization } from "@/features/auth/authorization/authorization-context";
import { PayoutSettingsPanel } from "@/features/team/components/payout-settings-panel";
import { KycStatusPanel } from "@/features/onboarding/components/kyc-status-panel";

const TEAM_MEMBER_TAB_IDS = new Set(["profile", "verification", "payout"]);

export default function ProfilePage() {
  const { role } = useAuthorization();
  const searchParams = useSearchParams();
  const showTeamMemberTabs = role === "TEAM_MEMBER";

  const requestedTab = searchParams?.get("tab") ?? undefined;
  const initialTab =
    showTeamMemberTabs && requestedTab && TEAM_MEMBER_TAB_IDS.has(requestedTab)
      ? requestedTab
      : "profile";
  const [tab, setTab] = useState(initialTab);

  const tabs = showTeamMemberTabs
    ? [
        { id: "profile", label: "Profile" },
        { id: "verification", label: "Verification" },
        { id: "payout", label: "Payout" },
      ]
    : [{ id: "profile", label: "Profile" }];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        kicker="Settings"
        title="Profile"
        description="Your account identity, and verification and payout details if you're a team member."
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <TabPanel id="profile" active={tab === "profile"}>
        <WorkspaceIdentity />
      </TabPanel>
      {showTeamMemberTabs ? (
        <>
          <TabPanel id="verification" active={tab === "verification"}>
            <KycStatusPanel />
          </TabPanel>
          <TabPanel id="payout" active={tab === "payout"}>
            <PayoutSettingsPanel />
          </TabPanel>
        </>
      ) : null}
    </div>
  );
}
