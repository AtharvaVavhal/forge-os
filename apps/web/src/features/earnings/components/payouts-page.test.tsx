import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthContext, renderWithShell } from "@/test/test-utils";
import { PayoutsPage } from "./payouts-page";
import type { TeamPayoutListItem } from "../api/types";

vi.mock("../api/earnings-api", () => ({
  listPayouts: vi.fn(),
}));

import { listPayouts } from "../api/earnings-api";

const mockList = vi.mocked(listPayouts);
const financeManage = createAuthContext({ role: "FINANCE", permissions: ["finance.manage"] });

const item: TeamPayoutListItem = {
  id: "payout-1",
  userId: "user-1",
  userName: "Priya Sharma",
  amount: "1500.00",
  status: "UNDER_REVIEW",
  payoutMethod: "BANK_TRANSFER",
  requestedAt: "2026-06-01T00:00:00.000Z",
  paidAt: null,
};

beforeEach(() => vi.clearAllMocks());

describe("PayoutsPage", () => {
  it("lists withdrawal requests with amount and status from the server", async () => {
    mockList.mockResolvedValue({ items: [item], page: 1, pageSize: 25, total: 1 });
    renderWithShell(<PayoutsPage />, financeManage);
    expect(await screen.findByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("₹1,500.00")).toBeInTheDocument();
    expect(screen.getByText("UNDER REVIEW")).toBeInTheDocument();
  });

  it("shows an empty state when there are no requests", async () => {
    mockList.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    renderWithShell(<PayoutsPage />, financeManage);
    expect(await screen.findByText(/no withdrawal requests/i)).toBeInTheDocument();
  });
});
