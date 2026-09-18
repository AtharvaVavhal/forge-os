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
import { createTestApp } from "./support/bootstrap";
import { cleanupTestFixtures, createTestUser } from "./support/fixtures";
import { authHeaders, loginSession, type AuthSession } from "./support/crm";
import { PrismaService } from "../src/database/prisma.service";
import { AUDIT_ACTIONS } from "../src/modules/shared/audit.service";

const K8_PREFIX = "phase-k8-e2e-";

async function cleanupK8(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const users = await prisma.user.findMany({
    where: { email: { startsWith: K8_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    const profiles = await prisma.kycProfile.findMany({
      where: { user_id: { in: userIds } },
      select: { id: true },
    });
    const profileIds = profiles.map((p) => p.id);
    if (profileIds.length > 0) {
      await prisma.kycDocument.deleteMany({ where: { kyc_profile_id: { in: profileIds } } });
      await prisma.kycProfile.deleteMany({ where: { id: { in: profileIds } } });
    }
    await prisma.payoutProfile.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function createMember(
  app: INestApplication,
  organizationId: string,
  opts?: { withKyc?: boolean; status?: KycStatus; withPayout?: boolean; withDocs?: boolean }
) {
  const prisma = app.get(PrismaService);
  const fixture = await createTestUser(app, {
    role: UserRole.TEAM_MEMBER,
    organizationId,
    emailSuffix: `${K8_PREFIX}member`,
    onboarded: false,
  });
  await prisma.user.update({
    where: { id: fixture.id },
    data: { email: `${K8_PREFIX}member-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@forge.local` },
  });

  let profileId: string | null = null;
  if (opts?.withKyc !== false) {
    const status = opts?.status ?? KycStatus.DRAFT;
    const profile = await prisma.kycProfile.create({
      data: {
        organization_id: organizationId,
        user_id: fixture.id,
        status,
        legal_name: "K8 Member",
        date_of_birth: new Date("1990-01-01"),
        mobile: "+919999999999",
        address_line1: "1 Test St",
        city: "Bengaluru",
        state: "Karnataka",
        postal_code: "560001",
        pan: "ABCDE1234F",
        government_id_type: KycGovernmentIdType.AADHAAR,
        government_id_number: "9999-8888-7777",
        submitted_at: status === KycStatus.UNDER_REVIEW || status === KycStatus.VERIFIED ? new Date() : null,
      },
    });
    profileId = profile.id;

    if (opts?.withDocs !== false) {
      await prisma.kycDocument.createMany({
        data: [
          {
            organization_id: organizationId,
            kyc_profile_id: profile.id,
            document_type: KycDocumentType.PAN_CARD,
            storage_key: `${organizationId}/k8-pan-${profile.id}.pdf`,
            filename: "pan.pdf",
            mime_type: "application/pdf",
            size_bytes: 100,
            status: KycDocumentStatus.UPLOADED,
          },
          {
            organization_id: organizationId,
            kyc_profile_id: profile.id,
            document_type: KycDocumentType.GOVERNMENT_ID,
            storage_key: `${organizationId}/k8-gov-${profile.id}.pdf`,
            filename: "gov.pdf",
            mime_type: "application/pdf",
            size_bytes: 100,
            status: KycDocumentStatus.UPLOADED,
          },
        ],
      });
    }
  }

  if (opts?.withPayout) {
    await prisma.payoutProfile.create({
      data: {
        organization_id: organizationId,
        user_id: fixture.id,
        preferred_method: PayoutMethod.BANK_TRANSFER,
        account_holder_name: "K8 Member",
        bank_name: "HDFC Bank",
        account_number: "50100111111111",
        ifsc: "HDFC0001111",
        upi_id: "k8@okhdfcbank",
        upi_qr_storage_key: `${organizationId}/k8-upi-qr.png`,
        upi_qr_filename: "k8-upi-qr.png",
        upi_qr_mime_type: "image/png",
        upi_qr_size_bytes: 1024,
      },
    });
  }

  const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: fixture.id } });
  const login = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email: refreshed.email, password: fixture.password });
  const setCookie = login.headers["set-cookie"] as unknown as string[];
  const { extractCookie } = await import("./support/bootstrap");
  const session: AuthSession = {
    cookie: extractCookie(setCookie, "forge_session")!,
    csrf: extractCookie(setCookie, "forge_csrf")!,
    userId: fixture.id,
    email: refreshed.email,
    organizationId,
  };

  return { session, profileId, userId: fixture.id };
}

describe("K8 KYC/Payout security hardening (e2e)", () => {
  let app: INestApplication;
  let finance: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
    finance = await loginSession(app, "FINANCE");
  });

  afterAll(async () => {
    await cleanupK8(app);
    await cleanupTestFixtures(app);
    await app.close();
  });

  afterEach(async () => {
    await cleanupK8(app);
  });

  it("rejects unauthenticated KYC, payout, and finance review access", async () => {
    const kyc = await request(app.getHttpServer()).get("/api/v1/team/kyc");
    expect(kyc.status).toBe(401);

    const payout = await request(app.getHttpServer()).get("/api/v1/team/payout-profile");
    expect(payout.status).toBe(401);

    const review = await request(app.getHttpServer()).get("/api/v1/finance/kyc");
    expect(review.status).toBe(401);

    const docs = await request(app.getHttpServer()).post("/api/v1/team/kyc/documents/presign-upload").send({});
    expect(docs.status).toBe(401);
  });

  it("sets Cache-Control: no-store on sensitive team KYC and payout GETs", async () => {
    const { session } = await createMember(app, finance.organizationId, {
      withKyc: true,
      withPayout: true,
      withDocs: false,
    });

    const kyc = await request(app.getHttpServer()).get("/api/v1/team/kyc").set(authHeaders(session));
    expect(kyc.status).toBe(200);
    expect(kyc.headers["cache-control"]).toBe("no-store");

    const payout = await request(app.getHttpServer())
      .get("/api/v1/team/payout-profile")
      .set(authHeaders(session));
    expect(payout.status).toBe(200);
    expect(payout.headers["cache-control"]).toBe("no-store");
  });

  it("rejects client-invented and traversal storage keys", async () => {
    const { session } = await createMember(app, finance.organizationId, {
      withKyc: true,
      status: KycStatus.DRAFT,
      withDocs: false,
    });

    const foreignOrg = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/documents")
      .set(authHeaders(session))
      .send({
        documentType: "PAN_CARD",
        filename: "pan.pdf",
        storageKey: "00000000-0000-0000-0000-000000000000/evil.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      });
    expect(foreignOrg.status).toBe(400);
    expect(foreignOrg.body.error?.code ?? foreignOrg.body.code).toMatch(/INVALID_STORAGE_KEY|BAD_REQUEST/);

    const traversal = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/documents")
      .set(authHeaders(session))
      .send({
        documentType: "PAN_CARD",
        filename: "pan.pdf",
        storageKey: `${finance.organizationId}/../other/evil.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 100,
      });
    expect(traversal.status).toBe(400);
  });

  it("rejects unsupported MIME types on KYC presign", async () => {
    const { session } = await createMember(app, finance.organizationId, {
      withKyc: true,
      status: KycStatus.DRAFT,
      withDocs: false,
    });

    for (const mimeType of ["image/svg+xml", "application/zip", "application/x-msdownload", "text/html"]) {
      const res = await request(app.getHttpServer())
        .post("/api/v1/team/kyc/documents/presign-upload")
        .set(authHeaders(session))
        .send({
          documentType: "PAN_CARD",
          filename: "bad.bin",
          mimeType,
          sizeBytes: 100,
        });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("blocks onboarding complete without KYC / docs / payout", async () => {
    const { session } = await createMember(app, finance.organizationId, {
      withKyc: false,
      withPayout: false,
      withDocs: false,
    });

    const none = await request(app.getHttpServer())
      .post("/api/v1/auth/onboarding/complete")
      .set(authHeaders(session))
      .send({});
    expect(none.status).toBe(422);
    expect(JSON.stringify(none.body)).toMatch(/ONBOARDING_REQUIREMENTS_INCOMPLETE|incomplete/i);

    const draftOnly = await createMember(app, finance.organizationId, {
      withKyc: true,
      status: KycStatus.DRAFT,
      withDocs: true,
      withPayout: true,
    });
    const draftComplete = await request(app.getHttpServer())
      .post("/api/v1/auth/onboarding/complete")
      .set(authHeaders(draftOnly.session))
      .send({});
    expect(draftComplete.status).toBe(422);
  });

  it("blocks member mutation of UNDER_REVIEW KYC", async () => {
    const { session } = await createMember(app, finance.organizationId, {
      withKyc: true,
      status: KycStatus.UNDER_REVIEW,
      withDocs: true,
    });

    const patch = await request(app.getHttpServer())
      .patch("/api/v1/team/kyc")
      .set(authHeaders(session))
      .send({ legalName: "Hacker" });
    expect(patch.status).toBe(409);

    const presign = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/documents/presign-upload")
      .set(authHeaders(session))
      .send({
        documentType: "PAN_CARD",
        filename: "pan.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      });
    expect(presign.status).toBe(409);
  });

  it("TEAM_MEMBER cannot reach finance KYC review endpoints", async () => {
    const { session, profileId } = await createMember(app, finance.organizationId, {
      withKyc: true,
      status: KycStatus.UNDER_REVIEW,
    });

    const list = await request(app.getHttpServer()).get("/api/v1/finance/kyc").set(authHeaders(session));
    expect(list.status).toBe(403);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/finance/kyc/${profileId}`)
      .set(authHeaders(session));
    expect(detail.status).toBe(403);

    const review = await request(app.getHttpServer())
      .post(`/api/v1/finance/kyc/${profileId}/review`)
      .set(authHeaders(session))
      .send({ action: "APPROVE" });
    expect(review.status).toBe(403);
  });

  it("audit payloads for KYC/payout never include sensitive field values", async () => {
    const { session, profileId } = await createMember(app, finance.organizationId, {
      withKyc: true,
      status: KycStatus.DRAFT,
      withDocs: false,
      withPayout: false,
    });

    await request(app.getHttpServer())
      .patch("/api/v1/team/kyc")
      .set(authHeaders(session))
      .send({ legalName: "K8 Updated", pan: "ZZZZZ9999Z" });

    await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(session))
      .send({
        accountHolderName: "K8 Updated",
        bankName: "HDFC",
        accountNumber: "998877665544",
        ifsc: "HDFC0009999",
        upiId: "k8@okhdfcbank",
      });

    const prisma = app.get(PrismaService);
    const audits = await prisma.auditLog.findMany({
      where: {
        organization_id: finance.organizationId,
        OR: [
          { entity_id: profileId ?? undefined, action: { startsWith: "kyc." } },
          { action: { in: [AUDIT_ACTIONS.PAYOUT_PROFILE_CREATED, AUDIT_ACTIONS.PAYOUT_PROFILE_UPDATED] } },
        ],
      },
      take: 20,
    });

    const dump = JSON.stringify(audits);
    expect(dump).not.toContain("ZZZZZ9999Z");
    expect(dump).not.toContain("998877665544");
    expect(dump).not.toContain("HDFC0009999");
    expect(dump).not.toContain("9999-8888-7777");
    expect(dump).not.toMatch(/https?:\/\/.*r2/i);
  });
});
