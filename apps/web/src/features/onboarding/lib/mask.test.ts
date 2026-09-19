import { describe, expect, it } from "vitest";
import { maskAccountNumber, maskIfsc, maskPan, maskUpi } from "./mask";

describe("mask helpers", () => {
  it("masks PAN, account, UPI, and IFSC", () => {
    expect(maskPan("ABCDE1234F")).toBe("XXXXX1234F");
    expect(maskAccountNumber("123456789012")).toBe("••••••9012");
    expect(maskUpi("priya@okhdfcbank")).toBe("p•••@okhdfcbank");
    expect(maskIfsc("HDFC0001234")).toBe("HDFC••••••34");
  });
});
