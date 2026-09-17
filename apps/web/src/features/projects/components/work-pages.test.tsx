import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MilestonesPanel } from "./milestones-panel";
import { TasksPanel } from "./tasks-panel";
import { TimeEntriesPanel } from "./time-entries-panel";
import { MilestonesIndexPage, TasksIndexPage, TimeEntriesIndexPage } from "./work-pages";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError } from "@forge/api-client";
import type { Milestone, Project, Task, TimeEntry } from "../api/types";

vi.mock("../api/projects-api", () => ({
  listProjects: vi.fn(),
  listMilestones: vi.fn(),
  createMilestone: vi.fn(),
  transitionMilestone: vi.fn(),
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  transitionTask: vi.fn(),
  assignTask: vi.fn(),
  listTimeEntries: vi.fn(),
  createTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
}));

import {
  createTask,
  createTimeEntry,
  listMilestones,
  listProjects,
  listTasks,
  listTimeEntries,
  transitionMilestone,
  transitionTask,
  updateTask,
} from "../api/projects-api";

const project: Project = {
  id: "proj-1",
  organizationId: "org-1",
  name: "Atlas",
  dealId: null,
  acceptedProposalId: null,
  companyId: "c1",
  company: { id: "c1", name: "Acme" },
  status: "ACTIVE",
  phase: "DESIGN",
  ownerId: "user-1",
  deadline: null,
  handoverChecklist: [],
  completedAt: null,
  createdAt: null,
  updatedAt: null,
};

const pending: Milestone = {
  id: "ms-1",
  projectId: "proj-1",
  name: "Kickoff",
  status: "PENDING",
  requiresClientApproval: false,
  approvedAt: null,
  approvedByContactId: null,
  dueDate: "2026-04-01T00:00:00.000Z",
  sortOrder: 0,
};

const todo: Task = {
  id: "task-1",
  projectId: "proj-1",
  milestoneId: null,
  title: "Wireframes",
  status: "TODO",
  priority: "HIGH",
  assigneeId: null,
  dueDate: null,
  blockedByTaskId: "task-0",
  createdAt: null,
};

const entry: TimeEntry = {
  id: "te-1",
  taskId: "task-1",
  userId: "user-1",
  minutes: 90,
  loggedAt: "2026-03-04T00:00:00.000Z",
  createdAt: null,
};

const manage = createAuthContext({
  role: "OPERATIONS",
  permissions: ["projects.read", "projects.manage"],
});

describe("Milestones", () => {
  beforeEach(() => {
    vi.mocked(listMilestones).mockResolvedValue({ items: [pending], page: 1, pageSize: 25, total: 1 });
    vi.mocked(transitionMilestone).mockReset();
  });

  it("advances through documented statuses", async () => {
    const user = userEvent.setup();
    vi.mocked(transitionMilestone).mockResolvedValue({ ...pending, status: "IN_PROGRESS" });
    renderWithShell(<MilestonesPanel projectId="proj-1" />, manage);
    await user.click(await screen.findByRole("button", { name: "In Progress" }));
    expect(transitionMilestone).toHaveBeenCalledWith("ms-1", "IN_PROGRESS", undefined);
  });

  it("sends an optional reason when reverting", async () => {
    const user = userEvent.setup();
    vi.mocked(listMilestones).mockResolvedValue({
      items: [{ ...pending, status: "IN_PROGRESS" }],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    vi.mocked(transitionMilestone).mockResolvedValue(pending);
    renderWithShell(<MilestonesPanel projectId="proj-1" />, manage);
    await user.click(await screen.findByRole("button", { name: "Revert" }));
    await user.type(screen.getByLabelText(/reason/i), "Scope change");
    await user.click(screen.getByRole("button", { name: "Confirm revert" }));
    expect(transitionMilestone).toHaveBeenCalledWith("ms-1", "PENDING", "Scope change");
  });

  it("surfaces an invalid transition from the backend", async () => {
    const user = userEvent.setup();
    vi.mocked(transitionMilestone).mockRejectedValue(
      new ApiClientError(409, {
        code: "ILLEGAL_STATE_TRANSITION",
        message: "PENDING cannot move to COMPLETED.",
        requestId: "r",
      })
    );
    renderWithShell(<MilestonesPanel projectId="proj-1" />, manage);
    await user.click(await screen.findByRole("button", { name: "In Progress" }));
    expect(await screen.findByText("PENDING cannot move to COMPLETED.")).toBeInTheDocument();
  });
});

describe("Tasks", () => {
  beforeEach(() => {
    vi.mocked(listTasks).mockResolvedValue({ items: [todo], page: 1, pageSize: 25, total: 1 });
    vi.mocked(createTask).mockReset();
    vi.mocked(updateTask).mockReset();
    vi.mocked(transitionTask).mockReset();
  });

  it("renders blocked as a side flag next to status", async () => {
    renderWithShell(<TasksPanel projectId="proj-1" />, manage);
    expect(await screen.findByText("Wireframes")).toBeInTheDocument();
    expect(screen.getAllByText("Todo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(1);
    expect(screen.queryByText("To Do")).not.toBeInTheDocument();
  });

  it("creates, edits, and transitions through documented statuses", async () => {
    const user = userEvent.setup();
    vi.mocked(createTask).mockResolvedValue({ ...todo, id: "task-2", title: "QA pass", blockedByTaskId: null });
    vi.mocked(transitionTask).mockResolvedValue({ ...todo, status: "IN_PROGRESS" });
    vi.mocked(updateTask).mockResolvedValue({ ...todo, title: "Wireframes v2" });

    renderWithShell(<TasksPanel projectId="proj-1" />, manage);
    await user.click(await screen.findByRole("button", { name: "New task" }));
    await user.type(screen.getByLabelText(/title/i), "QA pass");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(createTask).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ title: "QA pass", priority: "MEDIUM" })
    );

    await user.click(screen.getByRole("button", { name: "In Progress" }));
    expect(transitionTask).toHaveBeenCalledWith("task-1", "IN_PROGRESS");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const title = screen.getByLabelText(/title/i);
    await user.clear(title);
    await user.type(title, "Wireframes v2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateTask).toHaveBeenCalledWith("task-1", expect.objectContaining({ title: "Wireframes v2" }));
  });

  it("validates title on create", async () => {
    const user = userEvent.setup();
    renderWithShell(<TasksPanel projectId="proj-1" />, manage);
    await user.click(await screen.findByRole("button", { name: "New task" }));
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByText("Enter a task title.")).toBeInTheDocument();
    expect(createTask).not.toHaveBeenCalled();
  });
});

describe("Time entries", () => {
  beforeEach(() => {
    vi.mocked(listTimeEntries).mockResolvedValue({ items: [entry], page: 1, pageSize: 25, total: 1 });
    vi.mocked(createTimeEntry).mockReset();
  });

  it("lists minutes and member without inventing billing", async () => {
    renderWithShell(<TimeEntriesPanel taskId="task-1" />, manage);
    expect(await screen.findByText("90")).toBeInTheDocument();
    expect(screen.getByText("user-1")).toBeInTheDocument();
  });

  it("creates with integer minutes and a date", async () => {
    const user = userEvent.setup();
    vi.mocked(createTimeEntry).mockResolvedValue(entry);
    renderWithShell(<TimeEntriesPanel taskId="task-1" />, manage);
    await user.click(await screen.findByRole("button", { name: "Log time" }));
    await user.type(screen.getByLabelText(/minutes/i), "45");
    await user.type(screen.getByLabelText(/logged at/i), "2026-03-05");
    await user.click(screen.getByRole("button", { name: "Save entry" }));
    expect(createTimeEntry).toHaveBeenCalledWith("task-1", { minutes: 45, loggedAt: "2026-03-05" });
  });

  it("rejects non-positive minutes", async () => {
    const user = userEvent.setup();
    renderWithShell(<TimeEntriesPanel taskId="task-1" />, manage);
    await user.click(await screen.findByRole("button", { name: "Log time" }));
    await user.type(screen.getByLabelText(/minutes/i), "0");
    await user.type(screen.getByLabelText(/logged at/i), "2026-03-05");
    await user.click(screen.getByRole("button", { name: "Save entry" }));
    expect(await screen.findByText("Enter minutes as a positive integer.")).toBeInTheDocument();
    expect(createTimeEntry).not.toHaveBeenCalled();
  });
});

describe("Nested index pages", () => {
  beforeEach(() => {
    vi.mocked(listProjects).mockResolvedValue({ items: [project], page: 1, pageSize: 100, total: 1 });
    vi.mocked(listMilestones).mockResolvedValue({ items: [pending], page: 1, pageSize: 25, total: 1 });
    vi.mocked(listTasks).mockResolvedValue({ items: [todo], page: 1, pageSize: 25, total: 1 });
    vi.mocked(listTimeEntries).mockResolvedValue({ items: [entry], page: 1, pageSize: 25, total: 1 });
  });

  it("loads milestones through a project picker instead of GET /milestones", async () => {
    renderWithShell(<MilestonesIndexPage />, manage);
    expect(await screen.findByText("Kickoff")).toBeInTheDocument();
    expect(listProjects).toHaveBeenCalled();
    expect(listMilestones).toHaveBeenCalledWith("proj-1");
  });

  it("loads tasks through a project picker instead of GET /tasks", async () => {
    renderWithShell(<TasksIndexPage />, manage);
    expect(await screen.findByText("Wireframes")).toBeInTheDocument();
    expect(listTasks).toHaveBeenCalledWith("proj-1");
  });

  it("loads time entries through project then task", async () => {
    renderWithShell(<TimeEntriesIndexPage />, manage);
    expect(await screen.findByText("90")).toBeInTheDocument();
    expect(listTasks).toHaveBeenCalledWith("proj-1");
    expect(listTimeEntries).toHaveBeenCalledWith("task-1");
  });
});
