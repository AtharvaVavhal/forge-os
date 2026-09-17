"use client";

import { Drawer } from "@/components/overlays/drawer";
import { TimeEntryFields } from "./project-forms";
import { createTimeEntry } from "../api/projects-api";
import { useMutation } from "@tanstack/react-query";
import { queryErrorMessage } from "@/lib/api/query-error";
import { useToast } from "@/components/overlays/toast";

export function CreateTimeEntry({
  taskId,
  open,
  onClose,
  onCreated,
}: {
  taskId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { pushToast } = useToast();
  const mutation = useMutation({
    mutationFn: (body: { minutes: number; loggedAt: string }) => createTimeEntry(taskId, body),
    onSuccess: () => {
      onCreated();
      onClose();
    },
    onError: (error) => pushToast({ title: "Couldn’t log time", description: queryErrorMessage(error), tone: "danger" }),
  });

  return (
    <Drawer open={open} onClose={onClose} title="Log time">
      <TimeEntryFields
        pending={mutation.isPending}
        onCancel={onClose}
        onSubmit={(values) => mutation.mutate(values)}
      />
    </Drawer>
  );
}
