import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "./top-bar";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { navigationState } from "@/test/setup";

vi.mock("@/features/shared/api/shared-api", async () => {
  const actual = await vi.importActual<typeof import("@/features/shared/api/shared-api")>(
    "@/features/shared/api/shared-api"
  );
  return {
    ...actual,
    listNotifications: vi.fn().mockResolvedValue({ items: [], limit: 8, nextCursor: null }),
    markNotificationRead: vi.fn(),
  };
});

import { listNotifications } from "@/features/shared/api/shared-api";

describe("TopBar", () => {
  beforeEach(() => {
    vi.mocked(listNotifications).mockResolvedValue({ items: [], limit: 8, nextCursor: null });
  });

  it("renders breadcrumb, search, notifications, and the signed-in user", () => {
    navigationState.pathname = "/crm/deals";
    renderWithShell(<TopBar />, createAuthContext({ role: "SALES" }));

    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("CRM");
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Deals");
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /atharva/i })).toBeInTheDocument();
  });

  it("opens the notifications panel against GET /notifications", async () => {
    const user = userEvent.setup();
    renderWithShell(<TopBar />);
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText(/view all/i)).toBeInTheDocument();
    expect(await screen.findByText("No notifications")).toBeInTheDocument();
  });

  it("exposes logout through the existing account menu", async () => {
    const user = userEvent.setup();
    renderWithShell(<TopBar />);
    await user.click(screen.getByRole("button", { name: /atharva/i }));
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("renders unread indicator dot only when unread notifications exist", async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      items: [
        {
          id: "n1",
          type: "Lead assigned",
          channel: "IN_APP",
          readAt: null,
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      ],
      limit: 8,
      nextCursor: null,
    });
    renderWithShell(<TopBar />);
    expect(await screen.findByTestId("notifications-unread-dot")).toBeInTheDocument();
  });

  it("does not render unread indicator dot when all notifications are read", () => {
    vi.mocked(listNotifications).mockResolvedValue({
      items: [
        {
          id: "n1",
          type: "Lead assigned",
          channel: "IN_APP",
          readAt: "2026-03-02T00:00:00.000Z",
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      ],
      limit: 8,
      nextCursor: null,
    });
    renderWithShell(<TopBar />);
    expect(screen.queryByTestId("notifications-unread-dot")).not.toBeInTheDocument();
  });
});
