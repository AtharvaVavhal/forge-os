"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Drawer } from "@/components/overlays/drawer";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { FormActions } from "@/features/crm/components/page-chrome";
import { enumLabel, formatTimestamp } from "@/features/crm/format";
import { queryErrorMessage } from "@/lib/api/query-error";
import { SharedQueryState } from "./shared-query-state";
import { createNote, listNotes, updateNote } from "../api/shared-api";
import { notesWritePermission, type NoteParent } from "../api/parent";
import { sharedKeys } from "../api/query-keys";
import { VISIBILITIES, type Note, type Visibility } from "../api/types";
import { noteFormSchema } from "../schemas/note-schema";

export function NotesPanel({ parent }: { parent: NoteParent }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const write = notesWritePermission(parent);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const filters = { ...parent, limit: 25 };

  const list = useQuery({
    queryKey: sharedKeys.notes.list(filters),
    queryFn: () => listNotes(parent, { limit: 25 }),
  });

  const createMutation = useMutation({
    mutationFn: (body: { body: string; visibility: Visibility }) => createNote({ ...parent, ...body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedKeys.notes.all });
      setCreateOpen(false);
      pushToast({ title: "Note saved", tone: "success" });
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t save note", description: queryErrorMessage(error), tone: "danger" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { body: string; visibility: Visibility } }) =>
      updateNote(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedKeys.notes.all });
      setEditing(null);
      pushToast({ title: "Note updated", tone: "success" });
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t update note", description: queryErrorMessage(error), tone: "danger" }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="type-section-title text-ink">Notes</h2>
          <p className="type-helper mt-1 text-steel">Parent-scoped. There is no documented note delete.</p>
        </div>
        <Can permission={write}>
          <Button onClick={() => setCreateOpen(true)}>Add note</Button>
        </Can>
      </div>
      <SharedQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No notes"
        emptyDescription="Notes attached to this record will appear here."
        unavailableTitle="Service is not currently available."
      >
        <ul className="flex flex-col gap-4">
          {list.data?.items.map((note) => (
            <li key={note.id} className="border-t border-steel/15 pt-3">
              <div className="flex items-start justify-between gap-3">
                <StatusBadge tone={note.visibility === "CLIENT_VISIBLE" ? "info" : "neutral"}>
                  {enumLabel(note.visibility)}
                </StatusBadge>
                <Can permission={write}>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(note)}>
                    Edit
                  </Button>
                </Can>
              </div>
              <p className="type-body mt-2 whitespace-pre-wrap text-ink">{note.body}</p>
              <p className="type-metadata mt-1 text-steel">{formatTimestamp(note.createdAt)}</p>
            </li>
          ))}
        </ul>
      </SharedQueryState>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="Add note">
        <NoteFields
          pending={createMutation.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      </Drawer>
      <Drawer open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit note">
        {editing ? (
          <NoteFields
            note={editing}
            pending={updateMutation.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(values) => updateMutation.mutate({ id: editing.id, body: values })}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

function NoteFields({
  note,
  pending,
  onCancel,
  onSubmit,
}: {
  note?: Note;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { body: string; visibility: Visibility }) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = noteFormSchema.safeParse({
          body: form.get("body"),
          visibility: form.get("visibility"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
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
      <Field id="note-body" label="Note" required>
        <Textarea id="note-body" name="body" defaultValue={note?.body} />
      </Field>
      <Field id="note-visibility" label="Visibility" required>
        <Select id="note-visibility" name="visibility" defaultValue={note?.visibility ?? "INTERNAL"}>
          {VISIBILITIES.map((value) => (
            <option key={value} value={value}>
              {enumLabel(value)}
            </option>
          ))}
        </Select>
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel={note ? "Save note" : "Add note"} />
    </form>
  );
}
