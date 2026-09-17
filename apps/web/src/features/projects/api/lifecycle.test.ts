import { describe, expect, it } from "vitest";
import {
  isPhaseSkip,
  nextMilestoneStatuses,
  nextProjectPhase,
  nextProjectStatuses,
  nextTaskStatuses,
  previousMilestoneStatus,
} from "./lifecycle";

describe("Project lifecycle", () => {
  it("exposes documented status moves and uses complete separately from status", () => {
    expect(nextProjectStatuses("ACTIVE")).toEqual(["ON_HOLD", "AT_RISK", "CANCELLED"]);
    expect(nextProjectStatuses("COMPLETED")).toEqual([]);
  });

  it("advances phases linearly and flags skips", () => {
    expect(nextProjectPhase("PLANNING")).toBe("DESIGN");
    expect(isPhaseSkip("PLANNING", "DEVELOPMENT")).toBe(true);
    expect(isPhaseSkip("PLANNING", "DESIGN")).toBe(false);
  });

  it("keeps blocked out of the task status machine", () => {
    expect(nextTaskStatuses("TODO")).toEqual(["IN_PROGRESS"]);
    expect(nextTaskStatuses("DONE")).toEqual(["TODO"]);
  });

  it("requires a previous milestone for revert", () => {
    expect(nextMilestoneStatuses("PENDING")).toEqual(["IN_PROGRESS"]);
    expect(previousMilestoneStatus("COMPLETED")).toBe("AWAITING_APPROVAL");
  });
});
