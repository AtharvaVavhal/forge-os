import { z } from "zod";
import { CREDIT_NOTE_REASONS, FORGE_FUND_ENTRY_TYPES, OFFLINE_PAYMENT_METHODS } from "../api/types";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional()
);

const moneyString = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Enter amount as a decimal string.");

export const invoiceFormSchema = z.object({
  companyId: z.string().min(1, "Select a company."),
  projectId: optionalText,
  dueDate: optionalText,
});

export const invoiceFromProposalSchema = z.object({
  proposalId: z.string().min(1, "Select a proposal."),
});

export const invoiceLineSchema = z.object({
  description: z.string().trim().min(1, "Enter a description."),
  quantity: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter quantity as a decimal string."),
  unitPrice: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter rate as a decimal string."),
  hsnSacCode: z.string().trim().min(1, "Enter HSN/SAC."),
});

export const invoiceDueDateSchema = z.object({
  dueDate: optionalText,
});

export const cancelInvoiceSchema = z.object({
  reason: z.string().trim().min(1, "Enter a cancellation reason."),
});

export const paymentFormSchema = z.object({
  invoiceId: z.string().min(1, "Select an invoice."),
  amount: moneyString,
  method: z.enum(OFFLINE_PAYMENT_METHODS),
  referenceNote: optionalText,
  paidAt: optionalText,
});

export const refundFormSchema = z.object({
  amount: moneyString,
  reason: z.string().trim().min(1, "Enter a refund reason."),
});

export const creditNoteFormSchema = z.object({
  invoiceId: z.string().min(1, "Select an invoice."),
  reason: z.enum(CREDIT_NOTE_REASONS),
  amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter amount as a decimal string. Zero is allowed."),
});

export const expenseFormSchema = z.object({
  description: z.string().trim().min(1, "Enter a description."),
  amount: moneyString,
  category: z.string().trim().min(1, "Enter a category."),
  incurredAt: z.string().min(1, "Enter a date."),
  projectId: optionalText,
});

export const forgeFundEntrySchema = z.object({
  type: z.enum(FORGE_FUND_ENTRY_TYPES),
  amount: moneyString,
  reason: z.string().trim().min(1, "Enter a reason."),
});
