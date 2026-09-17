import { z } from "zod";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional()
);

export const proposalFormSchema = z.object({
  dealId: z.string().min(1, "Select a deal."),
  terms: optionalText,
});

export const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Enter a description."),
  quantity: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter quantity as a decimal string."),
  unitPrice: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter rate as a decimal string."),
});

export type ProposalFormValues = z.infer<typeof proposalFormSchema>;
export type LineItemValues = z.infer<typeof lineItemSchema>;
