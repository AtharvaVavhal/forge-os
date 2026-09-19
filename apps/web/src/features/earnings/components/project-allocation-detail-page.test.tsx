import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { routerMocks } from "@/test/setup";
import { ProjectAllocationDetailPage } from "./project-allocation-detail-page";
import type { ProjectAllocation } from "../api/types";

vi.mock("../api/earnings-api", () => ({
  getProjectAllocation: vi.fn(),
  approveProjectAllocation: vi.fn(),
  cancelProjectAllocation: vi.fn(),
  adjustProjectAllocation: vi.fn(),
  replaceProjectAllocationLines: vi.fn(),
}));
vi.mock("@/features/team/api/team-api", () => ({
  listTeamMembers: vi.fn(),
}));

import {
  adjustProjectAllocation,
  approveProjectAllocation,
  cancelProjectAllocation,
  getProjectAllocation,
  replaceProjectAllocationLines,
} from "../api/earnings-api";
import { listTeamMembers } from "@/features/team/api/team-api";

const mockGet = vi.mocked(getProjectAllocation);
const mockApprove = vi.mocked(approveProjectAllocation);
const mockCancel = vi.mocked(cancelProjectAllocation);
const mockAdjust = vi.mocked(adjustProjectAllocation);
const mockReplaceLines = vi.mocked(replaceProjectAllocationLines);
const mockListMembers = vi.mocked(listTeamMembers);

const financeManage = createAuthContext({ role: "FINANCE", permissions: ["finance.read", "finance.manage"] });
const financeReadOnly = createAuthContext({ role: "FINANCE", permissions: ["finance.read"] });

function draftAllocation(overrides: Partial<ProjectAllocation> = {}): ProjectAllocation {
  return {
    id: "alloc-1",
    projectId: "proj-1",
    projectName: "Website Revamp",
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListMembers.mockResolvedValue({
    items: [{ id: "member-1", organizationId: "org-1", email: "m@forgebuilds.in", name: "Priya", role: "TEAM_MEMBER", active: true, lastLoginAt: null, createdAt: null }],
    page: 1,
    pageSize: 200,
    total: 1,
  });
});

describe("ProjectAllocationDetailPage — RBAC", () => {
  it("hides write actions for finance.read-only", async () => {
    mockGet.mockResolvedValue(draftAllocation());
    renderWithShell(<ProjectAllocationDetailPage id="alloc-1" />, financeReadOnly);
    await screen.findByText("Website Revamp");
    expect(screen.queryByRole("button", { name: /approve round/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit lines/i })).not.toBeInTheDocument();
  });
});

describe("ProjectAllocationDetailPage — editing lines", () => {
  it("replaces lines with the member and amount entered", async () => {
    mockGet.mockResolvedValue(draftAllocation());
    mockReplaceLines.mockResolvedValue(draftAllocation({ totalAllocated: "1000.00", version: 2 }));
    const user = userEvent.setup();
    renderWithShell(<ProjectAllocationDetailPage id="alloc-1" />, financeManage);

    await user.click(await screen.findByRole("button", { name: /edit lines/i }));
    await screen.findByText("Priya");
    await user.selectOptions(screen.getByLabelText(/member/i), "member-1");
    await user.type(screen.getByLabelText(/amount/i), "1000.00");
    await user.click(screen.getByRole("button", { name: /save lines/i }));

    await waitFor(() =>
      expect(mockReplaceLines).toHaveBeenCalledWith("alloc-1", {
        version: 1,
        lines: [{ userId: "member-1", amount: "1000.00", note: undefined }],
      })
    );
  });
});

describe("ProjectAllocationDetailPage — approve", () => {
  it("approves after confirmation", async () => {
    mockGet.mockResolvedValue(draftAllocation({ lines: [{ id: "l1", userId: "member-1", userName: "Priya", userEmail: "m@forgebuilds.in", amount: "1000.00", note: null, createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z" }] }));
    mockApprove.mockResolvedValue(draftAllocation({ status: "APPROVED", version: 2 }));
    const user = userEvent.setup();
    renderWithShell(<ProjectAllocationDetailPage id="alloc-1" />, financeManage);

    await user.click(await screen.findByRole("button", { name: /approve round/i }));
    expect(await screen.findByText(/approve this round/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve round" }));

    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith("alloc-1", 1));
  });

  it("surfaces a pool-exceeded conflict from the server", async () => {
    mockGet.mockResolvedValue(draftAllocation());
    const { ApiClientError } = await import("@forge/api-client");
    mockApprove.mockRejectedValue(
      new ApiClientError(422, {
        code: "ALLOCATION_EXCEEDS_DISTRIBUTABLE_POOL",
        message: "Approving this allocation would exceed the project's current distributable pool.",
        requestId: "r",
      })
    );
    const user = userEvent.setup();
    renderWithShell(<ProjectAllocationDetailPage id="alloc-1" />, financeManage);

    await user.click(await screen.findByRole("button", { name: /approve round/i }));
    await user.click(await screen.findByRole("button", { name: "Approve round" }));

    expect(await screen.findByText(/Couldn.t approve/i)).toBeInTheDocument();
  });
});

describe("ProjectAllocationDetailPage — cancel and adjust", () => {
  it("cancels a draft round after confirmation", async () => {
    mockGet.mockResolvedValue(draftAllocation());
    mockCancel.mockResolvedValue(draftAllocation({ status: "CANCELLED", version: 2 }));
    const user = userEvent.setup();
    renderWithShell(<ProjectAllocationDetailPage id="alloc-1" />, financeManage);

    await user.click(await screen.findByRole("button", { name: /cancel round/i }));
    await user.click(await screen.findByRole("button", { name: "Cancel round" }));

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("alloc-1", 1));
  });

  it("starts a correction round and navigates to it", async () => {
    mockGet.mockResolvedValue(draftAllocation({ status: "APPROVED", approvedAt: "2026-06-02T00:00:00.000Z" }));
    mockAdjust.mockResolvedValue(draftAllocation({ id: "alloc-2", adjustmentOfId: "alloc-1" }));
    const user = userEvent.setup();
    renderWithShell(<ProjectAllocationDetailPage id="alloc-1" />, financeManage);

    await user.click(await screen.findByRole("button", { name: /start correction round/i }));

    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledWith("/finance/project-allocations/alloc-2"));
  });
});
