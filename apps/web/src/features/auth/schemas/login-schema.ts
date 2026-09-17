import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email.")
    .refine((value) => z.email().safeParse(value).success, "Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export type LoginFieldErrors = Partial<Record<keyof LoginFormValues, string>>;

export function validateLoginForm(values: LoginFormValues): LoginFieldErrors {
  const result = loginSchema.safeParse(values);
  if (result.success) return {};

  const errors: LoginFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field === "email" || field === "password") {
      if (!errors[field]) errors[field] = issue.message;
    }
  }
  return errors;
}
