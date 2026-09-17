import { z } from "zod";
import { TASK_PRIORITIES } from "../api/types";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional()
);

export const projectFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a project name."),
  companyId: z.string().min(1, "Select a company."),
  deadline: optionalText,
});

export const milestoneFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a milestone name."),
  dueDate: optionalText,
});

export const taskFormSchema = z.object({
  title: z.string().trim().min(1, "Enter a task title."),
  priority: z.enum(TASK_PRIORITIES),
  dueDate: optionalText,
  blockedByTaskId: optionalText,
  assigneeId: optionalText,
});

export const timeEntryFormSchema = z.object({
  minutes: z.coerce.number().int().positive("Enter minutes as a positive integer."),
  loggedAt: z.string().min(1, "Enter a date."),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;
export type TaskFormValues = z.infer<typeof taskFormSchema>;
