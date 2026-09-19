import type { INestApplication } from "@nestjs/common";
import {
  KycDocumentStatus,
  KycDocumentType,
  KycGovernmentIdType,
  KycStatus,
  PayoutMethod,
  UserRole,
} from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./support/bootstrap";
import { createTestUser } from "./support/fixtures";
import { PrismaService } from "../src/database/prisma.service";
import { PasswordService } from "../src/modules/auth/services/password.service";
import { OrganizationContextService } from "../src/modules/shared/organization-context.service";

const K5_PREFIX = "phase-k5-e2e-";

interface Session {
  cookie: string;
  csrf: string;
  userId: string;
  organizationId: string;
}

async function cleanupK5(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const users = await prisma.user.findMany({
    where: { email: { startsWith: K5_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return;

  const profiles = await prisma.kycProfile.findMany({
    where: { user_id: { in: userIds } },
    select: { id: true },
  });
  const profileIds = profiles.map((p) => p.id);
  if (profileIds.length > 0) {
    await prisma.kycDocument.deleteMany({
      where: { kyc_profile_id: { in: profileIds } },
    });
    await prisma.kycProfile.deleteMany({ where: { id: { in: profileIds } } });
  }
  await prisma.payoutProfile.deleteMany({ where: { user_id: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function loginUnonboardedTeamMember(
  app: INestApplication,
  emailSuffix = "member"
): Promise<Session> {
  const prisma = app.get(PrismaService);
  const passwordService = app.get(PasswordService);
  const organizationId = await app
    .get(OrganizationContextService)
    .resolveSingleOrganizationId();
  const email = `${K5_PREFIX}${emailSuffix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@forge.local`;
  const password = "Correct-Horse-Battery-Staple-1";
  const user = await prisma.user.create({
    data: {
      organization_id: organizationId,
      email,
      name: "K5 Team Member",
      role: UserRole.TEAM_MEMBER,
      password_hash: await passwordService.hash(password),
      active: true,
      onboarded_at: null,
    },
  });

  const login = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email, password });
  expect(login.status).toBe(200);
  const setCookie = login.headers["set-cookie"] as unknown as string[];
  return {
    cookie: extractCookie(setCookie, "forge_session")!,
    csrf: extractCookie(setCookie, "forge_csrf")!,
    userId: user.id,
    organizationId,
  };
}

function authHeaders(session: Session): Record<string, string> {
  return {
    Cookie: `forge_session=${session.cookie}; forge_csrf=${session.csrf}`,
    "X-CSRF-Token": session.csrf,
  };
}

async function seedKyc(
  app: INestApplication,
  session: Session,
  opts: {
    status: KycStatus;
    panDoc?: boolean;
    govDoc?: boolean;
    panDocStatus?: KycDocumentStatus;
    govDocStatus?: KycDocumentStatus;
  }
) {
  const prisma = app.get(PrismaService);
  const profile = await prisma.kycProfile.create({
    data: {
      organization_id: session.organizationId,
      user_id: session.userId,
      status: opts.status,
      legal_name: "Ada Lovelace",
      date_of_birth: new Date("1990-05-15T00:00:00.000Z"),
      mobile: "+919876543210",
      address_line1: "42 Lane",
      city: "Bengaluru",
      state: "Karnataka",
      postal_code: "560001",
      pan: "ABCDE1234F",
      government_id_type: KycGovernmentIdType.AADHAAR,
      government_id_number: "1234-5678-9012",
      submitted_at:
        opts.status === KycStatus.DRAFT || opts.status === KycStatus.NOT_STARTED
          ? null
          : new Date(),
      verified_at: opts.status === KycStatus.VERIFIED ? new Date() : null,
      rejected_at: opts.status === KycStatus.REJECTED ? new Date() : null,
      rejection_reason:
        opts.status === KycStatus.REJECTED ? "unclear" : null,
    },
  });

  if (opts.panDoc !== false) {
    await prisma.kycDocument.create({
      data: {
        organization_id: session.organizationId,
        kyc_profile_id: profile.id,
        document_type: KycDocumentType.PAN_CARD,
        storage_key: `${session.organizationId}/k5-pan-${profile.id}`,
        filename: "pan.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
        status: opts.panDocStatus ?? KycDocumentStatus.UPLOADED,
      },
    });
  }
  if (opts.govDoc !== false) {
    await prisma.kycDocument.create({
      data: {
        organization_id: session.organizationId,
        kyc_profile_id: profile.id,
        document_type: KycDocumentType.GOVERNMENT_ID,
        storage_key: `${session.organizationId}/k5-gov-${profile.id}`,
        filename: "gov.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
        status: opts.govDocStatus ?? KycDocumentStatus.UPLOADED,
      },
    });
  }
  return profile;
}

async function seedPayout(
  app: INestApplication,
  session: Session,
  kind:
    | "complete"
    | "bank_incomplete"
    | "upi_id_missing"
    | "upi_qr_missing"
    | "ifsc_missing"
) {
  const prisma = app.get(PrismaService);
  const base = {
    organization_id: session.organizationId,
    user_id: session.userId,
    preferred_method: PayoutMethod.BANK_TRANSFER,
    account_holder_name: "Ada Lovelace",
    bank_name: "HDFC Bank",
    account_number: "50100123456789",
    ifsc: "HDFC0001234",
    upi_id: "ada@okhdfcbank",
    upi_qr_storage_key: `${session.organizationId}/upi-qr-${session.userId}.png`,
    upi_qr_filename: "upi-qr.png",
    upi_qr_mime_type: "image/png",
    upi_qr_size_bytes: 2048,
  };

  if (kind === "complete") {
    return prisma.payoutProfile.create({ data: base });
  }
  if (kind === "bank_incomplete") {
    return prisma.payoutProfile.create({
      data: {
        ...base,
        account_number: null,
        ifsc: null,
      },
    });
  }
  if (kind === "upi_id_missing") {
    return prisma.payoutProfile.create({
      data: {
        ...base,
        upi_id: null,
      },
    });
  }
  if (kind === "ifsc_missing") {
    return prisma.payoutProfile.create({
      data: {
        ...base,
        ifsc: null,
      },
    });
  }
  return prisma.payoutProfile.create({
    data: {
      ...base,
      upi_qr_storage_key: null,
      upi_qr_filename: null,
      upi_qr_mime_type: null,
      upi_qr_size_bytes: null,
    },
  });
}

async function attemptComplete(app: INestApplication, session: Session) {
  return request(app.getHttpServer())
    .post("/api/v1/auth/onboarding/complete")
    .set(authHeaders(session));
}

function expectIncomplete(
  body: { error?: { code?: string; details?: { requirements?: Array<{ code: string; missing: string[] }> } } },
  requirementCode: string,
  missingToken: string
) {
  expect(body.error?.code).toBe("ONBOARDING_REQUIREMENTS_INCOMPLETE");
  const reqs = body.error?.details?.requirements ?? [];
  const match = reqs.find((r) => r.code === requirementCode);
  expect(match).toBeTruthy();
  expect(match!.missing).toEqual(expect.arrayContaining([missingToken]));
}

describe("K5: TEAM_MEMBER onboarding KYC/payout gate (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanupK5(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanupK5(app);
  });

  it("FOUNDER_ADMIN existing onboarding still works", async () => {
    const fixture = await createTestUser(app, {
      role: "FOUNDER_ADMIN",
      onboarded: false,
    });
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: fixture.email, password: fixture.password });
    expect(login.status).toBe(200);
    const setCookie = login.headers["set-cookie"] as unknown as string[];
    const session = extractCookie(setCookie, "forge_session")!;
    const csrf = extractCookie(setCookie, "forge_csrf")!;

    const complete = await request(app.getHttpServer())
      .post("/api/v1/auth/onboarding/complete")
      .set("Cookie", `forge_session=${session}; forge_csrf=${csrf}`)
      .set("X-CSRF-Token", csrf);
    expect(complete.status).toBe(200);
    expect(complete.body.onboardedAt).toBeTruthy();
  });

  it("Non-team role (OPERATIONS) onboarding still works without KYC", async () => {
    const fixture = await createTestUser(app, {
      role: "OPERATIONS",
      onboarded: false,
    });
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: fixture.email, password: fixture.password });
    const setCookie = login.headers["set-cookie"] as unknown as string[];
    const complete = await request(app.getHttpServer())
      .post("/api/v1/auth/onboarding/complete")
      .set(
        "Cookie",
        `forge_session=${extractCookie(setCookie, "forge_session")}; forge_csrf=${extractCookie(setCookie, "forge_csrf")}`
      )
      .set("X-CSRF-Token", extractCookie(setCookie, "forge_csrf")!);
    expect(complete.status).toBe(200);
  });

  // K5 onboarding redesign: financial KYC (PAN, government ID, documents,
  // Finance review) is deliberately NOT part of first-run onboarding
  // anymore — it's gated at first withdrawal instead (see
  // earnings-payouts.e2e-spec.ts's "KYC required for withdrawal" suite).
  // Every one of these proves KYC status/documents/absence never blocks
  // `POST /auth/onboarding/complete`, as long as payout is complete.

  it("TEAM_MEMBER with no KYC profile at all can complete onboarding", async () => {
    const session = await loginUnonboardedTeamMember(app, "nokyc");
    await seedPayout(app, session, "complete");
    const res = await attemptComplete(app, session);
    expect(res.status).toBe(200);
    expect(res.body.onboardedAt).toBeTruthy();
  });

  it.each([
    [KycStatus.NOT_STARTED, "notstarted"],
    [KycStatus.DRAFT, "draft"],
    [KycStatus.SUBMITTED, "submitted"],
    [KycStatus.UNDER_REVIEW, "under-review"],
    [KycStatus.VERIFIED, "verified"],
    [KycStatus.REJECTED, "rejected"],
  ] as const)(
    "TEAM_MEMBER with KYC status %s can complete onboarding (KYC status never blocks)",
    async (status, suffix) => {
      const session = await loginUnonboardedTeamMember(app, suffix);
      await seedKyc(app, session, { status });
      await seedPayout(app, session, "complete");
      const res = await attemptComplete(app, session);
      expect(res.status).toBe(200);
      expect(res.body.onboardedAt).toBeTruthy();
    }
  );

  it("Missing PAN_CARD/GOVERNMENT_ID documents never block completion", async () => {
    const session = await loginUnonboardedTeamMember(app, "nodocs");
    await seedKyc(app, session, {
      status: KycStatus.UNDER_REVIEW,
      panDoc: false,
      govDoc: false,
    });
    await seedPayout(app, session, "complete");
    const res = await attemptComplete(app, session);
    expect(res.status).toBe(200);
  });

  it("REMOVED KYC documents never block completion", async () => {
    const session = await loginUnonboardedTeamMember(app, "rmdocs");
    await seedKyc(app, session, {
      status: KycStatus.UNDER_REVIEW,
      panDocStatus: KycDocumentStatus.REMOVED,
      govDocStatus: KycDocumentStatus.REMOVED,
    });
    await seedPayout(app, session, "complete");
    const res = await attemptComplete(app, session);
    expect(res.status).toBe(200);
  });

  it("Missing payout profile blocks completion", async () => {
    const session = await loginUnonboardedTeamMember(app, "nopayout");
    await seedKyc(app, session, { status: KycStatus.UNDER_REVIEW });
    const res = await attemptComplete(app, session);
    expect(res.status).toBe(422);
    expectIncomplete(res.body, "PAYOUT_PROFILE_INCOMPLETE", "payout_profile");
  });

  it("Incomplete bank fields block completion", async () => {
    const session = await loginUnonboardedTeamMember(app, "bankinc");
    await seedKyc(app, session, { status: KycStatus.UNDER_REVIEW });
    await seedPayout(app, session, "bank_incomplete");
    const res = await attemptComplete(app, session);
    expect(res.status).toBe(422);
    expectIncomplete(res.body, "PAYOUT_PROFILE_INCOMPLETE", "accountNumber");
  });

  it("Missing IFSC blocks completion", async () => {
    const session = await loginUnonboardedTeamMember(app, "ifscmiss");
    await seedKyc(app, session, { status: KycStatus.UNDER_REVIEW });
    await seedPayout(app, session, "ifsc_missing");
    const res = await attemptComplete(app, session);
    expect(res.status).toBe(422);
    expectIncomplete(res.body, "PAYOUT_PROFILE_INCOMPLETE", "ifsc");
  });

  it("Missing UPI ID blocks completion", async () => {
    const session = await loginUnonboardedTeamMember(app, "upiinc");
    await seedKyc(app, session, { status: KycStatus.UNDER_REVIEW });
    await seedPayout(app, session, "upi_id_missing");
    const res = await attemptComplete(app, session);
    expect(res.status).toBe(422);
    expectIncomplete(res.body, "PAYOUT_PROFILE_INCOMPLETE", "upiId");
  });

  it("Missing UPI QR blocks completion", async () => {
    const session = await loginUnonboardedTeamMember(app, "qrmiss");
    await seedKyc(app, session, { status: KycStatus.UNDER_REVIEW });
    await seedPayout(app, session, "upi_qr_missing");
    const res = await attemptComplete(app, session);
    expect(res.status).toBe(422);
    expectIncomplete(res.body, "PAYOUT_PROFILE_INCOMPLETE", "upiQr");
  });

  it("Complete dual payout (bank + UPI + QR) allows completion", async () => {
    const session = await loginUnonboardedTeamMember(app, "payoutok");
    await seedKyc(app, session, { status: KycStatus.UNDER_REVIEW });
    await seedPayout(app, session, "complete");
    const res = await attemptComplete(app, session);
    expect(res.status).toBe(200);
    expect(res.body.onboardedAt).toBeTruthy();
  });

  it("Direct API call cannot bypass requirements", async () => {
    const session = await loginUnonboardedTeamMember(app, "bypass");
    const res = await attemptComplete(app, session);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("ONBOARDING_REQUIREMENTS_INCOMPLETE");
    const prisma = app.get(PrismaService);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
    });
    expect(user.onboarded_at).toBeNull();
  });

  it("Successful completion sets onboarded_at; repeated completion is idempotent", async () => {
    const session = await loginUnonboardedTeamMember(app, "idem");
    await seedKyc(app, session, { status: KycStatus.VERIFIED });
    await seedPayout(app, session, "complete");

    const first = await attemptComplete(app, session);
    expect(first.status).toBe(200);
    const newCookies = first.headers["set-cookie"] as unknown as string[];
    const newSession: Session = {
      cookie: extractCookie(newCookies, "forge_session")!,
      csrf: extractCookie(newCookies, "forge_csrf")!,
      userId: session.userId,
      organizationId: session.organizationId,
    };

    const again = await attemptComplete(app, newSession);
    expect(again.status).toBe(200);
    expect(again.body.onboardedAt).toBe(first.body.onboardedAt);
    // Idempotent path must not invalidate session
    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", `forge_session=${newSession.cookie}`);
    expect(me.status).toBe(200);
  });

  it("CSRF protection remains intact", async () => {
    const session = await loginUnonboardedTeamMember(app, "csrf");
    await seedKyc(app, session, { status: KycStatus.UNDER_REVIEW });
    await seedPayout(app, session, "complete");
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/onboarding/complete")
      .set(
        "Cookie",
        `forge_session=${session.cookie}; forge_csrf=${session.csrf}`
      );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_TOKEN_INVALID");
  });

  it("No sensitive data leaks in errors (a payout-incomplete 422 with KYC data seeded alongside it)", async () => {
    const session = await loginUnonboardedTeamMember(app, "leak");
    // KYC status is irrelevant to onboarding now — seed it anyway (with
    // real PAN/government ID/bank-shaped values) purely to prove none of
    // it leaks into the *payout*-incompleteness error below.
    await seedKyc(app, session, { status: KycStatus.DRAFT });
    await seedPayout(app, session, "bank_incomplete");
    const res = await attemptComplete(app, session);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("ONBOARDING_REQUIREMENTS_INCOMPLETE");
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("ABCDE1234F");
    expect(serialized).not.toContain("1234-5678-9012");
    expect(serialized).not.toContain("50100123456789");
    expect(serialized).not.toContain("HDFC0001234");
    expect(serialized).not.toContain("k5-pan-");
  });
});
