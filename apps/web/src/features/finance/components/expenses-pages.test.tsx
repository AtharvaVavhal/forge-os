import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpensesPage } from "./expenses-pages";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError } from "@forge/api-client";
import type { Expense } from "../api/types";

vi.mock("../api/finance-api", () => ({
  listExpenses: vi.fn(),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
}));

vi.mock("@/features/projects/api/projects-api", () => ({
  listProjects: vi.fn(),
}));

import { createExpense, listExpenses, updateExpense } from "../api/finance-api";
import { listProjects } from "@/features/projects/api/projects-api";

const expense: Expense = {
  id: "ex-1",
  organizationId: "org-1",
  projectId: null,
  project: null,
  description: "AWS March",
  amount: "4200.00",
  category: "infrastructure",
  incurredAt: "2026-03-10T00:00:00.000Z",
  recordedBy: "user-1",
  createdAt: null,
};

const manage = createAuthContext({
  role: "FINANCE",
  permissions: ["finance.read", "finance.manage"],
});

describe("Expenses", () => {
  beforeEach(() => {
    vi.mocked(listProjects).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    vi.mocked(listExpenses).mockResolvedValue({ items: [expense], page: 1, pageSize: 25, total: 1 });
    vi.mocked(createExpense).mockReset();
    vi.mocked(updateExpense).mockReset();
  });

  it("lists documented fields", async () => {
    renderWithShell(<ExpensesPage />, manage);
    expect(await screen.findByText("AWS March")).toBeInTheDocument();
    expect(screen.getByText("infrastructure")).toBeInTheDocument();
    expect(screen.getByText("₹4,200.00")).toBeInTheDocument();
  });

  it("validates create", async () => {
    const user = userEvent.setup();
    renderWithShell(<ExpensesPage />, manage);
    await user.click(await screen.findByRole("button", { name: "New expense" }));
    await user.click(screen.getByRole("button", { name: "Create expense" }));
    expect(await screen.findByText("Enter a description.")).toBeInTheDocument();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("edits from the row menu", async () => {
    const user = userEvent.setup();
    vi.mocked(updateExpense).mockResolvedValue({ ...expense, description: "AWS April" });
    renderWithShell(<ExpensesPage />, manage);
    await screen.findByText("AWS March");
    await user.click(screen.getByRole("button", { name: "Actions for AWS March" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const description = screen.getByLabelText(/description/i);
    await user.clear(description);
    await user.type(description, "AWS April");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateExpense).toHaveBeenCalledWith("ex-1", expect.objectContaining({ description: "AWS April" }));
  });

  it("hides manage actions without finance.manage", async () => {
    renderWithShell(<ExpensesPage />, createAuthContext({ permissions: ["finance.read"] }));
    await screen.findByText("AWS March");
    expect(screen.queryByRole("button", { name: "New expense" })).not.toBeInTheDocument();
  });

  it("shows 403 without leaking amounts", async () => {
    vi.mocked(listExpenses).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<ExpensesPage />, createAuthContext({ permissions: ["finance.read"] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
    expect(screen.queryByText("₹4,200.00")).not.toBeInTheDocument();
  });

  it("does not turn a 404 module into ₹0 expenses", async () => {
    vi.mocked(listExpenses).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<ExpensesPage />, manage);
    expect(await screen.findByText("Finance service is not currently available.")).toBeInTheDocument();
    expect(screen.queryByText("₹0.00")).not.toBeInTheDocument();
  });
});
