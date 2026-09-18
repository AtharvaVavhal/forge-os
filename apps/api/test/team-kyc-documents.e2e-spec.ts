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
import { PRESIGNED_URL_TTL_SECONDS } from "../src/modules/shared/documents/services/storage.service";
import { authHeaders, type AuthSession } from "./support/team-shared";

const KYC_DOC_TEST_PREFIX = "phase-k3-e2e-";

const COMPLETE_KYC_BODY = {
  legalName: "Ada Lovelace",
  dateOfBirth: "1990-05-15",
  mobile: "+919876543210",
  addressLine1: "42 Analytical Engine Lane",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  pan: "ABCDE1234F",
  governmentIdType: KycGovernmentIdType.AADHAAR,
  governmentIdNumber: "1234-5678-9012",
};

async function cleanupKycDocTestData(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const users = await prisma.user.findMany({
    where: { email: { startsWith: KYC_DOC_TEST_PREFIX } },
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

  const email = `${KYC_DOC_TEST_PREFIX}${opts?.emailSuffix ?? role.toLowerCase()}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@forge.local`;
  const password = "Correct-Horse-Battery-Staple-1";
  const passwordHash = await passwordService.hash(password);

  const user = await prisma.user.create({
    data: {
      organization_id: organizationId,
      email,
      name: `K3 Test ${role}`,
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

async function createOwnDraftKyc(
  app: INestApplication,
  session: AuthSession,
  body: Record<string, unknown> = { legalName: "Draft" }
) {
  const res = await request(app.getHttpServer())
    .post("/api/v1/team/kyc")
    .set(authHeaders(session))
    .send(body);
  expect(res.status).toBe(201);
  return res.body as { id: string; status: string };
}

async function uploadKycDocument(
  app: INestApplication,
  session: AuthSession,
  documentType: KycDocumentType,
  opts?: { filename?: string; mimeType?: string; sizeBytes?: number }
) {
  const filename = opts?.filename ?? `${documentType.toLowerCase()}.pdf`;
  const mimeType = opts?.mimeType ?? "application/pdf";
  const sizeBytes = opts?.sizeBytes ?? 2048;

  const presign = await request(app.getHttpServer())
    .post("/api/v1/team/kyc/documents/presign-upload")
    .set(authHeaders(session))
    .send({ documentType, filename, mimeType, sizeBytes });
  expect(presign.status).toBe(201);

  const registered = await request(app.getHttpServer())
    .post("/api/v1/team/kyc/documents")
    .set(authHeaders(session))
    .send({
      documentType,
      filename,
      storageKey: presign.body.storageKey,
      mimeType,
      sizeBytes,
    });
  expect(registered.status).toBe(201);
  return {
    presign: presign.body as {
      storageKey: string;
      uploadUrl: string;
      expiresAt: string;
      maxSizeBytes: number;
      documentType: string;
    },
    document: registered.body as {
      id: string;
      documentType: string;
      status: string;
      storageKey?: string;
    },
  };
}

describe("K3: KYC document storage (e2e)", () => {
  let app: INestApplication;
  let member: AuthSession;
  let otherMember: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanupKycDocTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanupKycDocTestData(app);
    member = await loginKycMember(app, UserRole.TEAM_MEMBER, {
      emailSuffix: "a",
    });
    otherMember = await loginKycMember(app, UserRole.TEAM_MEMBER, {
      organizationId: member.organizationId,
      emailSuffix: "b",
    });
  });

  it("TEAM_MEMBER can request/upload PAN document", async () => {
    await createOwnDraftKyc(app, member);
    const { presign, document } = await uploadKycDocument(
      app,
      member,
      KycDocumentType.PAN_CARD
    );

    expect(presign.storageKey.startsWith(`${member.organizationId}/`)).toBe(
      true
    );
    expect(presign.storageKey).not.toContain("..");
    expect(presign.uploadUrl).toContain("X-Amz-Signature=");
    expect(presign.uploadUrl).not.toMatch(/test-secret-access-key/i);
    expect(document.documentType).toBe(KycDocumentType.PAN_CARD);
    expect(document.status).toBe(KycDocumentStatus.UPLOADED);
    expect(document.storageKey).toBeUndefined();
    expect((document as { storage_key?: string }).storage_key).toBeUndefined();

    const profile = await request(app.getHttpServer())
      .get("/api/v1/team/kyc")
      .set(authHeaders(member));
    expect(profile.body.documents).toHaveLength(1);
    expect(profile.body.documents[0].documentType).toBe(
      KycDocumentType.PAN_CARD
    );
  });

  it("TEAM_MEMBER can upload government ID", async () => {
    await createOwnDraftKyc(app, member);
    const { document } = await uploadKycDocument(
      app,
      member,
      KycDocumentType.GOVERNMENT_ID,
      { filename: "aadhaar.png", mimeType: "image/png", sizeBytes: 4096 }
    );
    expect(document.documentType).toBe(KycDocumentType.GOVERNMENT_ID);
  });

  it("unsupported MIME rejected", async () => {
    await createOwnDraftKyc(app, member);
    const res = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/documents/presign-upload")
      .set(authHeaders(member))
      .send({
        documentType: KycDocumentType.PAN_CARD,
        filename: "x.gif",
        mimeType: "image/gif",
        sizeBytes: 100,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UNSUPPORTED_MIME_TYPE");
  });

  it("SVG rejected", async () => {
    await createOwnDraftKyc(app, member);
    const res = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/documents/presign-upload")
      .set(authHeaders(member))
      .send({
        documentType: KycDocumentType.PAN_CARD,
        filename: "x.svg",
        mimeType: "image/svg+xml",
        sizeBytes: 100,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UNSUPPORTED_MIME_TYPE");
  });

  it("ZIP rejected", async () => {
    await createOwnDraftKyc(app, member);
    const res = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/documents/presign-upload")
      .set(authHeaders(member))
      .send({
        documentType: KycDocumentType.PAN_CARD,
        filename: "x.zip",
        mimeType: "application/zip",
        sizeBytes: 100,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("UNSUPPORTED_MIME_TYPE");
  });

  it("oversized file rejected", async () => {
    await createOwnDraftKyc(app, member);
    const res = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/documents/presign-upload")
      .set(authHeaders(member))
      .send({
        documentType: KycDocumentType.PAN_CARD,
        filename: "huge.pdf",
        mimeType: "application/pdf",
        sizeBytes: 27_000_000,
      });
    expect(res.status).toBe(400);
    // DTO Max or StorageService INVALID_FILE_SIZE
    expect(["INVALID_FILE_SIZE", "BAD_REQUEST"]).toContain(res.body.error.code);
  });

  it("invalid document type rejected", async () => {
    await createOwnDraftKyc(app, member);
    const res = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/documents/presign-upload")
      .set(authHeaders(member))
      .send({
        documentType: "PASSPORT_SCAN",
        filename: "x.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      });
    expect(res.status).toBe(400);
  });

  it("user cannot access another user's KYC document", async () => {
    await createOwnDraftKyc(app, member);
    await createOwnDraftKyc(app, otherMember);
    const { document } = await uploadKycDocument(
      app,
      member,
      KycDocumentType.PAN_CARD
    );

    const download = await request(app.getHttpServer())
      .get(`/api/v1/team/kyc/documents/${document.id}/download-url`)
      .set(authHeaders(otherMember));
    expect(download.status).toBe(404);

    const del = await request(app.getHttpServer())
      .post(`/api/v1/team/kyc/documents/${document.id}/delete`)
      .set(authHeaders(otherMember));
    expect(del.status).toBe(404);
  });

  it("cross-organization document access fails", async () => {
    const prisma = app.get(PrismaService);
    const otherOrgId = await createSecondOrganization(app);
    const foreignUser = await prisma.user.create({
      data: {
        organization_id: otherOrgId,
        email: `${KYC_DOC_TEST_PREFIX}foreign-${Date.now()}@forge.local`,
        name: "Foreign",
        role: UserRole.TEAM_MEMBER,
        password_hash: "unused",
        active: true,
        onboarded_at: new Date(),
      },
    });
    const foreignProfile = await prisma.kycProfile.create({
      data: {
        organization_id: otherOrgId,
        user_id: foreignUser.id,
        status: KycStatus.DRAFT,
        legal_name: "Foreign",
      },
    });
    const foreignDoc = await prisma.kycDocument.create({
      data: {
        organization_id: otherOrgId,
        kyc_profile_id: foreignProfile.id,
        document_type: KycDocumentType.PAN_CARD,
        storage_key: `${otherOrgId}/foreign-pan.pdf`,
        filename: "foreign-pan.pdf",
        mime_type: "application/pdf",
        size_bytes: 100,
        status: KycDocumentStatus.UPLOADED,
      },
    });

    await createOwnDraftKyc(app, member);
    const download = await request(app.getHttpServer())
      .get(`/api/v1/team/kyc/documents/${foreignDoc.id}/download-url`)
      .set(authHeaders(member));
    expect(download.status).toBe(404);
  });

  it("user cannot use another user's KYC profile ID to upload", async () => {
    await createOwnDraftKyc(app, member);
    await createOwnDraftKyc(app, otherMember);

    const prisma = app.get(PrismaService);
    const otherProfile = await prisma.kycProfile.findFirstOrThrow({
      where: { user_id: otherMember.userId },
    });

    const { document } = await uploadKycDocument(
      app,
      member,
      KycDocumentType.PAN_CARD
    );

    const row = await prisma.kycDocument.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(row.kyc_profile_id).not.toBe(otherProfile.id);

    // Client-supplied kycProfileId is rejected (forbidNonWhitelisted) — never trusted.
    const spoof = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/documents/presign-upload")
      .set(authHeaders(member))
      .send({
        documentType: KycDocumentType.GOVERNMENT_ID,
        filename: "gov.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        kycProfileId: otherProfile.id,
      });
    expect(spoof.status).toBe(400);
  });

  it("user cannot use another user's document ID to download", async () => {
    await createOwnDraftKyc(app, member);
    await createOwnDraftKyc(app, otherMember);
    const { document } = await uploadKycDocument(
      app,
      otherMember,
      KycDocumentType.PAN_CARD
    );

    const download = await request(app.getHttpServer())
      .get(`/api/v1/team/kyc/documents/${document.id}/download-url`)
      .set(authHeaders(member));
    expect(download.status).toBe(404);
  });

  it("removed document no longer satisfies KYC submission requirement", async () => {
    await createOwnDraftKyc(app, member, COMPLETE_KYC_BODY);
    const pan = await uploadKycDocument(app, member, KycDocumentType.PAN_CARD);
    await uploadKycDocument(app, member, KycDocumentType.GOVERNMENT_ID);

    const removed = await request(app.getHttpServer())
      .post(`/api/v1/team/kyc/documents/${pan.document.id}/delete`)
      .set(authHeaders(member));
    expect(removed.status).toBe(201);
    expect(removed.body.status).toBe(KycDocumentStatus.REMOVED);

    const submit = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/submit")
      .set(authHeaders(member));
    expect(submit.status).toBe(422);
    expect(submit.body.error.code).toBe("KYC_INCOMPLETE");
    expect(submit.body.error.details.missing).toContain("document:PAN_CARD");
  });

  it("immutable KYC cannot have documents modified", async () => {
    const prisma = app.get(PrismaService);
    const profile = await createOwnDraftKyc(app, member);
    await uploadKycDocument(app, member, KycDocumentType.PAN_CARD);

    await prisma.kycProfile.update({
      where: { id: profile.id },
      data: { status: KycStatus.UNDER_REVIEW, submitted_at: new Date() },
    });

    const presign = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/documents/presign-upload")
      .set(authHeaders(member))
      .send({
        documentType: KycDocumentType.GOVERNMENT_ID,
        filename: "gov.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      });
    expect(presign.status).toBe(409);
    expect(presign.body.error.code).toBe("KYC_IMMUTABLE");
  });

  it("rejected KYC can have documents corrected", async () => {
    const prisma = app.get(PrismaService);
    const profile = await createOwnDraftKyc(app, member);
    const { document } = await uploadKycDocument(
      app,
      member,
      KycDocumentType.PAN_CARD
    );

    await prisma.kycProfile.update({
      where: { id: profile.id },
      data: {
        status: KycStatus.REJECTED,
        rejected_at: new Date(),
        rejection_reason: "Blurry",
      },
    });

    const del = await request(app.getHttpServer())
      .post(`/api/v1/team/kyc/documents/${document.id}/delete`)
      .set(authHeaders(member));
    expect(del.status).toBe(201);

    const replacement = await uploadKycDocument(
      app,
      member,
      KycDocumentType.PAN_CARD,
      { filename: "pan-corrected.pdf" }
    );
    expect(replacement.document.status).toBe(KycDocumentStatus.UPLOADED);
  });

  it("signed download URL is short-lived and not persisted", async () => {
    await createOwnDraftKyc(app, member);
    const { document, presign } = await uploadKycDocument(
      app,
      member,
      KycDocumentType.PAN_CARD
    );

    expect(PRESIGNED_URL_TTL_SECONDS).toBe(900);
    const expiresAt = Date.parse(presign.expiresAt);
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(expiresAt).toBeLessThanOrEqual(
      Date.now() + PRESIGNED_URL_TTL_SECONDS * 1000 + 5_000
    );

    const download = await request(app.getHttpServer())
      .get(`/api/v1/team/kyc/documents/${document.id}/download-url`)
      .set(authHeaders(member));
    expect(download.status).toBe(200);
    expect(download.body.downloadUrl).toContain("X-Amz-Signature=");
    expect(download.body.downloadUrl).not.toMatch(/test-secret-access-key/i);
    const dlExpires = Date.parse(download.body.expiresAt);
    expect(dlExpires).toBeGreaterThan(Date.now());
    expect(dlExpires).toBeLessThanOrEqual(
      Date.now() + PRESIGNED_URL_TTL_SECONDS * 1000 + 5_000
    );

    const prisma = app.get(PrismaService);
    const row = await prisma.kycDocument.findUniqueOrThrow({
      where: { id: document.id },
    });
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("downloadUrl");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(row.storage_key.startsWith(`${member.organizationId}/`)).toBe(true);
  });

  it("storage key is server-controlled; client-invented keys rejected", async () => {
    await createOwnDraftKyc(app, member);
    const invent = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/documents")
      .set(authHeaders(member))
      .send({
        documentType: KycDocumentType.PAN_CARD,
        filename: "evil.pdf",
        storageKey: `${member.organizationId}/client-chosen-key.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 100,
      });
    // Key format may pass org check but HeadObject fails (never uploaded).
    expect([400, 409]).toContain(invent.status);
    expect(["STORAGE_OBJECT_MISSING", "STORAGE_KEY_ALREADY_REGISTERED"]).toContain(
      invent.body.error.code
    );

    const crossOrg = await request(app.getHttpServer())
      .post("/api/v1/team/kyc/documents")
      .set(authHeaders(member))
      .send({
        documentType: KycDocumentType.PAN_CARD,
        filename: "evil.pdf",
        storageKey: "00000000-0000-0000-0000-000000000099/stolen.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      });
    expect(crossOrg.status).toBe(400);
    expect(crossOrg.body.error.code).toBe("INVALID_STORAGE_KEY");
  });

  it("sensitive data does not enter audit payloads", async () => {
    const prisma = app.get(PrismaService);
    await createOwnDraftKyc(app, member, COMPLETE_KYC_BODY);
    const { document } = await uploadKycDocument(
      app,
      member,
      KycDocumentType.PAN_CARD
    );

    await request(app.getHttpServer())
      .post(`/api/v1/team/kyc/documents/${document.id}/delete`)
      .set(authHeaders(member));

    const logs = await prisma.auditLog.findMany({
      where: {
        entity_type: "KycDocument",
        entity_id: document.id,
        action: {
          in: ["kyc.document_uploaded", "kyc.document_removed"],
        },
      },
    });
    expect(logs.length).toBeGreaterThanOrEqual(2);

    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain("ABCDE1234F");
    expect(serialized).not.toContain("1234-5678-9012");
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).not.toMatch(/"storage_key"|"storageKey"|"uploadUrl"|"downloadUrl"/);
  });
});
