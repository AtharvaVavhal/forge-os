import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@forge/api-client";
import { renderWithShell } from "@/test/test-utils";
import { PayoutSettingsPanel } from "./payout-settings-panel";
import type { PayoutProfile } from "@/features/onboarding/api/types";

vi.mock("@/features/onboarding/api/kyc-api", () => ({
  getOwnPayoutProfile: vi.fn(),
  upsertPayoutProfile: vi.fn(),
}));

vi.mock("@/features/shared/api/bank-directory-api", () => ({
  searchBanks: vi.fn(),
  lookupIfsc: vi.fn(),
}));

import { getOwnPayoutProfile, upsertPayoutProfile } from "@/features/onboarding/api/kyc-api";
import { searchBanks, lookupIfsc } from "@/features/shared/api/bank-directory-api";

const mockGetOwnPayoutProfile = vi.mocked(getOwnPayoutProfile);
const mockUpsertPayoutProfile = vi.mocked(upsertPayoutProfile);
const mockSearchBanks = vi.mocked(searchBanks);
const mockLookupIfsc = vi.mocked(lookupIfsc);

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

function configuredProfile(overrides: Partial<PayoutProfile> = {}): PayoutProfile {
  return emptyProfile({
    configured: true,
    id: "payout-1",
    preferredMethod: "BANK_TRANSFER",
    accountHolderName: "Priya Sharma",
    bankName: "HDFC BANK",
    accountNumber: "1234567890123",
    ifsc: "HDFC0001234",
    upiId: "priya@okhdfcbank",
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchBanks.mockResolvedValue([]);
  mockLookupIfsc.mockResolvedValue(null);
});

describe("PayoutSettingsPanel — loading", () => {
  it("shows a loading state while the payout profile is being fetched", () => {
    mockGetOwnPayoutProfile.mockReturnValue(new Promise(() => {}));
    renderWithShell(<PayoutSettingsPanel />);
    expect(screen.getByLabelText(/loading payout details/i)).toBeInTheDocument();
  });
});

describe("PayoutSettingsPanel — empty state", () => {
  it("shows an empty state and an add-details action when nothing is configured", async () => {
    mockGetOwnPayoutProfile.mockResolvedValue(emptyProfile());
    renderWithShell(<PayoutSettingsPanel />);
    expect(await screen.findByText(/no payout details on file/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add payout details/i })).toBeInTheDocument();
  });
});

describe("PayoutSettingsPanel — masking", () => {
  it("masks account number, IFSC, and UPI ID by default, and reveals on demand", async () => {
    mockGetOwnPayoutProfile.mockResolvedValue(configuredProfile());
    const user = userEvent.setup();
    renderWithShell(<PayoutSettingsPanel />);

    await screen.findByText("Priya Sharma");
    // Account holder name and bank name are not sensitive — shown in clear.
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("HDFC BANK")).toBeInTheDocument();

    // Sensitive fields are masked by default.
    expect(screen.queryByText("1234567890123")).not.toBeInTheDocument();
    expect(screen.getByText("••••••0123")).toBeInTheDocument();
    expect(screen.queryByText("HDFC0001234")).not.toBeInTheDocument();
    expect(screen.getByText("HDFC••••••34")).toBeInTheDocument();
    expect(screen.queryByText("priya@okhdfcbank")).not.toBeInTheDocument();
    expect(screen.getByText("p•••@okhdfcbank")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reveal account number/i }));
    expect(screen.getByText("1234567890123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hide account number/i })).toBeInTheDocument();
  });

  it("shows the UPI QR upload status without exposing the file itself", async () => {
    mockGetOwnPayoutProfile.mockResolvedValue(
      configuredProfile({ upiQr: { uploaded: true, filename: "qr.png", mimeType: "image/png", sizeBytes: 1000 } })
    );
    renderWithShell(<PayoutSettingsPanel />);
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
  });
});

describe("PayoutSettingsPanel — editing", () => {
  it("pre-fills the edit form with the existing payout details", async () => {
    mockGetOwnPayoutProfile.mockResolvedValue(configuredProfile());
    const user = userEvent.setup();
    renderWithShell(<PayoutSettingsPanel />);

    await user.click(await screen.findByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText(/account holder name/i)).toHaveValue("Priya Sharma");
    expect(screen.getByLabelText(/bank name/i)).toHaveValue("HDFC BANK");
    expect(screen.getByLabelText(/account number/i)).toHaveValue("1234567890123");
    expect(screen.getByLabelText(/^ifsc/i)).toHaveValue("HDFC0001234");
    expect(screen.getByLabelText(/upi id/i)).toHaveValue("priya@okhdfcbank");
  });

  it("cancel returns to view mode without saving", async () => {
    mockGetOwnPayoutProfile.mockResolvedValue(configuredProfile());
    const user = userEvent.setup();
    renderWithShell(<PayoutSettingsPanel />);

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText(/account holder name/i));
    await user.type(screen.getByLabelText(/account holder name/i), "Someone Else");
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mockUpsertPayoutProfile).not.toHaveBeenCalled();
    expect(await screen.findByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.queryByText("Someone Else")).not.toBeInTheDocument();
  });
});

describe("PayoutSettingsPanel — validation (both methods required together)", () => {
  it("requires bank transfer fields and the UPI ID together — there is no either/or method toggle", async () => {
    mockGetOwnPayoutProfile.mockResolvedValue(emptyProfile());
    const user = userEvent.setup();
    renderWithShell(<PayoutSettingsPanel />);

    await user.click(await screen.findByRole("button", { name: /add payout details/i }));

    // No method switch/toggle exists — both sections are always present together.
    expect(screen.getByRole("heading", { name: /bank transfer/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^upi$/i })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save payout details/i }));

    expect(await screen.findAllByText("Required")).toHaveLength(3); // holder name, bank name, account number
    expect(screen.getByText("Enter a valid IFSC.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid UPI ID (name@bank).")).toBeInTheDocument();
    expect(mockUpsertPayoutProfile).not.toHaveBeenCalled();
  });

  it("rejects a malformed IFSC even when every other field is valid", async () => {
    mockGetOwnPayoutProfile.mockResolvedValue(emptyProfile());
    const user = userEvent.setup();
    renderWithShell(<PayoutSettingsPanel />);

    await user.click(await screen.findByRole("button", { name: /add payout details/i }));
    await user.type(screen.getByLabelText(/account holder name/i), "Priya Sharma");
    await user.type(screen.getByLabelText(/bank name/i), "HDFC Bank");
    await user.type(screen.getByLabelText(/account number/i), "1234567890123");
    await user.type(screen.getByLabelText(/^ifsc/i), "NOTANIFSC");
    await user.type(screen.getByLabelText(/upi id/i), "priya@okhdfcbank");
    await user.click(screen.getByRole("button", { name: /save payout details/i }));

    expect(await screen.findByText("Enter a valid IFSC.")).toBeInTheDocument();
    expect(mockUpsertPayoutProfile).not.toHaveBeenCalled();
  });
});

describe("PayoutSettingsPanel — save", () => {
  it("saves successfully, shows a success toast, and returns to the updated view", async () => {
    mockGetOwnPayoutProfile.mockResolvedValue(configuredProfile());
    mockUpsertPayoutProfile.mockResolvedValue(configuredProfile({ accountHolderName: "Priya S. Sharma" }));
    const user = userEvent.setup();
    renderWithShell(<PayoutSettingsPanel />);

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText(/account holder name/i));
    await user.type(screen.getByLabelText(/account holder name/i), "Priya S. Sharma");
    await user.click(screen.getByRole("button", { name: /save payout details/i }));

    await waitFor(() => expect(mockUpsertPayoutProfile).toHaveBeenCalledWith({
      accountHolderName: "Priya S. Sharma",
      bankName: "HDFC BANK",
      accountNumber: "1234567890123",
      ifsc: "HDFC0001234",
      upiId: "priya@okhdfcbank",
    }));

    expect(await screen.findByText("Payout details saved")).toBeInTheDocument();
    expect(await screen.findByText("Priya S. Sharma")).toBeInTheDocument();
    expect(screen.queryByLabelText(/save payout details/i)).not.toBeInTheDocument();
  });

  it("shows a danger toast and stays in edit mode when the save fails", async () => {
    mockGetOwnPayoutProfile.mockResolvedValue(configuredProfile());
    mockUpsertPayoutProfile.mockRejectedValue(
      new ApiClientError(400, {
        code: "BANK_IFSC_MISMATCH",
        message: "This IFSC belongs to HDFC BANK, not Test Bank.",
        requestId: "req-test",
      })
    );
    const user = userEvent.setup();
    renderWithShell(<PayoutSettingsPanel />);

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: /save payout details/i }));

    expect(await screen.findByText("Couldn’t save payout details")).toBeInTheDocument();
    expect(screen.getByText("This IFSC belongs to HDFC BANK, not Test Bank.")).toBeInTheDocument();
    // Still in edit mode — nothing was lost.
    expect(screen.getByRole("button", { name: /save payout details/i })).toBeInTheDocument();
  });
});
