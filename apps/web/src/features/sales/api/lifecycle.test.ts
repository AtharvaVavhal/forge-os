import { describe, expect, it } from "vitest";
import { canReviseProposal, nextProposalTransitions } from "./lifecycle";

describe("Proposal lifecycle", () => {
  it("does not expose arbitrary status changes", () => {
    expect(nextProposalTransitions("DRAFT")).toEqual([]);
    expect(nextProposalTransitions("SENT")).toEqual(["VIEWED", "REJECTED", "EXPIRED"]);
    expect(nextProposalTransitions("ACCEPTED")).toEqual([]);
    expect(canReviseProposal("DRAFT")).toBe(false);
    expect(canReviseProposal("SENT")).toBe(true);
  });
});
