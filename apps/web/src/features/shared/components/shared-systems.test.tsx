import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityFeed } from "./activity-feed";
import { NotesPanel } from "./notes-panel";
import { DocumentsPanel } from "./documents-panel";
import { NotificationsPage } from "./notifications-ui";
import { AuditLogPage } from "./audit-log-page";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { ApiClientError } from "@forge/api-client";
import type {
  Activity,
  AuditLogRecord,
  DocumentRecord,
  Note,
  NotificationRecord,
} from "../api/types";

vi.mock("../api/shared-api", () => ({
  listActivities: vi.fn(),
  createActivity: vi.fn(),
  listNotes: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  listDocuments: vi.fn(),
  uploadDocument: vi.fn(),
  getDocumentDownloadUrl: vi.fn(),
  deleteDocument: vi.fn(),
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  listAuditLogs: vi.fn(),
  searchRecords: vi.fn(),
}));

import {
  createActivity,
  createNote,
  deleteDocument,
  getDocumentDownloadUrl,
  listActivities,
  listAuditLogs,
  listDocuments,
  listNotes,
  listNotifications,
  markNotificationRead,
  updateNote,
} from "../api/shared-api";

const activity: Activity = {
  id: "act-1",
  type: "CALL",
  summary: "Initial scoping call with client",
  occurredAt: "2026-03-01T10:00:00.000Z",
  companyId: "c1",
  contactId: null,
  dealId: null,
  projectId: null,
  createdBy: "user-1",
};

const note: Note = {
  id: "n1",
  body: "Follow up on GSTIN",
  visibility: "INTERNAL",
  companyId: "c1",
  contactId: null,
  dealId: null,
  projectId: null,
  createdBy: "user-1",
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: null,
};

const doc: DocumentRecord = {
  id: "d1",
  filename: "brief.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1200,
  category: "REQUIREMENT",
  visibility: "INTERNAL",
  companyId: "c1",
  contactId: null,
  dealId: null,
  projectId: null,
  invoiceId: null,
  uploadedBy: "user-1",
  deletedAt: null,
  createdAt: "2026-03-01T00:00:00.000Z",
};

const notification: NotificationRecord = {
  id: "nt1",
  type: "Invoice overdue",
  channel: "IN_APP",
  readAt: null,
  createdAt: "2026-03-02T00:00:00.000Z",
};

const audit: AuditLogRecord = {
  id: "a1",
  actorType: "USER",
  actorId: "user-1",
  action: "invoice.send",
  entityType: "Invoice",
  entityId: "inv-1",
  ipAddress: "127.0.0.1",
  createdAt: "2026-03-02T00:00:00.000Z",
};

const crmManage = createAuthContext({
  role: "SALES",
  permissions: ["crm.read", "crm.manage", "documents.read", "documents.manage"],
});

describe("Activities", () => {
  beforeEach(() => {
    vi.mocked(listActivities).mockResolvedValue({ items: [activity], limit: 25, nextCursor: null });
    vi.mocked(createActivity).mockReset();
  });

  it("lists activities for supported parent context", async () => {
    renderWithShell(<ActivityFeed companyId="c1" />, crmManage);
    expect(await screen.findByText("CALL")).toBeInTheDocument();
    expect(screen.getByText("Initial scoping call with client")).toBeInTheDocument();
  });

  it("shows loading state while fetching activities", () => {
    vi.mocked(listActivities).mockReturnValue(new Promise(() => {}));
    renderWithShell(<ActivityFeed companyId="c1" />, crmManage);
    expect(screen.getByText("Loading records")).toBeInTheDocument();
  });

  it("shows empty state when no activities exist", async () => {
    vi.mocked(listActivities).mockResolvedValue({ items: [], limit: 25, nextCursor: null });
    renderWithShell(<ActivityFeed companyId="c1" />, crmManage);
    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
  });

  it("shows unavailable on 404", async () => {
    vi.mocked(listActivities).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<ActivityFeed companyId="c1" />, crmManage);
    expect(await screen.findByText("Service is not currently available.")).toBeInTheDocument();
    expect(screen.queryByText("Initial scoping call with client")).not.toBeInTheDocument();
  });

  it("shows 403 forbidden without leaking activities", async () => {
    vi.mocked(listActivities).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<ActivityFeed companyId="c1" />, createAuthContext({ permissions: [] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
    expect(screen.queryByText("Initial scoping call with client")).not.toBeInTheDocument();
  });

  it("hides log activity button without manage permission", async () => {
    renderWithShell(
      <ActivityFeed companyId="c1" />,
      createAuthContext({ permissions: ["crm.read"] })
    );
    await screen.findByText("Initial scoping call with client");
    expect(screen.queryByRole("button", { name: "Log activity" })).not.toBeInTheDocument();
  });

  it("validates and logs a new activity", async () => {
    const user = userEvent.setup();
    vi.mocked(createActivity).mockResolvedValue({ ...activity, id: "act-2" });
    renderWithShell(<ActivityFeed companyId="c1" />, crmManage);

    await user.click(await screen.findByRole("button", { name: "Log activity" }));
    await user.type(screen.getByLabelText(/type/i), "MEETING");
    await user.type(screen.getByLabelText(/summary/i), "Architecture review meeting");
    const submitButtons = screen.getAllByRole("button", { name: "Log activity" });
    await user.click(submitButtons[submitButtons.length - 1]!);

    expect(createActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "MEETING",
        summary: "Architecture review meeting",
        companyId: "c1",
      })
    );
  });
});

describe("Notes panel", () => {
  beforeEach(() => {
    vi.mocked(listNotes).mockResolvedValue({ items: [note], limit: 25, nextCursor: null });
    vi.mocked(createNote).mockReset();
    vi.mocked(updateNote).mockReset();
  });

  it("lists parent-scoped notes", async () => {
    renderWithShell(<NotesPanel parent={{ companyId: "c1" }} />, crmManage);
    expect(await screen.findByText("Follow up on GSTIN")).toBeInTheDocument();
    expect(screen.getByText("Internal")).toBeInTheDocument();
  });

  it("shows loading state while fetching notes", () => {
    vi.mocked(listNotes).mockReturnValue(new Promise(() => {}));
    renderWithShell(<NotesPanel parent={{ companyId: "c1" }} />, crmManage);
    expect(screen.getByText("Loading records")).toBeInTheDocument();
  });

  it("shows empty state when no notes exist", async () => {
    vi.mocked(listNotes).mockResolvedValue({ items: [], limit: 25, nextCursor: null });
    renderWithShell(<NotesPanel parent={{ companyId: "c1" }} />, crmManage);
    expect(await screen.findByText("No notes")).toBeInTheDocument();
  });

  it("validates create", async () => {
    const user = userEvent.setup();
    renderWithShell(<NotesPanel parent={{ companyId: "c1" }} />, crmManage);
    await user.click(await screen.findByRole("button", { name: "Add note" }));
    const submitButtons = screen.getAllByRole("button", { name: "Add note" });
    await user.click(submitButtons[submitButtons.length - 1]!);
    expect(await screen.findByText("Enter a note.")).toBeInTheDocument();
    expect(createNote).not.toHaveBeenCalled();
  });

  it("updates an existing note", async () => {
    const user = userEvent.setup();
    vi.mocked(updateNote).mockResolvedValue({ ...note, body: "Updated GSTIN note" });
    renderWithShell(<NotesPanel parent={{ companyId: "c1" }} />, crmManage);

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const textarea = screen.getByRole("textbox", { name: /^note/i });
    await user.clear(textarea);
    await user.type(textarea, "Updated GSTIN note");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    expect(updateNote).toHaveBeenCalledWith("n1", {
      body: "Updated GSTIN note",
      visibility: "INTERNAL",
    });
  });

  it("hides write without manage", async () => {
    renderWithShell(
      <NotesPanel parent={{ companyId: "c1" }} />,
      createAuthContext({ permissions: ["crm.read"] })
    );
    await screen.findByText("Follow up on GSTIN");
    expect(screen.queryByRole("button", { name: "Add note" })).not.toBeInTheDocument();
  });

  it("shows unavailable on 404", async () => {
    vi.mocked(listNotes).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<NotesPanel parent={{ companyId: "c1" }} />, crmManage);
    expect(await screen.findByText("Service is not currently available.")).toBeInTheDocument();
    expect(screen.queryByText("Follow up on GSTIN")).not.toBeInTheDocument();
  });

  it("shows 403 forbidden state", async () => {
    vi.mocked(listNotes).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<NotesPanel parent={{ companyId: "c1" }} />, createAuthContext({ permissions: [] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
    expect(screen.queryByText("Follow up on GSTIN")).not.toBeInTheDocument();
  });

  it("shows session expiry on 401", async () => {
    vi.mocked(listNotes).mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "expired", requestId: "r" })
    );
    renderWithShell(<NotesPanel parent={{ companyId: "c1" }} />, crmManage);
    expect(await screen.findByText("Your session expired. Sign in again.")).toBeInTheDocument();
  });
});

describe("Documents panel", () => {
  beforeEach(() => {
    vi.mocked(listDocuments).mockResolvedValue({ items: [doc], limit: 25, nextCursor: null });
    vi.mocked(deleteDocument).mockReset();
    vi.mocked(getDocumentDownloadUrl).mockReset();
  });

  it("lists documents without exposing storage secrets", async () => {
    renderWithShell(<DocumentsPanel parent={{ companyId: "c1" }} />, crmManage);
    expect(await screen.findByText("brief.pdf")).toBeInTheDocument();
    expect(screen.getByText("Requirement")).toBeInTheDocument();
    expect(screen.queryByText(/r2/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/secret/i)).not.toBeInTheDocument();
  });

  it("shows loading state while fetching documents", () => {
    vi.mocked(listDocuments).mockReturnValue(new Promise(() => {}));
    renderWithShell(<DocumentsPanel parent={{ companyId: "c1" }} />, crmManage);
    expect(screen.getByText("Loading records")).toBeInTheDocument();
  });

  it("shows empty state when no documents exist", async () => {
    vi.mocked(listDocuments).mockResolvedValue({ items: [], limit: 25, nextCursor: null });
    renderWithShell(<DocumentsPanel parent={{ companyId: "c1" }} />, crmManage);
    expect(await screen.findByText("No documents")).toBeInTheDocument();
  });

  it("shows document service unavailable on 404", async () => {
    vi.mocked(listDocuments).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<DocumentsPanel parent={{ companyId: "c1" }} />, crmManage);
    expect(await screen.findByText("Document service is not currently available.")).toBeInTheDocument();
    expect(screen.queryByText("brief.pdf")).not.toBeInTheDocument();
  });

  it("shows 403 forbidden state", async () => {
    vi.mocked(listDocuments).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<DocumentsPanel parent={{ companyId: "c1" }} />, createAuthContext({ permissions: [] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
    expect(screen.queryByText("brief.pdf")).not.toBeInTheDocument();
  });

  it("shows session expiry on 401", async () => {
    vi.mocked(listDocuments).mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "expired", requestId: "r" })
    );
    renderWithShell(<DocumentsPanel parent={{ companyId: "c1" }} />, crmManage);
    expect(await screen.findByText("Your session expired. Sign in again.")).toBeInTheDocument();
  });

  it("hides upload without documents.manage", async () => {
    renderWithShell(
      <DocumentsPanel parent={{ companyId: "c1" }} />,
      createAuthContext({ permissions: ["documents.read"] })
    );
    await screen.findByText("brief.pdf");
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
  });

  it("triggers download url request", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.mocked(getDocumentDownloadUrl).mockResolvedValue("https://storage.forgebuilds.in/brief.pdf");

    renderWithShell(<DocumentsPanel parent={{ companyId: "c1" }} />, crmManage);
    await user.click(await screen.findByRole("button", { name: "Download" }));

    expect(getDocumentDownloadUrl).toHaveBeenCalledWith("d1", expect.anything());
    openSpy.mockRestore();
  });

  it("deletes document with confirmation dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteDocument).mockResolvedValue({ ...doc, deletedAt: "2026-03-02T00:00:00.000Z" });

    renderWithShell(<DocumentsPanel parent={{ companyId: "c1" }} />, crmManage);
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(screen.getByRole("dialog", { name: "Delete this document?" })).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    expect(deleteDocument).toHaveBeenCalledWith("d1");
  });
});

describe("Notifications", () => {
  beforeEach(() => {
    vi.mocked(listNotifications).mockResolvedValue({ items: [notification], limit: 50, nextCursor: null });
    vi.mocked(markNotificationRead).mockResolvedValue({ ...notification, readAt: "2026-03-03T00:00:00.000Z" });
  });

  it("lists API notifications and marks read", async () => {
    const user = userEvent.setup();
    renderWithShell(<NotificationsPage />, createAuthContext());
    expect(await screen.findByText("Invoice overdue")).toBeInTheDocument();
    expect(screen.getByText("Unread")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark read" }));
    expect(markNotificationRead).toHaveBeenCalledWith("nt1", expect.anything());
  });

  it("shows loading state while fetching notifications", () => {
    vi.mocked(listNotifications).mockReturnValue(new Promise(() => {}));
    renderWithShell(<NotificationsPage />, createAuthContext());
    expect(screen.getByText("Loading records")).toBeInTheDocument();
  });

  it("shows empty state when no notifications exist", async () => {
    vi.mocked(listNotifications).mockResolvedValue({ items: [], limit: 50, nextCursor: null });
    renderWithShell(<NotificationsPage />, createAuthContext());
    expect(await screen.findByText("No notifications")).toBeInTheDocument();
  });

  it("shows 403 forbidden state", async () => {
    vi.mocked(listNotifications).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<NotificationsPage />, createAuthContext({ permissions: [] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
  });

  it("shows session expiry on 401", async () => {
    vi.mocked(listNotifications).mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "expired", requestId: "r" })
    );
    renderWithShell(<NotificationsPage />, createAuthContext());
    expect(await screen.findByText("Your session expired. Sign in again.")).toBeInTheDocument();
  });

  it("does not invent unread counts on unavailable API", async () => {
    vi.mocked(listNotifications).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(<NotificationsPage />, createAuthContext());
    expect(await screen.findByText("Service is not currently available.")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("Audit log", () => {
  beforeEach(() => {
    vi.mocked(listAuditLogs).mockResolvedValue({ items: [audit], limit: 50, nextCursor: null });
  });

  it("renders read-only audit rows", async () => {
    renderWithShell(
      <AuditLogPage />,
      createAuthContext({ role: "FINANCE", permissions: ["audit.read"] })
    );
    expect(await screen.findByText("invoice.send")).toBeInTheDocument();
    expect(screen.getByText("Invoice")).toBeInTheDocument();
    expect(screen.getByText("inv-1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("shows loading state while fetching audit logs", () => {
    vi.mocked(listAuditLogs).mockReturnValue(new Promise(() => {}));
    renderWithShell(
      <AuditLogPage />,
      createAuthContext({ role: "FINANCE", permissions: ["audit.read"] })
    );
    expect(screen.getByText("Loading records")).toBeInTheDocument();
  });

  it("shows empty state when no audit logs exist", async () => {
    vi.mocked(listAuditLogs).mockResolvedValue({ items: [], limit: 50, nextCursor: null });
    renderWithShell(
      <AuditLogPage />,
      createAuthContext({ role: "FINANCE", permissions: ["audit.read"] })
    );
    expect(await screen.findByText("No audit entries")).toBeInTheDocument();
  });

  it("shows unavailable on 404", async () => {
    vi.mocked(listAuditLogs).mockRejectedValue(
      new ApiClientError(404, { code: "NOT_FOUND", message: "missing", requestId: "r" })
    );
    renderWithShell(
      <AuditLogPage />,
      createAuthContext({ role: "FINANCE", permissions: ["audit.read"] })
    );
    expect(await screen.findByText("Service is not currently available.")).toBeInTheDocument();
  });

  it("shows 403 without leaking audit rows", async () => {
    vi.mocked(listAuditLogs).mockRejectedValue(
      new ApiClientError(403, { code: "FORBIDDEN", message: "no", requestId: "r" })
    );
    renderWithShell(<AuditLogPage />, createAuthContext({ permissions: [] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don’t have permission to do this.");
    expect(screen.queryByText("invoice.send")).not.toBeInTheDocument();
  });

  it("shows session expiry on 401", async () => {
    vi.mocked(listAuditLogs).mockRejectedValue(
      new ApiClientError(401, { code: "UNAUTHORIZED", message: "expired", requestId: "r" })
    );
    renderWithShell(
      <AuditLogPage />,
      createAuthContext({ role: "FINANCE", permissions: ["audit.read"] })
    );
    expect(await screen.findByText("Your session expired. Sign in again.")).toBeInTheDocument();
  });
});
