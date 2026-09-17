import { describe, expect, it } from "vitest";
import { dealTransitionBody, isTerminalDeal, nextDealStage, nextLeadActions } from "./lifecycle";

describe("CRM lifecycle", () => {
  it("exposes explicit lead actions, not an arbitrary status list", () => {
    expect(nextLeadActions("NEW")).toEqual(["CONTACTED", "DISQUALIFY"]);
    expect(nextLeadActions("QUALIFIED")).toEqual(["CONVERT", "DISQUALIFY"]);
    expect(nextLeadActions("CONVERTED")).toEqual([]);
  });

  it("advances deals linearly and treats won/lost as terminal", () => {
    expect(nextDealStage("NEW")).toBe("CONTACTED");
    expect(nextDealStage("NEGOTIATION")).toBe("WON");
    expect(isTerminalDeal("WON")).toBe(true);
    expect(dealTransitionBody("LOST", "PRICE")).toEqual({ to: "LOST", lostReason: "PRICE" });
    expect(dealTransitionBody("WON")).toEqual({ to: "WON" });
  });
});
