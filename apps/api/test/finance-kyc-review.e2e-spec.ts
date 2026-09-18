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
import { createSecondOrganization, createTestUser, cleanupTestFixtures } from "./support/fixtures";
import { authHeaders, loginSession, type AuthSession } from "./support/crm";
import { PrismaService } from "../src/database/prisma.service";
import { AUDIT_ACTIONS } from "../src/modules/shared/audit.service";

const K7_PREFIX = "phase-k7-e2e-";

async function cleanupK7(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const users = await prisma.user.findMany({
    where: { email: { startsWith: K7_PREFIX } },
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
  await prisma.organization
    .deleteMany({
      where: {
        name: { startsWith: "Phase 1 E2E Second Org" },
        users: { none: {} },
        kyc_profiles: { none: {} },
      },
    })
    .catch(() => {});
}

async function createMemberWithKyc(
  app: INestApplication,
  organizationId: string,
  status: KycStatus,
  opts?: { emailSuffix?: string; withDocs?: boolean; withPayout?: boolean }
) {
  const prisma = app.get(PrismaService);
  const member = await createTestUser(app, {
    role: UserRole.TEAM_MEMBER,
    organizationId,
    emailSuffix: `${K7_PREFIX}${opts?.emailSuffix ?? "member"}`,
  });

  // Fix email prefix for cleanup (createTestUser uses phase1-e2e-)
  await prisma.user.update({
    where: { id: member.id },
    data: {
      email: `${K7_PREFIX}${opts?.emailSuffix ?? "member"}-${Date.now()}@forge.local`,
      name: "K7 Review Member",
    },
  });

  const profile = await prisma.kycProfile.create({
    data: {
      organization_id: organizationId,
      user_id: member.id,
      status,
      legal_name: "K7 Review Member",
      date_of_birth: new Date("1992-03-15"),
      mobile: "+919876543210",
      address_line1: "1 Review Street",
      city: "Bengaluru",
      state: "Karnataka",
      postal_code: "560001",
      pan: "ABCDE1234F",
      government_id_type: KycGovernmentIdType.AADHAAR,
      government_id_number: "1234-5678-9012",
      submitted_at: status === KycStatus.DRAFT ? null : new Date(),
      verified_at: status === KycStatus.VERIFIED ? new Date() : null,
      rejected_at: status === KycStatus.REJECTED ? new Date() : null,
      rejection_reason: status === KycStatus.REJECTED ? "Prior rejection" : null,
    },
  });

  if (opts?.withDocs !== false) {
    await prisma.kycDocument.createMany({
      data: [
        {
          organization_id: organizationId,
          kyc_profile_id: profile.id,
          document_type: KycDocumentType.PAN_CARD,
          storage_key: `${organizationId}/kyc/${profile.id}/pan.pdf`,
          filename: "pan.pdf",
          mime_type: "application/pdf",
          size_bytes: 1024,
          status: KycDocumentStatus.UPLOADED,
        },
        {
          organization_id: organizationId,
          kyc_profile_id: profile.id,
          document_type: KycDocumentType.GOVERNMENT_ID,
          storage_key: `${organizationId}/kyc/${profile.id}/gov.pdf`,
          filename: "gov.pdf",
          mime_type: "application/pdf",
          size_bytes: 2048,
          status: KycDocumentStatus.UPLOADED,
        },
      ],
    });
  }

  if (opts?.withPayout !== false) {
    await prisma.payoutProfile.create({
      data: {
        organization_id: organizationId,
        user_id: member.id,
        preferred_method: PayoutMethod.BANK_TRANSFER,
        account_holder_name: "K7 Review Member",
        bank_name: "HDFC Bank",
        account_number: "123456789012",
        ifsc: "HDFC0001234",
        upi_id: "k7@okhdfcbank",
        upi_qr_storage_key: `${organizationId}/k7-upi-qr.png`,
        upi_qr_filename: "k7-upi-qr.png",
        upi_qr_mime_type: "image/png",
        upi_qr_size_bytes: 1024,
      },
    });
  }

  const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
  return { memberId: member.id, email: refreshed.email, profileId: profile.id };
}

describe("Finance KYC review (K7 e2e)", () => {
  let app: INestApplication;
  let finance: AuthSession;
  let teamMember: AuthSession;
  let founder: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
    finance = await loginSession(app, "FINANCE");
    teamMember = await loginSession(app, "TEAM_MEMBER");
    founder = await loginSession(app, "FOUNDER_ADMIN");
  });

  afterAll(async () => {
    await cleanupK7(app);
    await cleanupTestFixtures(app);
    await app.close();
  });

  afterEach(async () => {
    await cleanupK7(app);
  });

  it("TEAM_MEMBER cannot list, detail, or review KYC", async () => {
    const { profileId } = await createMemberWithKyc(
      app,
      teamMember.organizationId,
      KycStatus.UNDER_REVIEW
    );

    const list = await request(app.getHttpServer())
      .get("/api/v1/finance/kyc")
      .set(authHeaders(teamMember));
    expect(list.status).toBe(403);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/finance/kyc/${profileId}`)
      .set(authHeaders(teamMember));
    expect(detail.status).toBe(403);

    const review = await request(app.getHttpServer())
      .post(`/api/v1/finance/kyc/${profileId}/review`)
      .set(authHeaders(teamMember))
      .send({ action: "APPROVE" });
    expect(review.status).toBe(403);
  });

  it("Finance can list own-org UNDER_REVIEW KYC without sensitive fields", async () => {
    const created = await createMemberWithKyc(
      app,
      finance.organizationId,
      KycStatus.UNDER_REVIEW,
      { emailSuffix: "list" }
    );

    const response = await request(app.getHttpServer())
      .get("/api/v1/finance/kyc")
      .set(authHeaders(finance));
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");

    const rows = response.body.data as Array<Record<string, unknown>>;
    const row = rows.find((r) => r.id === created.profileId);
    expect(row).toBeDefined();
    expect(row?.status).toBe("UNDER_REVIEW");
    expect(row?.memberName).toBeTruthy();
    expect(row?.memberEmail).toBeTruthy();
    expect(row).not.toHaveProperty("pan");
    expect(row).not.toHaveProperty("governmentIdNumber");
    expect(row).not.toHaveProperty("accountNumber");
    expect(row).not.toHaveProperty("ifsc");
    expect(row).not.toHaveProperty("upiId");
  });

  it("Finance cannot access another organization's KYC", async () => {
    const otherOrgId = await createSecondOrganization(app);
    const other = await createMemberWithKyc(app, otherOrgId, KycStatus.UNDER_REVIEW, {
      emailSuffix: "xorg",
    });

    const list = await request(app.getHttpServer())
      .get("/api/v1/finance/kyc")
      .set(authHeaders(finance));
    const ids = (list.body.data as Array<{ id: string }>).map((r) => r.id);
    expect(ids).not.toContain(other.profileId);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/finance/kyc/${other.profileId}`)
      .set(authHeaders(finance));
    expect(detail.status).toBe(404);
  });

  it("Finance can access authorized detail with payout + documents (no storage keys)", async () => {
    const created = await createMemberWithKyc(
      app,
      finance.organizationId,
      KycStatus.UNDER_REVIEW,
      { emailSuffix: "detail" }
    );

    const response = await request(app.getHttpServer())
      .get(`/api/v1/finance/kyc/${created.profileId}`)
      .set(authHeaders(finance));
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");

    const body = response.body as Record<string, unknown>;
    expect(body.pan).toBe("ABCDE1234F");
    expect(body.governmentIdNumber).toBe("1234-5678-9012");
    expect((body.payout as { accountNumber: string }).accountNumber).toBe("123456789012");
    expect(Array.isArray(body.documents)).toBe(true);
    expect((body.documents as unknown[]).length).toBe(2);
    for (const doc of body.documents as Array<Record<string, unknown>>) {
      expect(doc).not.toHaveProperty("storageKey");
      expect(doc).not.toHaveProperty("storage_key");
      expect(doc).not.toHaveProperty("downloadUrl");
    }

    const dumped = JSON.stringify(body);
    expect(dumped).not.toMatch(/storageKey|storage_key|r2\.cloudflare/i);
  });

  it("UNDER_REVIEW can be approved → VERIFIED with audit (no sensitive audit payload)", async () => {
    const created = await createMemberWithKyc(
      app,
      finance.organizationId,
      KycStatus.UNDER_REVIEW,
      { emailSuffix: "approve" }
    );

    const response = await request(app.getHttpServer())
      .post(`/api/v1/finance/kyc/${created.profileId}/review`)
      .set(authHeaders(finance))
      .send({ action: "APPROVE" });
    expect([200, 201].includes(response.status)).toBe(true);
    expect(response.body.status).toBe("VERIFIED");
    expect(response.body.verifiedAt).toBeTruthy();
    expect(response.body.rejectionReason).toBeNull();

    const prisma = app.get(PrismaService);
    const audits = await prisma.auditLog.findMany({
      where: {
        organization_id: finance.organizationId,
        entity_id: created.profileId,
        action: { in: [AUDIT_ACTIONS.KYC_REVIEW_STARTED, AUDIT_ACTIONS.KYC_VERIFIED] },
      },
    });
    expect(audits.some((a) => a.action === AUDIT_ACTIONS.KYC_REVIEW_STARTED)).toBe(true);
    expect(audits.some((a) => a.action === AUDIT_ACTIONS.KYC_VERIFIED)).toBe(true);

    const auditJson = JSON.stringify(audits);
    expect(auditJson).not.toContain("ABCDE1234F");
    expect(auditJson).not.toContain("123456789012");
    expect(auditJson).not.toContain("HDFC0001234");
    expect(auditJson).not.toContain("1234-5678-9012");
  });

  it("UNDER_REVIEW can be rejected with reason; empty reason fails", async () => {
    const created = await createMemberWithKyc(
      app,
      finance.organizationId,
      KycStatus.UNDER_REVIEW,
      { emailSuffix: "reject" }
    );

    const empty = await request(app.getHttpServer())
      .post(`/api/v1/finance/kyc/${created.profileId}/review`)
      .set(authHeaders(finance))
      .send({ action: "REJECT", rejectionReason: "" });
    expect(empty.status).toBeGreaterThanOrEqual(400);

    const missing = await request(app.getHttpServer())
      .post(`/api/v1/finance/kyc/${created.profileId}/review`)
      .set(authHeaders(finance))
      .send({ action: "REJECT" });
    expect(missing.status).toBeGreaterThanOrEqual(400);

    const ok = await request(app.getHttpServer())
      .post(`/api/v1/finance/kyc/${created.profileId}/review`)
      .set(authHeaders(finance))
      .send({ action: "REJECT", rejectionReason: "Documents are unclear." });
    expect([200, 201].includes(ok.status)).toBe(true);
    expect(ok.body.status).toBe("REJECTED");
    expect(ok.body.rejectionReason).toBe("Documents are unclear.");

    const prisma = app.get(PrismaService);
    const rejectedAudit = await prisma.auditLog.findFirst({
      where: {
        entity_id: created.profileId,
        action: AUDIT_ACTIONS.KYC_REJECTED,
      },
    });
    expect(rejectedAudit).toBeTruthy();
    expect(JSON.stringify(rejectedAudit)).not.toContain("Documents are unclear.");
  });

  it("VERIFIED cannot be rejected or re-approved; REJECTED cannot be reviewer-approved", async () => {
    const verified = await createMemberWithKyc(
      app,
      finance.organizationId,
      KycStatus.VERIFIED,
      { emailSuffix: "verified" }
    );
    const rejected = await createMemberWithKyc(
      app,
      finance.organizationId,
      KycStatus.REJECTED,
      { emailSuffix: "rejected" }
    );

    const rejectVerified = await request(app.getHttpServer())
      .post(`/api/v1/finance/kyc/${verified.profileId}/review`)
      .set(authHeaders(finance))
      .send({ action: "REJECT", rejectionReason: "Too late" });
    expect(rejectVerified.status).toBe(422);

    const reApprove = await request(app.getHttpServer())
      .post(`/api/v1/finance/kyc/${verified.profileId}/review`)
      .set(authHeaders(finance))
      .send({ action: "APPROVE" });
    expect(reApprove.status).toBe(422);

    const approveRejected = await request(app.getHttpServer())
      .post(`/api/v1/finance/kyc/${rejected.profileId}/review`)
      .set(authHeaders(finance))
      .send({ action: "APPROVE" });
    expect(approveRejected.status).toBe(422);
  });

  it("concurrent review does not corrupt state", async () => {
    const created = await createMemberWithKyc(
      app,
      finance.organizationId,
      KycStatus.UNDER_REVIEW,
      { emailSuffix: "race" }
    );

    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/finance/kyc/${created.profileId}/review`)
        .set(authHeaders(finance))
        .send({ action: "APPROVE" }),
      request(app.getHttpServer())
        .post(`/api/v1/finance/kyc/${created.profileId}/review`)
        .set(authHeaders(founder))
        .send({ action: "REJECT", rejectionReason: "Race reject" }),
    ]);

    const statuses = [a.status, b.status];
    const okCount = statuses.filter((s) => s === 200 || s === 201).length;
    const conflictCount = statuses.filter((s) => s === 409 || s === 422).length;
    expect(okCount).toBe(1);
    expect(conflictCount).toBeGreaterThanOrEqual(1);

    const prisma = app.get(PrismaService);
    const profile = await prisma.kycProfile.findUniqueOrThrow({
      where: { id: created.profileId },
    });
    expect(["VERIFIED", "REJECTED"]).toContain(profile.status);
    if (profile.status === "VERIFIED") {
      expect(profile.verified_at).toBeTruthy();
      expect(profile.rejection_reason).toBeNull();
    } else {
      expect(profile.rejected_at).toBeTruthy();
      expect(profile.rejection_reason).toBeTruthy();
    }
  });

  it("document download URL is org+permission scoped and not persisted", async () => {
    const created = await createMemberWithKyc(
      app,
      finance.organizationId,
      KycStatus.UNDER_REVIEW,
      { emailSuffix: "docs" }
    );
    const prisma = app.get(PrismaService);
    const doc = await prisma.kycDocument.findFirstOrThrow({
      where: { kyc_profile_id: created.profileId, document_type: "PAN_CARD" },
    });

    const forbidden = await request(app.getHttpServer())
      .get(`/api/v1/finance/kyc/${created.profileId}/documents/${doc.id}/download-url`)
      .set(authHeaders(teamMember));
    expect(forbidden.status).toBe(403);

    const otherOrgId = await createSecondOrganization(app);
    const other = await createMemberWithKyc(app, otherOrgId, KycStatus.UNDER_REVIEW, {
      emailSuffix: "docs-xorg",
    });
    const otherDoc = await prisma.kycDocument.findFirstOrThrow({
      where: { kyc_profile_id: other.profileId },
    });

    const cross = await request(app.getHttpServer())
      .get(`/api/v1/finance/kyc/${other.profileId}/documents/${otherDoc.id}/download-url`)
      .set(authHeaders(finance));
    expect(cross.status).toBe(404);

    // Mismatched profile/document pair
    const mismatch = await request(app.getHttpServer())
      .get(`/api/v1/finance/kyc/${created.profileId}/documents/${otherDoc.id}/download-url`)
      .set(authHeaders(finance));
    expect(mismatch.status).toBe(404);

    // Own-org may succeed or 503 if R2 unset — never persist URL on the document row
    const own = await request(app.getHttpServer())
      .get(`/api/v1/finance/kyc/${created.profileId}/documents/${doc.id}/download-url`)
      .set(authHeaders(finance));
    expect([200, 503]).toContain(own.status);
    if (own.status === 200) {
      expect(own.body.downloadUrl).toBeTruthy();
      expect(own.headers["cache-control"]).toBe("no-store");
    }

    const persisted = await prisma.kycDocument.findUniqueOrThrow({ where: { id: doc.id } });
    expect(JSON.stringify(persisted)).not.toMatch(/https?:\/\//);
    expect(persisted).not.toHaveProperty("download_url");
  });

  it("FOUNDER_ADMIN can list via wildcard finance.manage", async () => {
    await createMemberWithKyc(app, founder.organizationId, KycStatus.UNDER_REVIEW, {
      emailSuffix: "founder",
    });
    const response = await request(app.getHttpServer())
      .get("/api/v1/finance/kyc")
      .set(authHeaders(founder));
    expect(response.status).toBe(200);
  });
});
