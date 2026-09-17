import { z } from "zod";

export const portalLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email.")
    .refine((value) => z.string().email().safeParse(value).success, "Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export type PortalLoginFormValues = z.infer<typeof portalLoginSchema>;

export type PortalLoginFieldErrors = Partial<Record<keyof PortalLoginFormValues, string>>;

export function validatePortalLoginForm(values: PortalLoginFormValues): PortalLoginFieldErrors {
  const result = portalLoginSchema.safeParse(values);
  if (result.success) return {};

  const errors: PortalLoginFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field === "email" || field === "password") {
      if (!errors[field]) errors[field] = issue.message;
    }
  }
  return errors;
}
