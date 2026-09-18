import { describe, expect, it } from "vitest";
import {
  identityFormSchema,
  personalFormSchema,
  payoutFormSchema,
} from "./forms";

describe("personalFormSchema", () => {
  it("requires core personal fields", () => {
    const ok = personalFormSchema.safeParse({
      legalName: "Priya Sharma",
      dateOfBirth: "1995-04-12",
      mobile: "+919876543210",
      addressLine1: "12 Forge Lane",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
    });
    expect(ok.success).toBe(true);

    const bad = personalFormSchema.safeParse({
      legalName: "",
      dateOfBirth: "",
      mobile: "1",
      addressLine1: "",
      city: "",
      state: "",
      postalCode: "",
    });
    expect(bad.success).toBe(false);
  });
});

describe("identityFormSchema", () => {
  it("validates PAN and government ID enum", () => {
    expect(
      identityFormSchema.safeParse({
        pan: "ABCDE1234F",
        governmentIdType: "AADHAAR",
        governmentIdNumber: "123456789012",
      }).success
    ).toBe(true);

    expect(
      identityFormSchema.safeParse({
        pan: "bad",
        governmentIdType: "PASSPORT",
        governmentIdNumber: "X",
      }).success
    ).toBe(false);

    expect(
      identityFormSchema.safeParse({
        pan: "ABCDE1234F",
        governmentIdType: "SSN",
        governmentIdNumber: "1234",
      }).success
    ).toBe(false);
  });
});

describe("payoutFormSchema", () => {
  it("requires bank fields and UPI ID together", () => {
    expect(
      payoutFormSchema.safeParse({
        accountHolderName: "Priya",
        bankName: "HDFC",
        accountNumber: "12345678",
        ifsc: "HDFC0001234",
        upiId: "priya@okhdfcbank",
      }).success
    ).toBe(true);

    expect(
      payoutFormSchema.safeParse({
        accountHolderName: "Priya",
        bankName: "HDFC",
        accountNumber: "12",
        ifsc: "BAD",
        upiId: "priya@okhdfcbank",
      }).success
    ).toBe(false);

    expect(
      payoutFormSchema.safeParse({
        accountHolderName: "Priya",
        bankName: "HDFC",
        accountNumber: "12345678",
        ifsc: "HDFC0001234",
        upiId: "not-an-upi",
      }).success
    ).toBe(false);

    expect(
      payoutFormSchema.safeParse({
        accountHolderName: "Priya",
        bankName: "HDFC",
        accountNumber: "12345678",
        ifsc: "HDFC0001234",
      }).success
    ).toBe(false);
  });
});
