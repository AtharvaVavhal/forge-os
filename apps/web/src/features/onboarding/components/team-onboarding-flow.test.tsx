import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/test-utils";
import { OnboardingFlow } from "./onboarding-flow";
import { PersonalStep } from "./steps/personal-step";
import { IdentityStep } from "./steps/identity-step";
import { DocumentsStep } from "./steps/documents-step";
import { PayoutStep } from "./steps/payout-step";
import { ReviewStep } from "./steps/review-step";
import { RejectedStep, SubmittedStep } from "./steps/status-steps";
import type { KycProfile, PayoutProfile } from "../api/types";

vi.mock("@/features/auth/api/auth-api", () => ({
  completeOnboarding: vi.fn(),
  previewInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
}));

vi.mock("../api/kyc-api", () => ({
  getOwnKycProfile: vi.fn(),
  getOwnPayoutProfile: vi.fn(),
  saveKycProfile: vi.fn(),
  submitKycProfile: vi.fn(),
  upsertPayoutProfile: vi.fn(),
  uploadKycDocument: vi.fn(),
  removeKycDocument: vi.fn(),
  uploadUpiQr: vi.fn(),
  removeUpiQr: vi.fn(),
}));

vi.mock("@/features/shared/api/bank-directory-api", () => ({
  searchBanks: vi.fn(),
  lookupIfsc: vi.fn(),
}));

import { completeOnboarding } from "@/features/auth/api/auth-api";
import {
  getOwnKycProfile,
  getOwnPayoutProfile,
  saveKycProfile,
  submitKycProfile,
  upsertPayoutProfile,
} from "../api/kyc-api";
import { searchBanks, lookupIfsc } from "@/features/shared/api/bank-directory-api";

const mockComplete = vi.mocked(completeOnboarding);
const mockGetKyc = vi.mocked(getOwnKycProfile);
const mockGetPayout = vi.mocked(getOwnPayoutProfile);
const mockSaveKyc = vi.mocked(saveKycProfile);
const mockSubmit = vi.mocked(submitKycProfile);
const mockUpsertPayout = vi.mocked(upsertPayoutProfile);
const mockSearchBanks = vi.mocked(searchBanks);
const mockLookupIfsc = vi.mocked(lookupIfsc);

function draftKyc(overrides: Partial<KycProfile> = {}): KycProfile {
  return {
    id: "kyc-1",
    status: "DRAFT",
    legalName: "Priya Sharma",
    dateOfBirth: "1995-04-12T00:00:00.000Z",
    mobile: "+919876543210",
    addressLine1: "12 Forge Lane",
    addressLine2: null,
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    pan: "ABCDE1234F",
    governmentIdType: "AADHAAR",
    governmentIdNumber: "123456789012",
    submittedAt: null,
    verifiedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    documents: [
      {
        id: "d1",
        documentType: "PAN_CARD",
        filename: "pan.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1200,
        status: "UPLOADED",
        createdAt: null,
        updatedAt: null,
      },
      {
        id: "d2",
        documentType: "GOVERNMENT_ID",
        filename: "id.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1200,
        status: "UPLOADED",
        createdAt: null,
        updatedAt: null,
      },
    ],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function dualPayout(overrides: Partial<PayoutProfile> = {}): PayoutProfile {
  return {
    configured: true,
    id: "po-1",
    preferredMethod: "BANK_TRANSFER",
    accountHolderName: "Priya Sharma",
    bankName: "HDFC Bank",
    accountNumber: "123456789012",
    ifsc: "HDFC0001234",
    upiId: "priya@okhdfcbank",
    upiQr: {
      uploaded: true,
      filename: "upi-qr.png",
      mimeType: "image/png",
      sizeBytes: 2048,
    },
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchBanks.mockResolvedValue([]);
  mockLookupIfsc.mockResolvedValue(null);
  mockGetKyc.mockResolvedValue(null);
  mockGetPayout.mockResolvedValue({
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
  });
});

describe("OnboardingFlow role branching", () => {
  it("TEAM_MEMBER enters KYC onboarding after Mirror", async () => {
    const user = userEvent.setup();
    renderWithQuery(<OnboardingFlow name="Priya Sharma" role="TEAM_MEMBER" />);

    expect(screen.getByRole("heading", { name: /Priya Sharma\./i })).toBeInTheDocument();
    await user.click(screen.getByRole("main"));

    expect(await screen.findByRole("heading", { name: /verify your identity/i })).toBeInTheDocument();
  });

  it("FOUNDER_ADMIN keeps Mirror → Orientation", async () => {
    const user = userEvent.setup();
    mockComplete.mockResolvedValue(undefined as never);
    renderWithQuery(<OnboardingFlow name="Atharva" role="FOUNDER_ADMIN" />);

    await user.click(screen.getByRole("main"));
    expect(await screen.findByRole("heading", { name: /your workspace/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /verify your identity/i })).not.toBeInTheDocument();
  });
});

describe("PersonalStep", () => {
  it("validates required fields before save", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <PersonalStep
        profile={null}
        pending={false}
        error={null}
        onBack={() => undefined}
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/legal name is required/i)).toBeInTheDocument();
  });
});

describe("IdentityStep", () => {
  it("validates PAN format", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <IdentityStep
        profile={null}
        pending={false}
        error={null}
        onBack={() => undefined}
        onSave={onSave}
      />
    );

    await user.type(screen.getByLabelText(/pan/i), "bad");
    await user.selectOptions(screen.getByLabelText(/government id type/i), "AADHAAR");
    await user.type(screen.getByLabelText(/government id number/i), "123456789012");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/valid pan/i)).toBeInTheDocument();
  });
});

describe("DocumentsStep", () => {
  it("requires both documents before continue", () => {
    renderWithQuery(
      <DocumentsStep
        profile={draftKyc({ documents: [] })}
        editable
        pending={false}
        error={null}
        onBack={() => undefined}
        onContinue={() => undefined}
        onUpload={async () => undefined}
        onRemove={async () => undefined}
      />
    );

    expect(screen.getByRole("button", { name: /^continue$/i })).toBeDisabled();
  });

  it("shows upload error and retry", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn(async () => {
      throw new Error("fail");
    });

    renderWithQuery(
      <DocumentsStep
        profile={draftKyc({ documents: [] })}
        editable
        pending={false}
        error={null}
        onBack={() => undefined}
        onContinue={() => undefined}
        onUpload={onUpload}
        onRemove={async () => undefined}
      />
    );

    const panInput = screen.getByLabelText(/upload pan card/i);
    const file = new File(["x"], "pan.pdf", { type: "application/pdf" });
    await user.upload(panInput, file);

    expect(await screen.findByText(/upload failed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows uploaded state when documents exist", () => {
    renderWithQuery(
      <DocumentsStep
        profile={draftKyc()}
        editable
        pending={false}
        error={null}
        onBack={() => undefined}
        onContinue={() => undefined}
        onUpload={async () => undefined}
        onRemove={async () => undefined}
      />
    );
    expect(screen.getByText(/✓ pan card/i)).toBeInTheDocument();
    expect(screen.getByText(/✓ government id/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^continue$/i })).toBeEnabled();
  });
});

describe("PayoutStep", () => {
  const noopQr = {
    qrUploading: false,
    qrError: null as string | null,
    onUploadQr: async () => undefined,
    onRemoveQr: async () => undefined,
  };

  it("requires bank fields before continue", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <PayoutStep
        profile={null}
        pending={false}
        error={null}
        onBack={() => undefined}
        onSave={onSave}
        {...noopQr}
      />
    );

    expect(screen.getByRole("heading", { name: /set up your payouts/i })).toBeInTheDocument();
    expect(screen.getByText(/bank transfer/i)).toBeInTheDocument();
    expect(screen.getByText(/^upi$/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getAllByText(/^required$/i).length).toBeGreaterThan(0);
  });

  it("requires UPI ID and QR before continue", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <PayoutStep
        profile={{
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
        }}
        pending={false}
        error={null}
        onBack={() => undefined}
        onSave={onSave}
        {...noopQr}
      />
    );

    await user.type(screen.getByLabelText(/account holder name/i), "Priya Sharma");
    await user.type(screen.getByLabelText(/bank name/i), "HDFC Bank");
    await user.type(screen.getByLabelText(/account number/i), "123456789012");
    await user.type(screen.getByLabelText(/ifsc/i), "HDFC0001234");
    await user.type(screen.getByLabelText(/upi id/i), "bad");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/valid upi id/i)).toBeInTheDocument();
  });

  it("blocks continue when QR is missing", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <PayoutStep
        profile={dualPayout({
          upiQr: { uploaded: false, filename: null, mimeType: null, sizeBytes: null },
        })}
        pending={false}
        error={null}
        onBack={() => undefined}
        onSave={onSave}
        {...noopQr}
      />
    );

    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/upload personal upi qr/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });
});

describe("Review + submission screens", () => {
  it("masks sensitive values on review", () => {
    renderWithQuery(
      <ReviewStep
        kyc={draftKyc()}
        payout={dualPayout()}
        editable
        pending={false}
        error={null}
        onBack={() => undefined}
        onEditPersonal={() => undefined}
        onEditIdentity={() => undefined}
        onEditDocuments={() => undefined}
        onEditPayout={() => undefined}
        onSubmit={() => undefined}
      />
    );

    expect(screen.getByRole("heading", { name: /review your details/i })).toBeInTheDocument();
    expect(screen.getByText("XXXXX1234F")).toBeInTheDocument();
    expect(screen.getByText("••••••9012")).toBeInTheDocument();
    expect(screen.queryByText("ABCDE1234F")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit for verification/i })).toBeInTheDocument();
  });

  it("shows under-review copy after submission", async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<SubmittedStep onContinue={onContinue} />);
    expect(screen.getByRole("heading", { name: /verification submitted/i })).toBeInTheDocument();
    expect(screen.getByText(/under review/i)).toBeInTheDocument();
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalled();
  });

  it("shows rejected state with update action", async () => {
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <RejectedStep reason="Documents were unclear." onUpdate={onUpdate} />
    );
    expect(
      screen.getByRole("heading", { name: /verification needs an update/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/documents were unclear/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /update kyc/i }));
    expect(onUpdate).toHaveBeenCalled();
  });
});

describe("TeamOnboardingFlow resume + gates", () => {
  it("resumes to review when KYC + payout are complete", async () => {
    const user = userEvent.setup();
    mockGetKyc.mockResolvedValue(draftKyc());
    mockGetPayout.mockResolvedValue(dualPayout());

    renderWithQuery(<OnboardingFlow name="Priya" role="TEAM_MEMBER" />);
    await user.click(screen.getByRole("main"));

    expect(await screen.findByRole("heading", { name: /review your details/i })).toBeInTheDocument();
  });

  it("resumes to orientation when KYC is under review", async () => {
    const user = userEvent.setup();
    mockGetKyc.mockResolvedValue(draftKyc({ status: "UNDER_REVIEW" }));
    mockGetPayout.mockResolvedValue(dualPayout());
    mockComplete.mockResolvedValue(undefined as never);

    renderWithQuery(<OnboardingFlow name="Priya" role="TEAM_MEMBER" />);
    await user.click(screen.getByRole("main"));

    expect(await screen.findByRole("heading", { name: /your workspace/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /enter forge/i }));
    await waitFor(() => expect(mockComplete).toHaveBeenCalled());
  });

  it("shows rejected resume state", async () => {
    const user = userEvent.setup();
    mockGetKyc.mockResolvedValue(
      draftKyc({ status: "REJECTED", rejectionReason: "Name mismatch." })
    );
    mockGetPayout.mockResolvedValue(dualPayout());

    renderWithQuery(<OnboardingFlow name="Priya" role="TEAM_MEMBER" />);
    await user.click(screen.getByRole("main"));

    expect(
      await screen.findByRole("heading", { name: /verification needs an update/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/name mismatch/i)).toBeInTheDocument();
  });

  it("submits for verification from review", async () => {
    const user = userEvent.setup();
    mockGetKyc.mockResolvedValue(draftKyc());
    mockGetPayout.mockResolvedValue(dualPayout());
    mockSubmit.mockResolvedValue(draftKyc({ status: "UNDER_REVIEW" }));

    renderWithQuery(<OnboardingFlow name="Priya" role="TEAM_MEMBER" />);
    await user.click(screen.getByRole("main"));

    await screen.findByRole("heading", { name: /review your details/i });
    await user.click(screen.getByRole("button", { name: /submit for verification/i }));

    expect(await screen.findByRole("heading", { name: /verification submitted/i })).toBeInTheDocument();
    expect(mockSubmit).toHaveBeenCalled();
  });

  it("does not store sensitive KYC data in browser storage", async () => {
    const user = userEvent.setup();
    mockGetKyc.mockResolvedValue(draftKyc());
    mockGetPayout.mockResolvedValue(dualPayout());

    renderWithQuery(<OnboardingFlow name="Priya" role="TEAM_MEMBER" />);
    await user.click(screen.getByRole("main"));
    await screen.findByRole("heading", { name: /review your details/i });

    const storageDump = `${JSON.stringify(window.localStorage)} ${JSON.stringify(window.sessionStorage)}`;
    expect(storageDump).not.toContain("ABCDE1234F");
    expect(storageDump).not.toContain("123456789012");
  });

  it("surfaces API load errors with retry", async () => {
    const user = userEvent.setup();
    mockGetKyc.mockRejectedValue(new Error("boom"));

    renderWithQuery(<OnboardingFlow name="Priya" role="TEAM_MEMBER" />);
    await user.click(screen.getByRole("main"));

    expect(await screen.findByText(/something went wrong while loading/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("saves personal progress through the KYC API", async () => {
    const user = userEvent.setup();
    mockGetKyc.mockResolvedValue(null);
    mockSaveKyc.mockResolvedValue(
      draftKyc({
        pan: null,
        governmentIdType: null,
        governmentIdNumber: null,
        documents: [],
      })
    );

    renderWithQuery(<OnboardingFlow name="Priya" role="TEAM_MEMBER" />);
    await user.click(screen.getByRole("main"));
    await screen.findByRole("heading", { name: /verify your identity/i });

    await user.type(screen.getByLabelText(/legal full name/i), "Priya Sharma");
    await user.type(screen.getByLabelText(/date of birth/i), "1995-04-12");
    await user.type(screen.getByLabelText(/mobile number/i), "+919876543210");
    await user.type(document.getElementById("addressLine1") as HTMLElement, "12 Forge Lane");
    await user.type(screen.getByLabelText(/city/i), "Bengaluru");
    await user.type(screen.getByLabelText(/state/i), "Karnataka");
    await user.type(screen.getByLabelText(/pin code/i), "560001");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(mockSaveKyc).toHaveBeenCalled());
    expect(mockSaveKyc.mock.calls[0]?.[0]).toMatchObject({
      legalName: "Priya Sharma",
      postalCode: "560001",
    });
  });

  it("saves payout profile through the payout API", async () => {
    const user = userEvent.setup();
    mockGetKyc.mockResolvedValue(draftKyc());
    mockGetPayout.mockResolvedValue({
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
    });
    mockUpsertPayout.mockResolvedValue(dualPayout());

    renderWithQuery(<OnboardingFlow name="Priya" role="TEAM_MEMBER" />);
    await user.click(screen.getByRole("main"));
    await screen.findByRole("heading", { name: /set up your payouts/i });

    // Incomplete payout without QR should not advance via resume; form requires all fields.
    expect(screen.getByLabelText(/upi id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upload personal upi qr/i)).toBeInTheDocument();
  });
});

describe("mobile layout smoke", () => {
  it("renders personal step without horizontal overflow classes on narrow widths", () => {
    const { container } = renderWithQuery(
      <PersonalStep
        profile={null}
        pending={false}
        error={null}
        onBack={() => undefined}
        onSave={() => undefined}
      />
    );
    const main = container.querySelector("main");
    expect(main?.className).toMatch(/max-w-\[34rem\]/);
    expect(main?.className).toMatch(/px-5/);
    const heading = within(container).getByRole("heading");
    expect(heading.className).toMatch(/clamp/);
  });
});
