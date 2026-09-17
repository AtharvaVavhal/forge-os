import { describe, expect, it } from "vitest";
import { parseHandoverItem, parseProject, parseTask, parseTimeEntry } from "./parse";

describe("Projects parsing", () => {
  it("parses handover JSON items", () => {
    const project = parseProject({
      id: "p1",
      name: "Atlas",
      companyId: "c1",
      ownerId: "u1",
      status: "ACTIVE",
      phase: "DESIGN",
      handover_checklist: [{ item: "Credentials", done: false }],
    });
    expect(project?.handoverChecklist).toEqual([
      { item: "Credentials", done: false, doneAt: null, doneBy: null },
    ]);
  });

  it("parses blocked as a side flag, not a status", () => {
    const task = parseTask({
      id: "t1",
      projectId: "p1",
      title: "Wireframes",
      status: "TODO",
      priority: "HIGH",
      blocked_by_task_id: "t0",
    });
    expect(task?.status).toBe("TODO");
    expect(task?.blockedByTaskId).toBe("t0");
  });

  it("rejects an incomplete handover item", () => {
    expect(parseHandoverItem({ item: "Missing done" })).toBeNull();
  });

  it("parses time entries without description or amount fields", () => {
    const entry = parseTimeEntry({
      id: "te1",
      taskId: "t1",
      userId: "u1",
      minutes: 90,
      logged_at: "2026-03-04T00:00:00.000Z",
    });
    expect(entry?.minutes).toBe(90);
    expect(entry).not.toHaveProperty("description");
    expect(entry).not.toHaveProperty("amount");
  });
});
