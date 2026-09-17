import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactsPage } from "./contacts-pages";
import { createAuthContext, renderWithShell } from "@/test/test-utils";

vi.mock("../api/crm-api", () => ({
  listContacts: vi.fn(),
  listCompanies: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  archiveContact: vi.fn(),
}));

import { createContact, listCompanies, listContacts, updateContact } from "../api/crm-api";

const companyId = "11111111-1111-1111-1111-111111111111";

const contact = {
  id: "ct-1",
  organizationId: "org-1",
  companyId,
  company: { id: companyId, name: "Acme" },
  name: "Priya",
  email: "priya@acme.test",
  phone: null,
  archivedAt: null,
  createdAt: "2026-02-01T00:00:00.000Z",
  updatedAt: null,
};

describe("Contacts page", () => {
  beforeEach(() => {
    vi.mocked(listCompanies).mockResolvedValue({
      items: [
        {
          id: companyId,
          organizationId: "org-1",
          name: "Acme",
          gstin: null,
          billingState: null,
          billingAddress: null,
          tags: [],
          archivedAt: null,
          createdAt: null,
          updatedAt: null,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    });
    vi.mocked(listContacts).mockResolvedValue({
      items: [contact],
      limit: 25,
      nextCursor: null,
    });
    vi.mocked(createContact).mockReset();
    vi.mocked(updateContact).mockReset();
  });

  it("renders contacts and the company relation", async () => {
    renderWithShell(
      <ContactsPage />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] })
    );

    expect(await screen.findByRole("link", { name: "Priya" })).toHaveAttribute("href", "/crm/contacts/ct-1");
    expect(screen.getByRole("link", { name: "Acme" })).toHaveAttribute("href", `/crm/companies/${companyId}`);
    expect(screen.getByText("priya@acme.test")).toBeInTheDocument();
  });

  it("creates a contact attached to a company", async () => {
    const user = userEvent.setup();
    vi.mocked(createContact).mockResolvedValue(contact);
    renderWithShell(
      <ContactsPage />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] })
    );
    await screen.findByRole("link", { name: "Priya" });
    await user.click(screen.getByRole("button", { name: "New contact" }));
    await user.type(screen.getByLabelText(/name/i), "Ravi");
    await user.selectOptions(screen.getByLabelText(/company/i), companyId);
    await user.click(screen.getByRole("button", { name: "Create contact" }));
    expect(createContact).toHaveBeenCalledWith(expect.objectContaining({ name: "Ravi", companyId }));
  });

  it("edits a contact from the row menu", async () => {
    const user = userEvent.setup();
    vi.mocked(updateContact).mockResolvedValue({ ...contact, name: "Priya Shah" });
    renderWithShell(
      <ContactsPage />,
      createAuthContext({ role: "SALES", permissions: ["crm.read", "crm.manage"] })
    );
    await screen.findByRole("link", { name: "Priya" });
    await user.click(screen.getByRole("button", { name: "Actions for Priya" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const name = screen.getByLabelText(/name/i);
    await user.clear(name);
    await user.type(name, "Priya Shah");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateContact).toHaveBeenCalledWith("ct-1", expect.objectContaining({ name: "Priya Shah" }));
  });
});
