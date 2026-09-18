"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pagination } from "@/components/data-display/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/data-display/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Drawer } from "@/components/overlays/drawer";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { useAuthorization } from "@/features/auth/authorization/authorization-context";
import { USER_ROLES, type UserRole } from "@forge/types";
import { queryErrorMessage } from "@/lib/api/query-error";
import { FormActions, PageHeader } from "@/features/crm/components/page-chrome";
import { enumLabel, formatTimestamp } from "@/features/crm/format";
import { SharedQueryState } from "@/features/shared/components/shared-query-state";
import { createTeamInvitation, listTeamMembers } from "../api/team-api";
import { teamKeys } from "../api/query-keys";
import { teamInviteSchema } from "../schemas/invite-schema";

export function MembersPage() {
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { role } = useAuthorization();
  const filters = useMemo(() => ({ page, pageSize: 25, sort: "createdAt:desc" }), [page]);

  const list = useQuery({
    queryKey: teamKeys.members.list(filters),
    queryFn: () => listTeamMembers(filters),
  });

  const inviteMutation = useMutation({
    mutationFn: (body: { email: string; userRole: UserRole }) =>
      createTeamInvitation({ scope: "TEAM", email: body.email, userRole: body.userRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.members.all });
      setInviteOpen(false);
      pushToast({
        title: "Invitation created",
        description: "Delivery is handled by the backend. The raw token is not shown here.",
        tone: "success",
      });
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t invite", description: queryErrorMessage(error), tone: "danger" }),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Team"
        title="Members"
        description="Directory from GET /team/members. Role changes and deactivation have no documented mutation endpoint, so they are not offered here."
        actions={
          <Can permission="users.manage">
            <Button onClick={() => setInviteOpen(true)}>Invite member</Button>
          </Can>
        }
      />
      <SharedQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No members"
        emptyDescription="Invited teammates appear here after they accept. This is not a zero-person organization."
        unavailableTitle="Service is not currently available."
      >
        <Table caption="Team members">
          <TableHead>
            <TableHeaderCell>Name</TableHeaderCell>
            <TableHeaderCell>Email</TableHeaderCell>
            <TableHeaderCell>Role</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Last login</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((member) => (
              <TableRow key={member.id}>
                <TableCell>{member.name}</TableCell>
                <TableCell mono>{member.email}</TableCell>
                <TableCell>{enumLabel(member.role)}</TableCell>
                <TableCell>
                  <StatusBadge tone={member.active ? "success" : "neutral"}>
                    {member.active ? "Active" : "Inactive"}
                  </StatusBadge>
                </TableCell>
                <TableCell mono>{formatTimestamp(member.lastLoginAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} summary={total ? `${total} members` : undefined} />
      </SharedQueryState>
      <Drawer open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite teammate">
        <InviteFields
          pending={inviteMutation.isPending}
          callerRole={role}
          onCancel={() => setInviteOpen(false)}
          onSubmit={(values) => inviteMutation.mutate(values)}
        />
      </Drawer>
    </div>
  );
}

function InviteFields({
  pending,
  onCancel,
  onSubmit,
  callerRole,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { email: string; userRole: UserRole }) => void;
  callerRole: UserRole;
}) {
  const [error, setError] = useState<string | undefined>();
  const inviteableRoles = USER_ROLES.filter(
    (role) => role !== "FOUNDER_ADMIN" || callerRole === "FOUNDER_ADMIN"
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = teamInviteSchema.safeParse({
          email: form.get("email"),
          userRole: form.get("userRole"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        if (parsed.data.userRole === "FOUNDER_ADMIN" && callerRole !== "FOUNDER_ADMIN") {
          setError("Only a founder admin can invite another founder admin.");
          return;
        }
        setError(undefined);
        onSubmit(parsed.data);
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      <Field id="invite-email" label="Email" required>
        <Input id="invite-email" name="email" type="email" autoComplete="email" />
      </Field>
      <Field
        id="invite-role"
        label="Role"
        required
        hint="TEAM invitations set UserRole. There is no Role table or permission-matrix editor. Backend still authorizes the invite."
      >
        <Select id="invite-role" name="userRole" defaultValue="TEAM_MEMBER">
          {inviteableRoles.map((role) => (
            <option key={role} value={role}>
              {enumLabel(role)}
            </option>
          ))}
        </Select>
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel="Send invitation" />
    </form>
  );
}
