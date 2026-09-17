import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompaniesPage } from "./companies-page";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError, ApiNetworkError } from "@forge/api-client";

vi.mock("../api/crm-api", () => ({
  listCompanies: vi.fn(),
  createCompany: vi.fn(),
  updateCompany: vi.fn(),
  archiveCompany: vi.fn(),
}));

import { archiveCompany, createCompany, listCompanies, updateCompany } from "../api/crm-api";

const list = vi.mocked(listCompanies);
const create = vi.mocked(createCompany);
const archive = vi.mocked(archiveCompany);
const update = vi.mocked(updateCompany);

const envelope = {
  items: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      organizationId: "org-1",
      name: "Acme Steel",
      gstin: "27AAAAA0000A1Z5",
      billingState: "MH",
      billingAddress: null,
      tags: [],
      archivedAt: null,
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: null,
    },
  ],
  page: 1,
  pageSize: 25,
  total: 1,
};

describe("Companies page", () => {
  beforeEach(() => {
    list.mockReset();
    create.mockReset();
    archive.mockReset();
    update.mockReset();
    list.mockResolvedValue(envelope);
  });

  it("renders the list from the API", async () => {
    renderWithShell(<CompaniesPage />, createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] }));
    expect(await screen.findByRole("link", { name: "Acme Steel" })).toHaveAttribute(
      "href",
      "/crm/companies/11111111-1111-1111-1111-111111111111"
    );
    expect(screen.getByText("27AAAAA0000A1Z5")).toBeInTheDocument();
  });

  it("creates a company and confirms archive", async () => {
    const user = userEvent.setup();
    create.mockResolvedValue(envelope.items[0]!);
    archive.mockResolvedValue(undefined);
    renderWithShell(<CompaniesPage />, createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] }));

    await screen.findByRole("link", { name: "Acme Steel" });
    await user.click(screen.getByRole("button", { name: "New company" }));
    await user.type(screen.getByLabelText(/name/i), "Forge Demo");
    await user.click(screen.getByRole("button", { name: "Create company" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "Forge Demo" }));

    await user.click(screen.getByRole("button", { name: "Actions for Acme Steel" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(archive).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
  });

  it("surfaces backend validation errors on create", async () => {
    const user = userEvent.setup();
    create.mockRejectedValue(
      new ApiClientError(422, { code: "VALIDATION_ERROR", message: "GSTIN is invalid.", requestId: "r" })
    );
    renderWithShell(<CompaniesPage />, createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] }));
    await screen.findByRole("link", { name: "Acme Steel" });
    await user.click(screen.getByRole("button", { name: "New company" }));
    await user.type(screen.getByLabelText(/name/i), "Broken Co");
    await user.click(screen.getByRole("button", { name: "Create company" }));
    expect(await screen.findByText("GSTIN is invalid.")).toBeInTheDocument();
  });

  it("shows a 403 alert instead of leaking records", async () => {
    list.mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r1" })
    );
    renderWithShell(<CompaniesPage />, createAuthContext({ role: "TEAM_MEMBER", permissions: ["crm.read"] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
    expect(screen.queryByText("Acme Steel")).not.toBeInTheDocument();
  });

  it("hides manage actions without crm.manage", async () => {
    renderWithShell(<CompaniesPage />, createAuthContext({ role: "TEAM_MEMBER", permissions: ["crm.read"] }));
    await screen.findByRole("link", { name: "Acme Steel" });
    expect(screen.queryByRole("button", { name: "New company" })).not.toBeInTheDocument();
  });

  it("sends documented search and pagination query params", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue({ ...envelope, total: 40 });
    renderWithShell(<CompaniesPage />, createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] }));
    await screen.findByRole("link", { name: "Acme Steel" });

    await user.type(screen.getByRole("searchbox", { name: "Search companies" }), "Acme");
    await waitFor(() => {
      expect(list).toHaveBeenCalledWith(expect.objectContaining({ q: "Acme" }));
    });

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => {
      expect(list).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    });
  });

  it("edits a company from the row menu", async () => {
    const user = userEvent.setup();
    update.mockResolvedValue({ ...envelope.items[0]!, name: "Acme Revised" });
    renderWithShell(<CompaniesPage />, createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] }));
    await screen.findByRole("link", { name: "Acme Steel" });
    await user.click(screen.getByRole("button", { name: "Actions for Acme Steel" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const name = screen.getByLabelText(/name/i);
    await user.clear(name);
    await user.type(name, "Acme Revised");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(update).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      expect.objectContaining({ name: "Acme Revised" })
    );
  });

  it("shows session-expiry copy on 401 without leaking records", async () => {
    list.mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "expired", requestId: "r" })
    );
    renderWithShell(<CompaniesPage />, createAuthContext({ role: "SALES", permissions: ["crm.read"] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your session expired. Sign in again.");
    expect(screen.queryByText("Acme Steel")).not.toBeInTheDocument();
  });

  it("shows a network error without fabricating rows", async () => {
    list.mockRejectedValue(new ApiNetworkError(new Error("offline")));
    renderWithShell(<CompaniesPage />, createAuthContext({ role: "SALES", permissions: ["crm.read"] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t reach the API");
  });
});
