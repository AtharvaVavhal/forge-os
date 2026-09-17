import { describe, expect, it } from "vitest";
import { formatInr } from "./format-inr";

describe("formatInr", () => {
  it("formats Indian grouping without inventing arithmetic", () => {
    expect(formatInr("12000.00")).toBe("₹12,000.00");
    expect(formatInr("482000")).toBe("₹4,82,000");
    expect(formatInr("-5000.50")).toBe("-₹5,000.50");
  });
});
