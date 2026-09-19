import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/test-utils";
import { PayoutStep } from "./payout-step";
import { TEAM_ONBOARDING_PROGRESS_STEPS } from "../../lib/resume";
import type { PayoutProfile } from "../../api/types";

vi.mock("@/features/shared/api/bank-directory-api", () => ({
  searchBanks: vi.fn(),
  lookupIfsc: vi.fn(),
}));

import { searchBanks, lookupIfsc } from "@/features/shared/api/bank-directory-api";

const mockSearchBanks = vi.mocked(searchBanks);
const mockLookupIfsc = vi.mocked(lookupIfsc);

const noopQr = {
  qrUploading: false,
  qrError: null as string | null,
  onUploadQr: async () => undefined,
  onRemoveQr: async () => undefined,
  steps: TEAM_ONBOARDING_PROGRESS_STEPS,
  currentIndex: 3,
};

function emptyProfile(overrides: Partial<PayoutProfile> = {}): PayoutProfile {
  return {
    configured: false,
    id: null,
    preferredMethod: null,
    accountHolderName: null,
    bankName: null,
    accountNumber: null,
    ifsc: null,
    upiId: null,
    upiQr: { uploaded: false, filename: null, mimeType: null, sizeBytes: null },
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchBanks.mockResolvedValue([]);
  mockLookupIfsc.mockResolvedValue(null);
});

describe("PayoutStep — K10 IFSC resolution", () => {
  it("uppercases IFSC input automatically", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <PayoutStep profile={null} pending={false} error={null} onBack={() => undefined} onSave={vi.fn()} {...noopQr} />
    );

    const ifscInput = screen.getByLabelText(/ifsc/i);
    await user.type(ifscInput, "hdfc0001234");
    expect(ifscInput).toHaveValue("HDFC0001234");
  });

  it("shows resolved bank/branch/city/state metadata for a valid, known IFSC", async () => {
    mockLookupIfsc.mockResolvedValue({
      ifsc: "HDFC0001234",
      bankName: "HDFC BANK",
      bankCode: "HDFC",
      branchName: "Park Street",
      address: "1 Park Street",
      city: "Kolkata",
      district: "Kolkata",
      state: "West Bengal",
    });
    const user = userEvent.setup();
    renderWithQuery(
      <PayoutStep profile={null} pending={false} error={null} onBack={() => undefined} onSave={vi.fn()} {...noopQr} />
    );

    await user.type(screen.getByLabelText(/ifsc/i), "HDFC0001234");

    await waitFor(() => expect(mockLookupIfsc).toHaveBeenCalledWith("HDFC0001234"));
    expect(await screen.findByText("Park Street")).toBeInTheDocument();
    expect(screen.getByText("Kolkata")).toBeInTheDocument();
    expect(screen.getByText("West Bengal")).toBeInTheDocument();
  });

  it("shows a not-found state for a well-formed but unknown IFSC, without blocking", async () => {
    mockLookupIfsc.mockResolvedValue(null);
    const user = userEvent.setup();
    renderWithQuery(
      <PayoutStep profile={null} pending={false} error={null} onBack={() => undefined} onSave={vi.fn()} {...noopQr} />
    );

    await user.type(screen.getByLabelText(/ifsc/i), "ZZZZ0999999");

    expect(await screen.findByText(/not found in our bank directory/i)).toBeInTheDocument();
  });

  it("warns on a bank/IFSC mismatch and lets the user accept the resolved bank", async () => {
    mockLookupIfsc.mockResolvedValue({
      ifsc: "HDFC0001234",
      bankName: "HDFC BANK",
      bankCode: "HDFC",
      branchName: "Park Street",
      address: "1 Park Street",
      city: "Kolkata",
      district: "Kolkata",
      state: "West Bengal",
    });
    const user = userEvent.setup();
    renderWithQuery(
      <PayoutStep profile={null} pending={false} error={null} onBack={() => undefined} onSave={vi.fn()} {...noopQr} />
    );

    await user.type(screen.getByLabelText(/bank name/i), "ICICI Bank");
    await user.type(screen.getByLabelText(/ifsc/i), "HDFC0001234");

    expect(await screen.findByText(/this ifsc belongs to hdfc bank/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /use hdfc bank/i }));

    expect(screen.getByLabelText(/bank name/i)).toHaveValue("HDFC BANK");
    await waitFor(() =>
      expect(screen.queryByText(/this ifsc belongs to/i)).not.toBeInTheDocument()
    );
  });

  it("shows no mismatch warning when the bank name matches the resolved bank", async () => {
    mockLookupIfsc.mockResolvedValue({
      ifsc: "HDFC0001234",
      bankName: "HDFC BANK",
      bankCode: "HDFC",
      branchName: "Park Street",
      address: "1 Park Street",
      city: "Kolkata",
      district: "Kolkata",
      state: "West Bengal",
    });
    const user = userEvent.setup();
    renderWithQuery(
      <PayoutStep profile={null} pending={false} error={null} onBack={() => undefined} onSave={vi.fn()} {...noopQr} />
    );

    await user.type(screen.getByLabelText(/bank name/i), "HDFC Bank");
    await user.type(screen.getByLabelText(/ifsc/i), "HDFC0001234");

    await screen.findByText("Park Street");
    expect(screen.queryByText(/this ifsc belongs to/i)).not.toBeInTheDocument();
  });

  it("leaves the existing UPI flow untouched", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <PayoutStep
        profile={emptyProfile()}
        pending={false}
        error={null}
        onBack={() => undefined}
        onSave={onSave}
        {...noopQr}
      />
    );

    await user.type(screen.getByLabelText(/upi id/i), "priya@okhdfcbank");
    expect(screen.getByLabelText(/upi id/i)).toHaveValue("priya@okhdfcbank");
    expect(screen.getByLabelText(/upload personal upi qr/i)).toBeInTheDocument();
  });
});
