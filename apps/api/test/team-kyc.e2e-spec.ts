import type { INestApplication } from "@nestjs/common";
import {
  KycDocumentStatus,
  KycDocumentType,
  KycGovernmentIdType,
  KycStatus,
  UserRole,
} from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./support/bootstrap";
import { createSecondOrganization } from "./support/fixtures";
import { PrismaService } from "../src/database/prisma.service";
import { PasswordService } from "../src/modules/auth/services/password.service";
import { OrganizationContextService } from "../src/modules/shared/organization-context.service";
import { authHeaders, type AuthSession } from "./support/team-shared";

const KYC_TEST_PREFIX = "phase-k2-e2e-";

const COMPLETE_KYC_BODY = {
  legalName: "Ada Lovelace",
  dateOfBirth: "1990-05-15",
  mobile: "+919876543210",
  addressLine1: "42 Analytical Engine Lane",
  addressLine2: "Floor 2",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  pan: "ABCDE1234F",
  governmentIdType: KycGovernmentIdType.AADHAAR,
  governmentIdNumber: "1234-5678-9012",
};

async function cleanupKycTestData(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const users = await prisma.user.findMany({
    where: { email: { startsWith: KYC_TEST_PREFIX } },
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
      await prisma.kycDocument.deleteMany({
        where: { kyc_profile_id: { in: profileIds } },
      });
      await prisma.kycProfile.deleteMany({
        where: { id: { in: profileIds } },
      });
    }
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

async function loginKycMember(
  app: INestApplication,
  role: UserRole,
  opts?: { organizationId?: string; emailSuffix?: string }
): Promise<AuthSession> {
  const prisma = app.get(PrismaService);
  const passwordService = app.get(PasswordService);
  const organizationId =
    opts?.organizationId ??
    (await app.get(OrganizationContextService).resolveSingleOrganizationId());

  const email = `${KYC_TEST_PREFIX}${opts?.emailSuffix ?? role.toLowerCase()}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@forge.local`;
  const password = "Correct-Horse-Battery-Staple-1";
  const passwordHash = await passwordService.hash(password);

  const user = await prisma.user.create({
    data: {
      organization_id: organizationId,
      email,
      name: `K2 Test ${role}`,
      role,
      password_hash: passwordHash,
      active: true,
      onboarded_at: new Date(),
    },
  });

  const response = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email, password });

  if (response.status !== 200) {
    throw new Error(
      `Login failed with status ${response.status}: ${JSON.stringify(response.body)}`
    );
  }

  const setCookie = response.headers["set-cookie"] as unknown as string[];
  return {
    cookie: extractCookie(setCookie, "forge_session")!,
    csrf: extractCookie(setCookie, "forge_csrf")!,
    userId: user.id,
    email,
    organizationId,
    role,
  };
}

async function seedKycDocument(
  app: INestApplication,
  opts: {
    organizationId: string;
    kycProfileId: string;
    documentType: KycDocumentType;
    storageKeySuffix: string;
  }
) {
  const prisma = app.get(PrismaService);
  return prisma.kycDocument.create({
    data: {
      organization_id: opts.organizationId,
      kyc_profile_id: opts.kycProfileId,
      document_type: opts.documentType,
      storage_key: `kyc-test/${opts.storageKeySuffix}`,
      filename: `${opts.documentType.toLowerCase()}.pdf`,
      mime_type: "application/pdf",
      size_bytes: 1024,
      status: KycDocumentStatus.UPLOADED,
    },
  });
}

describe("K2: TEAM_MEMBER KYC API (e2e)", () => {
  let app: INestApplication;
  let member: AuthSession;
  let otherMember: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanupKycTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanupKycTestData(app);
    member = await loginKycMember(app, UserRole.TEAM_MEMBER, {
      emailSuffix: "a",
    });
    otherMember = await loginKycMember(app, UserRole.TEAM_MEMBER, {
      organizationId: member.organizationId,
      emailSuffix: "b",
    });
  });

  it("unauthenticated access fails", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/team/kyc");
    expect(res.status).toBe(401);
  });

  it("CSRF protection rejects mutating requests without token", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/team/kyc")
      .set("Cookie", `forge_session=${member.cookie}; forge_csrf=${member.csrf}`)
      .send(COMPLETE_KYC_BODY);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_TOKEN_INVALID");
  });

  it("TEAM_MEMBER creates and reads own KYC", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send({ legalName: "Partial Name", pan: "abcde1234f" });

    expect(created.status).toBe(201);
    expect(created.body.status).toBe(KycStatus.DRAFT);
    expect(created.body.legalName).toBe("Partial Name");
    expect(created.body.pan).toBe("ABCDE1234F");
    expect(created.body.storage_key).toBeUndefined();
    expect(created.body.documents).toEqual([]);

    const read = await request(app.getHttpServer())
      .get("/api/v1/team/kyc")
      .set(authHeaders(member));
    expect(read.status).toBe(200);
    expect(read.body.id).toBe(created.body.id);
    expect(read.body.legalName).toBe("Partial Name");
  });

  it("TEAM_MEMBER updates own KYC while DRAFT", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send({ legalName: "Draft Name" });

    const updated = await request(app.getHttpServer())
      .patch("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send({ city: "Mumbai", mobile: "+919999999999" });

    expect(updated.status).toBe(200);
    expect(updated.body.city).toBe("Mumbai");
    expect(updated.body.mobile).toBe("+919999999999");
    expect(updated.body.legalName).toBe("Draft Name");
  });

  it("TEAM_MEMBER cannot read or update another user's KYC", async () => {
    const a = await request(app.getHttpServer())
      .post("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send({ legalName: "Member A Secret" });
    expect(a.status).toBe(201);

    const b = await request(app.getHttpServer())
      .post("/api/v1/team/kyc")
      .set(authHeaders(otherMember))
      .send({ legalName: "Member B Own" });
    expect(b.status).toBe(201);

    const readB = await request(app.getHttpServer())
      .get("/api/v1/team/kyc")
      .set(authHeaders(otherMember));
    expect(readB.status).toBe(200);
    expect(readB.body.id).toBe(b.body.id);
    expect(readB.body.legalName).toBe("Member B Own");
    expect(readB.body.id).not.toBe(a.body.id);

    const patchB = await request(app.getHttpServer())
      .patch("/api/v1/team/kyc")
      .set(authHeaders(otherMember))
      .send({ legalName: "Member B Updated" });
    expect(patchB.status).toBe(200);
    expect(patchB.body.legalName).toBe("Member B Updated");

    const readA = await request(app.getHttpServer())
      .get("/api/v1/team/kyc")
      .set(authHeaders(member));
    expect(readA.body.legalName).toBe("Member A Secret");
  });

  it("cross-organization access fails (each org only sees own profile)", async () => {
    const prisma = app.get(PrismaService);
    const otherOrgId = await createSecondOrganization(app);
    const foreignUser = await prisma.user.create({
      data: {
        organization_id: otherOrgId,
        email: `${KYC_TEST_PREFIX}foreign-${Date.now()}@forge.local`,
        name: "Foreign Member",
        role: UserRole.TEAM_MEMBER,
        password_hash: "not-used-for-login",
        active: true,
        onboarded_at: new Date(),
      },
    });
    const foreignProfile = await prisma.kycProfile.create({
      data: {
        organization_id: otherOrgId,
        user_id: foreignUser.id,
        status: KycStatus.DRAFT,
        legal_name: "Foreign Org KYC",
        pan: "ZZZZZ9999Z",
      },
    });

    const homeCreate = await request(app.getHttpServer())
      .post("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send({ legalName: "Home Org KYC" });
    expect(homeCreate.status).toBe(201);

    const homeRead = await request(app.getHttpServer())
      .get("/api/v1/team/kyc")
      .set(authHeaders(member));
    expect(homeRead.status).toBe(200);
    expect(homeRead.body.id).toBe(homeCreate.body.id);
    expect(homeRead.body.legalName).toBe("Home Org KYC");
    expect(homeRead.body.id).not.toBe(foreignProfile.id);
    expect(homeRead.body.pan).not.toBe("ZZZZZ9999Z");

    const leaked = await prisma.kycProfile.findFirst({
      where: {
        id: foreignProfile.id,
        organization_id: member.organizationId,
      },
    });
    expect(leaked).toBeNull();

    // Update only mutates the caller's org-scoped profile.
    await request(app.getHttpServer())
      .patch("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send({ legalName: "Home Org Updated" });

    const foreignAfter = await prisma.kycProfile.findUniqueOrThrow({
      where: { id: foreignProfile.id },
    });
    expect(foreignAfter.legal_name).toBe("Foreign Org KYC");
  });

  it("incomplete submission fails", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send({ legalName: "Incomplete" });

    const res = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/submit")
      .set(authHeaders(member));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("KYC_INCOMPLETE");
    expect(res.body.error.details.missing).toEqual(
      expect.arrayContaining([
        "dateOfBirth",
        "mobile",
        "pan",
        "document:PAN_CARD",
        "document:GOVERNMENT_ID",
      ])
    );
  });

  it("missing PAN document fails submission", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send(COMPLETE_KYC_BODY);
    expect(created.status).toBe(201);

    await seedKycDocument(app, {
      organizationId: member.organizationId,
      kycProfileId: created.body.id,
      documentType: KycDocumentType.GOVERNMENT_ID,
      storageKeySuffix: `${created.body.id}-gov`,
    });

    const res = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/submit")
      .set(authHeaders(member));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("KYC_INCOMPLETE");
    expect(res.body.error.details.missing).toContain("document:PAN_CARD");
    expect(res.body.error.details.missing).not.toContain(
      "document:GOVERNMENT_ID"
    );
  });

  it("missing government ID document fails submission", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send(COMPLETE_KYC_BODY);
    expect(created.status).toBe(201);

    await seedKycDocument(app, {
      organizationId: member.organizationId,
      kycProfileId: created.body.id,
      documentType: KycDocumentType.PAN_CARD,
      storageKeySuffix: `${created.body.id}-pan`,
    });

    const res = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/submit")
      .set(authHeaders(member));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("KYC_INCOMPLETE");
    expect(res.body.error.details.missing).toContain("document:GOVERNMENT_ID");
  });

  it("successful submission changes status to UNDER_REVIEW", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send(COMPLETE_KYC_BODY);
    expect(created.status).toBe(201);

    await seedKycDocument(app, {
      organizationId: member.organizationId,
      kycProfileId: created.body.id,
      documentType: KycDocumentType.PAN_CARD,
      storageKeySuffix: `${created.body.id}-pan`,
    });
    await seedKycDocument(app, {
      organizationId: member.organizationId,
      kycProfileId: created.body.id,
      documentType: KycDocumentType.GOVERNMENT_ID,
      storageKeySuffix: `${created.body.id}-gov`,
    });

    const submitted = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/submit")
      .set(authHeaders(member));
    expect(submitted.status).toBe(201);
    expect(submitted.body.status).toBe(KycStatus.UNDER_REVIEW);
    expect(submitted.body.submittedAt).toBeTruthy();
    expect(submitted.body.documents).toHaveLength(2);
    for (const doc of submitted.body.documents) {
      expect(doc.storage_key).toBeUndefined();
      expect(doc.storageKey).toBeUndefined();
      expect(doc.url).toBeUndefined();
    }

    const patch = await request(app.getHttpServer())
      .patch("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send({ city: "Should Fail" });
    expect(patch.status).toBe(409);
    expect(patch.body.error.code).toBe("KYC_IMMUTABLE");
  });

  it("rejected KYC can be corrected and resubmitted", async () => {
    const prisma = app.get(PrismaService);
    const created = await request(app.getHttpServer())
      .post("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send(COMPLETE_KYC_BODY);
    expect(created.status).toBe(201);

    await prisma.kycProfile.update({
      where: { id: created.body.id },
      data: {
        status: KycStatus.REJECTED,
        rejected_at: new Date(),
        rejection_reason: "Document unclear",
      },
    });

    const corrected = await request(app.getHttpServer())
      .patch("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send({ legalName: "Ada Corrected" });
    expect(corrected.status).toBe(200);
    expect(corrected.body.status).toBe(KycStatus.DRAFT);
    expect(corrected.body.legalName).toBe("Ada Corrected");
    expect(corrected.body.rejectionReason).toBeNull();

    await seedKycDocument(app, {
      organizationId: member.organizationId,
      kycProfileId: created.body.id,
      documentType: KycDocumentType.PAN_CARD,
      storageKeySuffix: `${created.body.id}-pan-r`,
    });
    await seedKycDocument(app, {
      organizationId: member.organizationId,
      kycProfileId: created.body.id,
      documentType: KycDocumentType.GOVERNMENT_ID,
      storageKeySuffix: `${created.body.id}-gov-r`,
    });

    const resubmitted = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/submit")
      .set(authHeaders(member));
    expect(resubmitted.status).toBe(201);
    expect(resubmitted.body.status).toBe(KycStatus.UNDER_REVIEW);
  });

  it("verified KYC cannot be modified", async () => {
    const prisma = app.get(PrismaService);
    const created = await request(app.getHttpServer())
      .post("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send(COMPLETE_KYC_BODY);
    expect(created.status).toBe(201);

    await prisma.kycProfile.update({
      where: { id: created.body.id },
      data: {
        status: KycStatus.VERIFIED,
        verified_at: new Date(),
        submitted_at: new Date(),
      },
    });

    const patch = await request(app.getHttpServer())
      .patch("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send({ city: "No" });
    expect(patch.status).toBe(409);
    expect(patch.body.error.code).toBe("KYC_IMMUTABLE");

    const submit = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/submit")
      .set(authHeaders(member));
    expect(submit.status).toBe(409);
    expect(submit.body.error.code).toBe("KYC_NOT_SUBMITTABLE");
  });

  it("sensitive values do not appear in audit payloads", async () => {
    const prisma = app.get(PrismaService);
    const created = await request(app.getHttpServer())
      .post("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send(COMPLETE_KYC_BODY);
    expect(created.status).toBe(201);

    await request(app.getHttpServer())
      .patch("/api/v1/team/kyc")
      .set(authHeaders(member))
      .send({ city: "Chennai" });

    await seedKycDocument(app, {
      organizationId: member.organizationId,
      kycProfileId: created.body.id,
      documentType: KycDocumentType.PAN_CARD,
      storageKeySuffix: `${created.body.id}-pan-a`,
    });
    await seedKycDocument(app, {
      organizationId: member.organizationId,
      kycProfileId: created.body.id,
      documentType: KycDocumentType.GOVERNMENT_ID,
      storageKeySuffix: `${created.body.id}-gov-a`,
    });

    await request(app.getHttpServer())
      .post("/api/v1/team/kyc/submit")
      .set(authHeaders(member));

    const logs = await prisma.auditLog.findMany({
      where: {
        entity_type: "KycProfile",
        entity_id: created.body.id,
        action: {
          in: ["kyc.created", "kyc.updated", "kyc.submitted"],
        },
      },
    });
    expect(logs.length).toBeGreaterThanOrEqual(3);

    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain("ABCDE1234F");
    expect(serialized).not.toContain("1234-5678-9012");
    expect(serialized).not.toContain("kyc-test/");
    expect(serialized).not.toMatch(/"pan"\s*:/);
    expect(serialized).not.toMatch(/government_id_number|governmentIdNumber/);
  });
});
