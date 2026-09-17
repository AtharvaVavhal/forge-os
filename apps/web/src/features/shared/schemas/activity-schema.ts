import { z } from "zod";

export const activityFormSchema = z.object({
  type: z.string().trim().min(1, "Enter an activity type."),
  summary: z.string().trim().min(1, "Enter a summary."),
  nextFollowUpAt: z.string().optional(),
});
