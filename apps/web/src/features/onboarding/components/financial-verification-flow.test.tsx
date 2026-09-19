import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/test-utils";
import { FinancialVerificationFlow } from "./financial-verification-flow";
import { PersonalStep } from "./steps/personal-step";
import { IdentityStep } from "./steps/identity-step";
import { DocumentsStep } from "./steps/documents-step";
import { ReviewStep } from "./steps/review-step";
import { RejectedStep, SubmittedStep } from "./steps/status-steps";
import type { KycProfile } from "../api/types";

// K5 onboarding redesign — this is the standalone Financial Verification
// flow (PAN, government ID, documents, Finance review), reachable from the
// Verification tab and the withdrawal gate, entirely independent of
// onboarding (see team-onboarding-flow.test.tsx). Its step components are
// unchanged from the pre-K5 onboarding KYC steps — only their home moved.

vi.mock("../api/kyc-api", () => ({
  getOwnKycProfile: vi.fn(),
  saveKycProfile: vi.fn(),
  submitKycProfile: vi.fn(),
  uploadKycDocument: vi.fn(),
  removeKycDocument: vi.fn(),
}));

import {
  getOwnKycProfile,
  saveKycProfile,
  submitKycProfile,
} from "../api/kyc-api";

const mockGetKyc = vi.mocked(getOwnKycProfile);
const mockSaveKyc = vi.mocked(saveKycProfile);
const mockSubmit = vi.mocked(submitKycProfile);

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PersonalStep", () => {
  it("validates required fields before save", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <PersonalStep profile={null} pending={false} error={null} onBack={() => undefined} onSave={onSave} />
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
      <IdentityStep profile={null} pending={false} error={null} onBack={() => undefined} onSave={onSave} />
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

describe("Review + submission screens", () => {
  it("masks sensitive values on review (no payout content — that's set up during onboarding, not here)", () => {
    renderWithQuery(
      <ReviewStep
        kyc={draftKyc()}
        editable
        pending={false}
        error={null}
        onBack={() => undefined}
        onEditPersonal={() => undefined}
        onEditIdentity={() => undefined}
        onEditDocuments={() => undefined}
        onSubmit={() => undefined}
      />
    );

    expect(screen.getByRole("heading", { name: /review your details/i })).toBeInTheDocument();
    expect(screen.getByText("XXXXX1234F")).toBeInTheDocument();
    expect(screen.queryByText("ABCDE1234F")).not.toBeInTheDocument();
    expect(screen.queryByText(/bank transfer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^upi$/i)).not.toBeInTheDocument();
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
    renderWithQuery(<RejectedStep reason="Documents were unclear." onUpdate={onUpdate} />);
    expect(screen.getByRole("heading", { name: /verification needs an update/i })).toBeInTheDocument();
    expect(screen.getByText(/documents were unclear/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /update kyc/i }));
    expect(onUpdate).toHaveBeenCalled();
  });
});

describe("FinancialVerificationFlow resume + gates", () => {
  it("resumes to personal when nothing is saved yet", async () => {
    mockGetKyc.mockResolvedValue(null);
    renderWithQuery(<FinancialVerificationFlow />);
    expect(await screen.findByRole("heading", { name: /verify your identity/i })).toBeInTheDocument();
  });

  it("resumes to review when everything is complete but not yet submitted", async () => {
    mockGetKyc.mockResolvedValue(draftKyc());
    renderWithQuery(<FinancialVerificationFlow />);
    expect(await screen.findByRole("heading", { name: /review your details/i })).toBeInTheDocument();
  });

  it("resumes to the submitted screen while under review or verified", async () => {
    mockGetKyc.mockResolvedValue(draftKyc({ status: "UNDER_REVIEW" }));
    renderWithQuery(<FinancialVerificationFlow />);
    expect(await screen.findByRole("heading", { name: /verification submitted/i })).toBeInTheDocument();
  });

  it("shows the rejected resume state with the rejection reason", async () => {
    mockGetKyc.mockResolvedValue(draftKyc({ status: "REJECTED", rejectionReason: "Name mismatch." }));
    renderWithQuery(<FinancialVerificationFlow />);
    expect(await screen.findByRole("heading", { name: /verification needs an update/i })).toBeInTheDocument();
    expect(screen.getByText(/name mismatch/i)).toBeInTheDocument();
  });

  it("submits for verification from review", async () => {
    const user = userEvent.setup();
    mockGetKyc.mockResolvedValue(draftKyc());
    mockSubmit.mockResolvedValue(draftKyc({ status: "UNDER_REVIEW" }));

    renderWithQuery(<FinancialVerificationFlow />);
    await screen.findByRole("heading", { name: /review your details/i });
    await user.click(screen.getByRole("button", { name: /submit for verification/i }));

    expect(await screen.findByRole("heading", { name: /verification submitted/i })).toBeInTheDocument();
    expect(mockSubmit).toHaveBeenCalled();
  });

  it("saves personal identity details through the KYC API", async () => {
    const user = userEvent.setup();
    mockGetKyc.mockResolvedValue(null);
    mockSaveKyc.mockResolvedValue(
      draftKyc({ pan: null, governmentIdType: null, governmentIdNumber: null, documents: [] })
    );

    renderWithQuery(<FinancialVerificationFlow />);
    await screen.findByRole("heading", { name: /verify your identity/i });

    await user.type(screen.getByLabelText(/legal full name/i), "Priya Sharma");
    await user.type(screen.getByLabelText(/date of birth/i), "1995-04-12");
    await user.type(screen.getByLabelText(/mobile number/i), "+919876543210");
    await user.type(document.getElementById("addressLine1") as HTMLElement, "12 Forge Lane");
    await user.type(screen.getByLabelText(/city/i), "Bengaluru");
    await user.type(screen.getByLabelText(/state/i), "Karnataka");
    await user.type(screen.getByLabelText(/pin code/i), "560001");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(mockSaveKyc).toHaveBeenCalled();
    expect(mockSaveKyc.mock.calls[0]?.[0]).toMatchObject({
      legalName: "Priya Sharma",
      postalCode: "560001",
    });
  });

  it("does not store sensitive KYC data in browser storage", async () => {
    mockGetKyc.mockResolvedValue(draftKyc());
    renderWithQuery(<FinancialVerificationFlow />);
    await screen.findByRole("heading", { name: /review your details/i });

    const storageDump = `${JSON.stringify(window.localStorage)} ${JSON.stringify(window.sessionStorage)}`;
    expect(storageDump).not.toContain("ABCDE1234F");
    expect(storageDump).not.toContain("123456789012");
  });

  it("surfaces API load errors with retry", async () => {
    mockGetKyc.mockRejectedValue(new Error("boom"));
    renderWithQuery(<FinancialVerificationFlow />);
    expect(await screen.findByText(/something went wrong while loading/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("mobile layout smoke", () => {
  it("renders personal step without horizontal overflow classes on narrow widths", () => {
    const { container } = renderWithQuery(
      <PersonalStep profile={null} pending={false} error={null} onBack={() => undefined} onSave={() => undefined} />
    );
    const main = container.querySelector("main");
    expect(main?.className).toMatch(/max-w-\[34rem\]/);
    expect(main?.className).toMatch(/px-5/);
    const heading = within(container).getByRole("heading");
    expect(heading.className).toMatch(/clamp/);
  });
});
