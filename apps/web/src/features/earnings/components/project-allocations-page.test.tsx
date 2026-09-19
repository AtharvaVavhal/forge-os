import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ProjectAllocationsPage } from "./project-allocations-page";
import type { ProjectAllocation, ProjectAllocationListItem } from "../api/types";

vi.mock("../api/earnings-api", () => ({
  listProjectAllocations: vi.fn(),
  createProjectAllocation: vi.fn(),
}));
vi.mock("@/features/projects/api/projects-api", () => ({
  listProjects: vi.fn(),
}));

import { createProjectAllocation, listProjectAllocations } from "../api/earnings-api";
import { listProjects } from "@/features/projects/api/projects-api";

const mockList = vi.mocked(listProjectAllocations);
const mockCreate = vi.mocked(createProjectAllocation);
const mockListProjects = vi.mocked(listProjects);

const financeUser = createAuthContext({ role: "FINANCE", permissions: ["finance.read", "finance.manage"] });

const listItem: ProjectAllocationListItem = {
  id: "alloc-1",
  projectId: "proj-1",
  projectName: "Website Revamp",
  status: "DRAFT",
  adjustmentOfId: null,
  totalAllocated: "0.00",
  approvedAt: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

const createdAllocation: ProjectAllocation = {
  id: "alloc-2",
  projectId: "proj-2",
  projectName: "Mobile App",
  status: "DRAFT",
  adjustmentOfId: null,
  revenue: "10000.00",
  expenses: "0.00",
  distributable: "10000.00",
  totalAllocated: "0.00",
  projectCumulativeApprovedTotal: "0.00",
  projectRemaining: "10000.00",
  createdBy: { id: "user-1", name: "Atharva", email: "atharva@forgebuilds.in" },
  approvedBy: null,
  approvedAt: null,
  cancelledAt: null,
  version: 1,
  lines: [],
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListProjects.mockResolvedValue({
    items: [{ id: "proj-2", name: "Mobile App" } as never],
    page: 1,
    pageSize: 100,
    total: 1,
  });
});

describe("ProjectAllocationsPage — list", () => {
  it("renders allocation rounds from the server", async () => {
    mockList.mockResolvedValue({ items: [listItem], page: 1, pageSize: 25, total: 1 });
    renderWithShell(<ProjectAllocationsPage />, financeUser);
    expect(await screen.findByText("Website Revamp")).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
  });

  it("shows an empty state when there are no rounds", async () => {
    mockList.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    renderWithShell(<ProjectAllocationsPage />, financeUser);
    expect(await screen.findByText(/no allocation rounds/i)).toBeInTheDocument();
  });

  it("hides the create action for a role without finance.manage", async () => {
    mockList.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    renderWithShell(<ProjectAllocationsPage />, createAuthContext({ role: "FINANCE", permissions: ["finance.read"] }));
    await screen.findByText(/no allocation rounds/i);
    expect(screen.queryByRole("button", { name: /new allocation round/i })).not.toBeInTheDocument();
  });
});

describe("ProjectAllocationsPage — create", () => {
  it("creates a draft round against the selected project", async () => {
    mockList.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    mockCreate.mockResolvedValue(createdAllocation);
    const user = userEvent.setup();
    renderWithShell(<ProjectAllocationsPage />, financeUser);

    await user.click(await screen.findByRole("button", { name: /new allocation round/i }));
    await screen.findByText("Mobile App");
    await user.selectOptions(screen.getByLabelText(/project/i), "proj-2");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ projectId: "proj-2" }));
  });
});
