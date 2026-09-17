import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectDetailPage, ProjectsPage } from "./projects-pages";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError } from "@forge/api-client";
import type { Project } from "../api/types";

vi.mock("../api/projects-api", () => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  transitionProjectStatus: vi.fn(),
  transitionProjectPhase: vi.fn(),
  updateHandoverChecklist: vi.fn(),
  completeProject: vi.fn(),
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

vi.mock("@/features/crm/api/crm-api", () => ({
  listCompanies: vi.fn(),
  listActivities: vi.fn(),
}));

import {
  completeProject,
  getProject,
  listMilestones,
  listProjects,
  listTasks,
  listTimeEntries,
  transitionProjectPhase,
  transitionProjectStatus,
  updateHandoverChecklist,
} from "../api/projects-api";
import { listActivities, listCompanies } from "@/features/crm/api/crm-api";

const project: Project = {
  id: "proj-1",
  organizationId: "org-1",
  name: "Atlas",
  dealId: "deal-1",
  acceptedProposalId: "prop-1",
  companyId: "c1",
  company: { id: "c1", name: "Acme" },
  status: "ACTIVE",
  phase: "PLANNING",
  ownerId: "user-1",
  deadline: "2026-06-01T00:00:00.000Z",
  handoverChecklist: [{ item: "Credentials", done: false, doneAt: null, doneBy: null }],
  completedAt: null,
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: null,
};

describe("Projects list", () => {
  beforeEach(() => {
    vi.mocked(listCompanies).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(listProjects).mockResolvedValue({ items: [project], page: 1, pageSize: 25, total: 1 });
  });

  it("renders name, client, status, and phase from the API", async () => {
    renderWithShell(
      <ProjectsPage />,
      createAuthContext({ role: "OPERATIONS", permissions: ["projects.read", "projects.manage"] })
    );
    expect(await screen.findByRole("link", { name: "Atlas" })).toHaveAttribute("href", "/projects/proj-1");
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getByText("Planning")).toBeInTheDocument();
  });

  it("hides create without projects.manage", async () => {
    renderWithShell(<ProjectsPage />, createAuthContext({ permissions: ["projects.read"] }));
    await screen.findByRole("link", { name: "Atlas" });
    expect(screen.queryByRole("button", { name: "New project" })).not.toBeInTheDocument();
  });

  it("shows empty copy without fabricating rows", async () => {
    vi.mocked(listProjects).mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    renderWithShell(<ProjectsPage />, createAuthContext({ permissions: ["projects.read"] }));
    expect(await screen.findByText("No projects")).toBeInTheDocument();
  });

  it("shows a 403 alert instead of leaking records", async () => {
    vi.mocked(listProjects).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<ProjectsPage />, createAuthContext({ permissions: ["projects.read"] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
    expect(screen.queryByText("Atlas")).not.toBeInTheDocument();
  });

  it("shows session-expiry copy on 401", async () => {
    vi.mocked(listProjects).mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "expired", requestId: "r" })
    );
    renderWithShell(<ProjectsPage />, createAuthContext({ permissions: ["projects.read"] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your session expired. Sign in again.");
  });
});

describe("Project detail", () => {
  beforeEach(() => {
    vi.mocked(listCompanies).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(listActivities).mockResolvedValue({ items: [], limit: 25, nextCursor: null });
    vi.mocked(listMilestones).mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    vi.mocked(listTasks).mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    vi.mocked(listTimeEntries).mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    vi.mocked(getProject).mockResolvedValue(project);
    vi.mocked(transitionProjectStatus).mockReset();
    vi.mocked(transitionProjectPhase).mockReset();
    vi.mocked(updateHandoverChecklist).mockReset();
    vi.mocked(completeProject).mockReset();
  });

  it("renders masthead fields and command actions", async () => {
    renderWithShell(
      <ProjectDetailPage id="proj-1" />,
      createAuthContext({ role: "OPERATIONS", permissions: ["projects.read", "projects.manage"] })
    );
    expect(await screen.findByRole("heading", { name: "Atlas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Acme" })).toHaveAttribute("href", "/crm/companies/c1");
    expect(screen.getByText("Planning")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "On Hold" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "At Risk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advance to Design" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change status/i })).not.toBeInTheDocument();
  });

  it("posts status and phase commands", async () => {
    const user = userEvent.setup();
    vi.mocked(transitionProjectStatus).mockResolvedValue({ ...project, status: "ON_HOLD" });
    vi.mocked(transitionProjectPhase).mockResolvedValue({ ...project, phase: "DESIGN" });
    renderWithShell(
      <ProjectDetailPage id="proj-1" />,
      createAuthContext({ role: "OPERATIONS", permissions: ["projects.read", "projects.manage"] })
    );
    await user.click(await screen.findByRole("button", { name: "On Hold" }));
    expect(transitionProjectStatus).toHaveBeenCalledWith("proj-1", "ON_HOLD");
    await user.click(screen.getByRole("button", { name: "Advance to Design" }));
    expect(transitionProjectPhase).toHaveBeenCalledWith("proj-1", "DESIGN", undefined);
  });

  it("surfaces a failed phase gate from the backend", async () => {
    const user = userEvent.setup();
    vi.mocked(transitionProjectPhase).mockRejectedValue(
      new ApiClientError(422, {
        code: "PHASE_PREREQUISITE",
        message: "Cannot leave PLANNING until kickoff milestone is complete.",
        requestId: "r",
      })
    );
    renderWithShell(
      <ProjectDetailPage id="proj-1" />,
      createAuthContext({ role: "OPERATIONS", permissions: ["projects.read", "projects.manage"] })
    );
    await user.click(await screen.findByRole("button", { name: "Advance to Design" }));
    expect(await screen.findByText("Cannot leave PLANNING until kickoff milestone is complete.")).toBeInTheDocument();
  });

  it("patches handover JSON items and does not invent checklist entities", async () => {
    const user = userEvent.setup();
    vi.mocked(updateHandoverChecklist).mockResolvedValue({
      ...project,
      handoverChecklist: [{ item: "Credentials", done: true, doneAt: "2026-03-03T00:00:00.000Z", doneBy: "user-1" }],
    });
    renderWithShell(
      <ProjectDetailPage id="proj-1" />,
      createAuthContext({ role: "OPERATIONS", permissions: ["projects.read", "projects.manage"] })
    );
    await user.click(await screen.findByRole("tab", { name: "Handover" }));
    await user.click(screen.getByLabelText("Credentials"));
    expect(updateHandoverChecklist).toHaveBeenCalledWith(
      "proj-1",
      expect.arrayContaining([expect.objectContaining({ item: "Credentials", done: true, doneBy: "user-1" })])
    );
  });

  it("hides status, phase, and handover edits without projects.manage", async () => {
    renderWithShell(<ProjectDetailPage id="proj-1" />, createAuthContext({ permissions: ["projects.read"] }));
    await screen.findByRole("heading", { name: "Atlas" });
    expect(screen.queryByRole("button", { name: "On Hold" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Advance to Design" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Handover" }));
    expect(screen.getByText(/Open — Credentials/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Credentials")).not.toBeInTheDocument();
  });

  it("blocks complete until the backend accepts the checklist", async () => {
    const user = userEvent.setup();
    vi.mocked(completeProject).mockRejectedValue(
      new ApiClientError(422, {
        code: "HANDOVER_INCOMPLETE",
        message: "Handover checklist must be fully done.",
        requestId: "r",
      })
    );
    renderWithShell(
      <ProjectDetailPage id="proj-1" />,
      createAuthContext({ role: "OPERATIONS", permissions: ["projects.read", "projects.manage"] })
    );
    await user.click(await screen.findByRole("button", { name: "Complete" }));
    await user.click(screen.getByRole("button", { name: "Complete project" }));
    expect(completeProject).toHaveBeenCalledWith("proj-1");
    expect(await screen.findByText("Handover checklist must be fully done.")).toBeInTheDocument();
  });
});
