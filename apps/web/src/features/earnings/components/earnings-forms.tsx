"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/features/crm/components/page-chrome";
import { listProjects } from "@/features/projects/api/projects-api";
import { projectKeys } from "@/features/projects/api/query-keys";
import { listTeamMembers } from "@/features/team/api/team-api";
import { teamKeys } from "@/features/team/api/query-keys";
import type { ProjectAllocationLine } from "../api/types";

const MONEY_PATTERN = /^\d{1,10}\.\d{2}$/;
const SIGNED_MONEY_PATTERN = /^-?\d{1,10}\.\d{2}$/;

export function CreateProjectAllocationFields({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (projectId: string) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | undefined>();

  const projects = useQuery({
    queryKey: projectKeys.list({ page: 1, pageSize: 100 }),
    queryFn: () => listProjects({ page: 1, pageSize: 100 }),
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!projectId) {
          setError("Select a project.");
          return;
        }
        setError(undefined);
        onSubmit(projectId);
      }}
    >
      <Field id="new-allocation-project" label="Project" required error={error}>
        <Select
          id="new-allocation-project"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setError(undefined);
          }}
          invalid={Boolean(error)}
          disabled={projects.isPending}
        >
          <option value="">{projects.isPending ? "Loading projects…" : "Select a project"}</option>
          {projects.data?.items.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel="Create draft" />
    </form>
  );
}

interface LineRow {
  userId: string;
  amount: string;
  note: string;
}

function toRows(lines: ProjectAllocationLine[]): LineRow[] {
  return lines.map((line) => ({ userId: line.userId, amount: line.amount, note: line.note ?? "" }));
}

/**
 * Full-replace line editor for a DRAFT (or DRAFT adjustment) round.
 * `isAdjustment` only changes the accepted sign and helper copy — the
 * server is the actual authority on which signs are valid for this round.
 * Never computes or displays a running total (server-authoritative only).
 */
export function ProjectAllocationLineEditor({
  lines,
  isAdjustment,
  pending,
  onCancel,
  onSubmit,
}: {
  lines: ProjectAllocationLine[];
  isAdjustment: boolean;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (lines: Array<{ userId: string; amount: string; note?: string }>) => void;
}) {
  const [rows, setRows] = useState<LineRow[]>(lines.length ? toRows(lines) : [{ userId: "", amount: "", note: "" }]);
  const [error, setError] = useState<string | undefined>();

  const members = useQuery({
    queryKey: teamKeys.members.list({ page: 1, pageSize: 200 }),
    queryFn: () => listTeamMembers({ page: 1, pageSize: 200 }),
  });
  const memberOptions = (members.data?.items ?? []).filter((member) => member.role === "TEAM_MEMBER" && member.active);

  const pattern = isAdjustment ? SIGNED_MONEY_PATTERN : MONEY_PATTERN;

  function updateRow(index: number, patch: Partial<LineRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const nonEmpty = rows.filter((row) => row.userId || row.amount);
        for (const row of nonEmpty) {
          if (!row.userId) {
            setError("Every line needs a member.");
            return;
          }
          if (!pattern.test(row.amount.trim())) {
            setError(
              isAdjustment
                ? 'Amounts must look like "3300.00" or "-500.00".'
                : 'Amounts must look like "3300.00" (no negative sign).'
            );
            return;
          }
        }
        const userIds = nonEmpty.map((row) => row.userId);
        if (new Set(userIds).size !== userIds.length) {
          setError("A member can only appear once in this round.");
          return;
        }
        setError(undefined);
        onSubmit(
          nonEmpty.map((row) => ({
            userId: row.userId,
            amount: row.amount.trim(),
            note: row.note.trim() || undefined,
          }))
        );
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-danger-deep" role="alert">
          {error}
        </p>
      ) : null}
      <p className="type-helper text-steel">
        {isAdjustment
          ? "Adjustment round — amounts may be signed (negative is a clawback)."
          : "Normal round — amounts must be positive."}{" "}
        Totals shown elsewhere on this page come from the server, never computed here.
      </p>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-[4px] border border-steel/15 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`line-member-${index}`} label="Member" required>
              <Select
                id={`line-member-${index}`}
                value={row.userId}
                onChange={(event) => updateRow(index, { userId: event.target.value })}
                disabled={members.isPending}
              >
                <option value="">{members.isPending ? "Loading members…" : "Select a member"}</option>
                {memberOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={`line-amount-${index}`} label="Amount" required hint="Decimal string">
              <Input
                id={`line-amount-${index}`}
                value={row.amount}
                placeholder={isAdjustment ? "-500.00" : "3300.00"}
                onChange={(event) => updateRow(index, { amount: event.target.value })}
              />
            </Field>
          </div>
          <Field id={`line-note-${index}`} label="Note (optional)">
            <Input id={`line-note-${index}`} value={row.note} onChange={(event) => updateRow(index, { note: event.target.value })} />
          </Field>
          {rows.length > 1 ? (
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => removeRow(index)}>
              Remove line
            </Button>
          ) : null}
        </div>
      ))}
      <div className="flex justify-between">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setRows([...rows, { userId: "", amount: "", note: "" }])}
        >
          Add line
        </Button>
        <FormActions onCancel={onCancel} pending={pending} submitLabel="Save lines" />
      </div>
    </form>
  );
}
