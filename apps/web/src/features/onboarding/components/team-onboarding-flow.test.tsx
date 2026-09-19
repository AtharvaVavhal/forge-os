import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderWithQuery } from "@/test/test-utils";
import { OnboardingFlow } from "./onboarding-flow";
import { WelcomeStep } from "./steps/welcome-step";
import { ProfileStep } from "./steps/profile-step";
import { WorkStep } from "./steps/work-step";
import { OnboardingReviewStep } from "./steps/onboarding-review-step";
import { TEAM_ONBOARDING_PROGRESS_STEPS } from "../lib/resume";
import type { KycProfile, PayoutProfile, WorkProfile } from "../api/types";

// Flow-level tests exercise orchestration (resume, gating, mutation wiring),
// not the exit/enter choreography — that's covered by
// `motion/step-transition.test.tsx`, which drives real `animationend`
// events. jsdom never fires those natively, so without this mock every
// step change here would get stuck mid-exit.
vi.mock("./motion/step-transition", () => ({
  StepTransition: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/features/auth/api/auth-api", () => ({
  completeOnboarding: vi.fn(),
  previewInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
}));

vi.mock("../api/kyc-api", () => ({
  getOwnKycProfile: vi.fn(),
  getOwnPayoutProfile: vi.fn(),
  getOwnWorkProfile: vi.fn(),
  saveKycProfile: vi.fn(),
  upsertPayoutProfile: vi.fn(),
  upsertWorkProfile: vi.fn(),
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
  getOwnWorkProfile,
  saveKycProfile,
  upsertPayoutProfile,
  upsertWorkProfile,
} from "../api/kyc-api";
import { searchBanks, lookupIfsc } from "@/features/shared/api/bank-directory-api";

const mockComplete = vi.mocked(completeOnboarding);
const mockGetKyc = vi.mocked(getOwnKycProfile);
const mockGetPayout = vi.mocked(getOwnPayoutProfile);
const mockGetWork = vi.mocked(getOwnWorkProfile);
const mockSaveKyc = vi.mocked(saveKycProfile);
const mockUpsertPayout = vi.mocked(upsertPayoutProfile);
const mockUpsertWork = vi.mocked(upsertWorkProfile);
const mockSearchBanks = vi.mocked(searchBanks);
const mockLookupIfsc = vi.mocked(lookupIfsc);

function kycWithMobile(overrides: Partial<KycProfile> = {}): KycProfile {
  return {
    id: "kyc-1",
    status: "DRAFT",
    legalName: null,
    dateOfBirth: null,
    mobile: "+919876543210",
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    pan: null,
    governmentIdType: null,
    governmentIdNumber: null,
    submittedAt: null,
    verifiedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    documents: [],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function emptyPayout(overrides: Partial<PayoutProfile> = {}): PayoutProfile {
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

function emptyWork(overrides: Partial<WorkProfile> = {}): WorkProfile {
  return { jobTitle: null, primaryArea: null, skills: [], bio: null, updatedAt: null, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchBanks.mockResolvedValue([]);
  mockLookupIfsc.mockResolvedValue(null);
  mockGetKyc.mockResolvedValue(null);
  mockGetPayout.mockResolvedValue(emptyPayout());
  mockGetWork.mockResolvedValue(emptyWork());
});

describe("OnboardingFlow role branching", () => {
  it("TEAM_MEMBER enters the new (no-KYC) onboarding flow after Mirror", async () => {
    const user = userEvent.setup();
    renderWithQuery(<OnboardingFlow name="Priya Sharma" email="priya@forgebuilds.in" role="TEAM_MEMBER" />);

    expect(screen.getByRole("heading", { name: /Priya Sharma\./i })).toBeInTheDocument();
    await user.click(screen.getByRole("main"));

    expect(await screen.findByRole("heading", { name: /welcome to forge, priya/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /verify your identity/i })).not.toBeInTheDocument();
  });

  it("FOUNDER_ADMIN keeps Mirror → Success (unaffected by the K5 redesign)", async () => {
    const user = userEvent.setup();
    mockComplete.mockResolvedValue(undefined as never);
    renderWithQuery(<OnboardingFlow name="Atharva" email="atharva@forgebuilds.in" role="FOUNDER_ADMIN" />);

    await user.click(screen.getByRole("main"));
    expect(await screen.findByRole("heading", { name: /you.re all set/i })).toBeInTheDocument();
  });
});

describe("WelcomeStep", () => {
  it("greets by first name and advances on continue", async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <WelcomeStep firstName="Priya" onContinue={onContinue} steps={TEAM_ONBOARDING_PROGRESS_STEPS} currentIndex={0} />
    );

    expect(screen.getByRole("heading", { name: /welcome to forge, priya/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalled();
  });
});

describe("ProfileStep", () => {
  it("shows Google-provided name/email read-only and requires a mobile number", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <ProfileStep
        name="Priya Sharma"
        email="priya@forgebuilds.in"
        mobile={null}
        pending={false}
        error={null}
        onBack={() => undefined}
        onSave={onSave}
        steps={TEAM_ONBOARDING_PROGRESS_STEPS}
        currentIndex={1}
      />
    );

    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("priya@forgebuilds.in")).toBeInTheDocument();
    expect(screen.queryByLabelText(/legal full name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/date of birth/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/enter a valid mobile number/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/mobile number/i), "+919876543210");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSave).toHaveBeenCalledWith({ mobile: "+919876543210" });
  });
});

describe("WorkStep", () => {
  it("is entirely optional — continuing with nothing filled in still saves", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <WorkStep
        profile={emptyWork()}
        pending={false}
        error={null}
        onBack={() => undefined}
        onSave={onSave}
        steps={TEAM_ONBOARDING_PROGRESS_STEPS}
        currentIndex={2}
      />
    );

    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSave).toHaveBeenCalledWith({ jobTitle: undefined, primaryArea: undefined, skills: [], bio: undefined });
  });

  it("adds and removes skill chips, capped at 20", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <WorkStep
        profile={emptyWork()}
        pending={false}
        error={null}
        onBack={() => undefined}
        onSave={onSave}
        steps={TEAM_ONBOARDING_PROGRESS_STEPS}
        currentIndex={2}
      />
    );

    const skillInput = screen.getByLabelText(/skills/i);
    await user.type(skillInput, "React{Enter}");
    await user.type(skillInput, "TypeScript{Enter}");
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove react/i }));
    expect(screen.queryByText("React")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ skills: ["TypeScript"] })
    );
  });
});

describe("OnboardingReviewStep", () => {
  it("masks payout values and routes edits back to the right step", async () => {
    const onEditProfile = vi.fn();
    const onEditWork = vi.fn();
    const onEditPayout = vi.fn();
    const onComplete = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <OnboardingReviewStep
        name="Priya Sharma"
        email="priya@forgebuilds.in"
        mobile="+919876543210"
        work={emptyWork({ jobTitle: "Engineer", skills: ["React"] })}
        payout={dualPayout()}
        pending={false}
        error={null}
        onBack={() => undefined}
        onEditProfile={onEditProfile}
        onEditWork={onEditWork}
        onEditPayout={onEditPayout}
        onComplete={onComplete}
        steps={TEAM_ONBOARDING_PROGRESS_STEPS}
        currentIndex={4}
      />
    );

    expect(screen.getByText("••••••9012")).toBeInTheDocument();
    expect(screen.queryByText("123456789012")).not.toBeInTheDocument();
    expect(screen.queryByText(/pan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/government id/i)).not.toBeInTheDocument();

    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    await user.click(editButtons[2]!);
    expect(onEditPayout).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /complete setup/i }));
    expect(onComplete).toHaveBeenCalled();
  });
});

describe("TeamOnboardingFlow resume + gates", () => {
  it("resumes straight to Welcome when nothing has been saved yet", async () => {
    const user = userEvent.setup();
    renderWithQuery(<OnboardingFlow name="Priya" email="priya@forgebuilds.in" role="TEAM_MEMBER" />);
    await user.click(screen.getByRole("main"));

    expect(await screen.findByRole("heading", { name: /welcome to forge/i })).toBeInTheDocument();
  });

  it.each(["NOT_STARTED", "DRAFT", "SUBMITTED", "UNDER_REVIEW", "VERIFIED", "REJECTED"] as const)(
    "resumes to Review once profile + payout are done regardless of KYC status (%s)",
    async (status) => {
      const user = userEvent.setup();
      mockGetKyc.mockResolvedValue(kycWithMobile({ status, rejectionReason: "Documents unclear." }));
      mockGetPayout.mockResolvedValue(dualPayout());

      renderWithQuery(<OnboardingFlow name="Priya" email="priya@forgebuilds.in" role="TEAM_MEMBER" />);
      await user.click(screen.getByRole("main"));

      expect(await screen.findByRole("heading", { name: /review your details/i })).toBeInTheDocument();
      expect(screen.queryByText(/documents unclear/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /needs an update/i })).not.toBeInTheDocument();
    }
  );

  it("walks the full sequence: welcome → profile → work → payout → review → success → Enter Forge", async () => {
    const user = userEvent.setup();
    mockSaveKyc.mockResolvedValue(kycWithMobile());
    mockUpsertWork.mockResolvedValue(emptyWork({ jobTitle: "Engineer" }));
    mockUpsertPayout.mockResolvedValue(dualPayout());
    mockComplete.mockResolvedValue(undefined as never);

    renderWithQuery(<OnboardingFlow name="Priya Sharma" email="priya@forgebuilds.in" role="TEAM_MEMBER" />);
    await user.click(screen.getByRole("main"));

    await screen.findByRole("heading", { name: /welcome to forge/i });
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByRole("heading", { name: /your profile/i });
    await user.type(screen.getByLabelText(/mobile number/i), "+919876543210");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(mockSaveKyc).toHaveBeenCalledWith({ mobile: "+919876543210" }));

    await screen.findByRole("heading", { name: /what you do/i });
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(mockUpsertWork).toHaveBeenCalled());

    await screen.findByRole("heading", { name: /set up your payout details/i });
    // Set before the QR upload: uploading auto-saves + invalidates the payout
    // query mid-step, so the refetch must already reflect the completed profile.
    mockGetPayout.mockResolvedValue(dualPayout());
    await user.type(screen.getByLabelText(/account holder name/i), "Priya Sharma");
    await user.type(screen.getByLabelText(/bank name/i), "HDFC Bank");
    await user.type(screen.getByLabelText(/account number/i), "123456789012");
    await user.type(screen.getByLabelText(/ifsc/i), "HDFC0001234");
    await user.type(screen.getByLabelText(/upi id/i), "priya@okhdfcbank");
    const qrInput = screen.getByLabelText(/upload personal upi qr/i);
    await user.upload(qrInput, new File(["x"], "qr.png", { type: "image/png" }));
    await screen.findByText(/✓ Personal UPI QR code/i);
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(mockUpsertPayout).toHaveBeenCalled());

    await screen.findByRole("heading", { name: /review your details/i });
    // Clicking "Complete setup" only advances to Success — it must not call
    // completeOnboarding itself (that only happens from "Enter Forge →").
    await user.click(screen.getByRole("button", { name: /complete setup/i }));
    expect(mockComplete).not.toHaveBeenCalled();

    expect(await screen.findByRole("heading", { name: /you.re all set/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /enter forge/i }));
    await waitFor(() => expect(mockComplete).toHaveBeenCalled());
  });

  it("Back from Profile returns to the Mirror screen", async () => {
    const user = userEvent.setup();
    renderWithQuery(<OnboardingFlow name="Priya" email="priya@forgebuilds.in" role="TEAM_MEMBER" />);
    await user.click(screen.getByRole("main"));

    await screen.findByRole("heading", { name: /welcome to forge/i });
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /your profile/i });

    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(await screen.findByRole("heading", { name: /Priya\./i })).toBeInTheDocument();
  });

  it("surfaces API load errors with retry", async () => {
    const user = userEvent.setup();
    mockGetKyc.mockRejectedValue(new Error("boom"));

    renderWithQuery(<OnboardingFlow name="Priya" email="priya@forgebuilds.in" role="TEAM_MEMBER" />);
    await user.click(screen.getByRole("main"));

    expect(await screen.findByText(/something went wrong while loading/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("does not leak payout account/IFSC values into browser storage", async () => {
    const user = userEvent.setup();
    mockGetKyc.mockResolvedValue(kycWithMobile());
    mockGetPayout.mockResolvedValue(dualPayout());

    renderWithQuery(<OnboardingFlow name="Priya" email="priya@forgebuilds.in" role="TEAM_MEMBER" />);
    await user.click(screen.getByRole("main"));
    await screen.findByRole("heading", { name: /review your details/i });

    const storageDump = `${JSON.stringify(window.localStorage)} ${JSON.stringify(window.sessionStorage)}`;
    expect(storageDump).not.toContain("123456789012");
    expect(storageDump).not.toContain("HDFC0001234");
  });
});
