import { z } from "zod";

const moneyPattern = /^\d{1,10}\.\d{2}$/;

export const withdrawFundsFormSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(moneyPattern, 'Enter an amount like "1500.00".')
    .refine((value) => Number(value) > 0, "Enter an amount greater than zero."),
});

export type WithdrawFundsFormValues = z.infer<typeof withdrawFundsFormSchema>;
