import { z } from "zod";
import { LEAD_SOURCES } from "../api/types";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional()
);

const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .optional()
    .refine(
      (value) => value === undefined || z.email().safeParse(value).success,
      "Enter a valid email."
    )
);

export const companyFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a company name."),
  gstin: z.string().trim().optional(),
  billingState: z.string().trim().optional(),
  billingAddress: z.string().trim().optional(),
  tags: z.string().trim().optional(),
});

export const contactFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a contact name."),
  email: optionalEmail,
  phone: optionalText,
  companyId: optionalText,
});

export const leadFormSchema = z.object({
  source: z.enum(LEAD_SOURCES),
  companyId: optionalText,
  contactId: optionalText,
  notes: optionalText,
});

export const dealFormSchema = z.object({
  title: z.string().trim().min(1, "Enter a deal title."),
  estimatedValue: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter an amount as a decimal string, e.g. 12000.00."),
  companyId: optionalText,
  contactId: optionalText,
});

/** Lead → Deal convert body (matches ConvertLeadDto: title + estimatedValue). */
export const convertLeadFormSchema = z.object({
  title: z.string().trim().min(1, "Enter a deal title."),
  estimatedValue: z
    .string()
    .trim()
    .regex(/^\d{1,10}\.\d{2}$/, "Enter an amount with exactly two decimal places, e.g. 12000.00."),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;
export type ContactFormValues = z.infer<typeof contactFormSchema>;
export type LeadFormValues = z.infer<typeof leadFormSchema>;
export type DealFormValues = z.infer<typeof dealFormSchema>;
export type ConvertLeadFormValues = z.infer<typeof convertLeadFormSchema>;

export function tagsFromInput(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}
