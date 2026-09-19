import { z } from "zod";
import { KYC_GOVERNMENT_ID_TYPES } from "../api/types";

const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;

/**
 * K5 onboarding redesign — the lightweight "Personal Profile" onboarding
 * step. Deliberately just a phone number: the member's name already comes
 * from Google Workspace SSO (shown, not re-asked), and legal name/DOB/
 * address move to the standalone Financial Verification flow (see
 * `personalFormSchema` below, unchanged, still used there).
 */
export const profileFormSchema = z.object({
  mobile: z
    .string()
    .trim()
    .min(8, "Enter a valid mobile number.")
    .max(20, "Enter a valid mobile number."),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

/** K5 onboarding redesign — the "Work Profile" onboarding step. Every field is optional; this is never gated on. */
export const workFormSchema = z.object({
  jobTitle: z.string().trim().max(150).optional(),
  primaryArea: z.string().trim().max(150).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  bio: z.string().trim().max(500).optional(),
});

export type WorkFormValues = z.infer<typeof workFormSchema>;

/** Financial Verification flow only (post-onboarding, gated at first withdrawal) — legal identity fields KYC needs. */
export const personalFormSchema = z.object({
  legalName: z.string().trim().min(1, "Legal name is required.").max(200),
  dateOfBirth: z.string().min(1, "Date of birth is required."),
  mobile: z
    .string()
    .trim()
    .min(8, "Enter a valid mobile number.")
    .max(20, "Enter a valid mobile number."),
  addressLine1: z.string().trim().min(1, "Address is required.").max(500),
  addressLine2: z.string().trim().max(500).optional(),
  city: z.string().trim().min(1, "City is required.").max(100),
  state: z.string().trim().min(1, "State is required.").max(100),
  postalCode: z.string().trim().min(1, "PIN is required.").max(20),
});

export type PersonalFormValues = z.infer<typeof personalFormSchema>;

export const identityFormSchema = z.object({
  pan: z
    .string()
    .trim()
    .regex(panPattern, "Enter a valid PAN (AAAAA9999A)."),
  governmentIdType: z.enum(KYC_GOVERNMENT_ID_TYPES, {
    message: "Select a government ID type.",
  }),
  governmentIdNumber: z
    .string()
    .trim()
    .min(4, "Government ID number is required.")
    .max(50),
});

export type IdentityFormValues = z.infer<typeof identityFormSchema>;

const ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const upiPattern = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

/** FINAL: Bank Transfer AND UPI ID are both required (QR validated separately). */
export const payoutFormSchema = z.object({
  accountHolderName: z.string().trim().min(1, "Required"),
  bankName: z.string().trim().min(1, "Required"),
  accountNumber: z.string().trim().min(5, "Required"),
  ifsc: z.string().trim().regex(ifscPattern, "Enter a valid IFSC."),
  upiId: z.string().trim().regex(upiPattern, "Enter a valid UPI ID (name@bank)."),
});

export type PayoutFormValues = z.infer<typeof payoutFormSchema>;
