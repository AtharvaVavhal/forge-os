import { z } from "zod";
import { USER_ROLES } from "@forge/types";

export const teamInviteSchema = z.object({
  email: z.string().email("Enter a valid email."),
  userRole: z.enum(USER_ROLES),
});
