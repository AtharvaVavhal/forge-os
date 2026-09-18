"use client";

import { useState } from "react";
import { WorkspaceIdentity } from "@/app/(workspace)/dashboard/workspace-identity";
import { PageHeader } from "@/features/crm/components/page-chrome";
import { Tabs, TabPanel } from "@/components/data-display/tabs";
import { useAuthorization } from "@/features/auth/authorization/authorization-context";
import { PayoutSettingsPanel } from "@/features/team/components/payout-settings-panel";

export default function ProfilePage() {
  const { role } = useAuthorization();
  const [tab, setTab] = useState("profile");
  const showPayoutTab = role === "TEAM_MEMBER";

  const tabs = showPayoutTab
    ? [
        { id: "profile", label: "Profile" },
        { id: "payout", label: "Payout" },
      ]
    : [{ id: "profile", label: "Profile" }];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        kicker="Settings"
        title="Profile"
        description="Your account identity, and payout details if you're a team member."
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <TabPanel id="profile" active={tab === "profile"}>
        <WorkspaceIdentity />
      </TabPanel>
      {showPayoutTab ? (
        <TabPanel id="payout" active={tab === "payout"}>
          <PayoutSettingsPanel />
        </TabPanel>
      ) : null}
    </div>
  );
}
