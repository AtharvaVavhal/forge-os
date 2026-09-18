import type { INestApplication } from "@nestjs/common";
import { PayoutMethod, UserRole } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./support/bootstrap";
import { createSecondOrganization } from "./support/fixtures";
import { PrismaService } from "../src/database/prisma.service";
import { PasswordService } from "../src/modules/auth/services/password.service";
import { OrganizationContextService } from "../src/modules/shared/organization-context.service";
import { authHeaders, type AuthSession } from "./support/team-shared";

const PAYOUT_TEST_PREFIX = "phase-k4-e2e-";

const DUAL_BODY = {
  accountHolderName: "Ada Lovelace",
  bankName: "HDFC Bank",
  accountNumber: "50100123456789",
  ifsc: "HDFC0001234",
  upiId: "ada@okhdfcbank",
};

async function cleanupPayoutTestData(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PAYOUT_TEST_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    await prisma.payoutProfile.deleteMany({
      where: { user_id: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await prisma.organization
    .deleteMany({
      where: {
        name: { startsWith: "Phase 1 E2E Second Org" },
        users: { none: {} },
        payout_profiles: { none: {} },
      },
    })
    .catch(() => {});
}

async function loginPayoutMember(
  app: INestApplication,
  role: UserRole,
  opts?: { organizationId?: string; emailSuffix?: string }
): Promise<AuthSession> {
  const prisma = app.get(PrismaService);
  const passwordService = app.get(PasswordService);
  const organizationId =
    opts?.organizationId ??
    (await app.get(OrganizationContextService).resolveSingleOrganizationId());

  const email = `${PAYOUT_TEST_PREFIX}${opts?.emailSuffix ?? role.toLowerCase()}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@forge.local`;
  const password = "Correct-Horse-Battery-Staple-1";
  const passwordHash = await passwordService.hash(password);

  const user = await prisma.user.create({
    data: {
      organization_id: organizationId,
      email,
      name: `K4 Test ${role}`,
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

describe("K4: TEAM_MEMBER Payout Profile API (e2e)", () => {
  let app: INestApplication;
  let member: AuthSession;
  let otherMember: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanupPayoutTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanupPayoutTestData(app);
    member = await loginPayoutMember(app, UserRole.TEAM_MEMBER, {
      emailSuffix: "a",
    });
    otherMember = await loginPayoutMember(app, UserRole.TEAM_MEMBER, {
      organizationId: member.organizationId,
      emailSuffix: "b",
    });
  });

  it("unauthenticated access fails", async () => {
    const res = await request(app.getHttpServer()).get(
      "/api/v1/team/payout-profile"
    );
    expect(res.status).toBe(401);
  });

  it("CSRF protection rejects mutating requests without token", async () => {
    const res = await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set("Cookie", `forge_session=${member.cookie}; forge_csrf=${member.csrf}`)
      .send(DUAL_BODY);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_TOKEN_INVALID");
  });

  it("GET returns not-configured when no profile exists", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/team/payout-profile")
      .set(authHeaders(member));
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.id).toBeNull();
    expect(res.body.preferredMethod).toBeNull();
    expect(res.body.upiQr).toEqual({
      uploaded: false,
      filename: null,
      mimeType: null,
      sizeBytes: null,
    });
  });

  it("TEAM_MEMBER can create dual bank+UPI payout profile", async () => {
    const res = await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(DUAL_BODY);
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.preferredMethod).toBe(PayoutMethod.BANK_TRANSFER);
    expect(res.body.accountHolderName).toBe("Ada Lovelace");
    expect(res.body.bankName).toBe("HDFC Bank");
    expect(res.body.accountNumber).toBe("50100123456789");
    expect(res.body.ifsc).toBe("HDFC0001234");
    expect(res.body.upiId).toBe("ada@okhdfcbank");
    expect(res.body.upiQr).toEqual({
      uploaded: false,
      filename: null,
      mimeType: null,
      sizeBytes: null,
    });
    expect(res.body.upiQrStorageKey).toBeUndefined();
    expect(res.body.storage_key).toBeUndefined();
    expect(res.body.upi_qr_storage_key).toBeUndefined();
  });

  it("TEAM_MEMBER can read own profile", async () => {
    await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(DUAL_BODY);

    const res = await request(app.getHttpServer())
      .get("/api/v1/team/payout-profile")
      .set(authHeaders(member));
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.accountNumber).toBe("50100123456789");
  });

  it("TEAM_MEMBER can update own profile", async () => {
    await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(DUAL_BODY);

    const updated = await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send({
        ...DUAL_BODY,
        accountHolderName: "Ada L. Updated",
        bankName: "ICICI Bank",
        ifsc: "ICIC0009876",
      });
    expect(updated.status).toBe(200);
    expect(updated.body.accountHolderName).toBe("Ada L. Updated");
    expect(updated.body.bankName).toBe("ICICI Bank");
    expect(updated.body.ifsc).toBe("ICIC0009876");
  });

  it("rejects missing account holder", async () => {
    const body = {
      bankName: DUAL_BODY.bankName,
      accountNumber: DUAL_BODY.accountNumber,
      ifsc: DUAL_BODY.ifsc,
      upiId: DUAL_BODY.upiId,
    };
    const res = await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(body);
    expect(res.status).toBe(400);
  });

  it("rejects missing bank", async () => {
    const body = {
      accountHolderName: DUAL_BODY.accountHolderName,
      accountNumber: DUAL_BODY.accountNumber,
      ifsc: DUAL_BODY.ifsc,
      upiId: DUAL_BODY.upiId,
    };
    const res = await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(body);
    expect(res.status).toBe(400);
  });

  it("rejects missing account number", async () => {
    const body = {
      accountHolderName: DUAL_BODY.accountHolderName,
      bankName: DUAL_BODY.bankName,
      ifsc: DUAL_BODY.ifsc,
      upiId: DUAL_BODY.upiId,
    };
    const res = await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(body);
    expect(res.status).toBe(400);
  });

  it("rejects missing IFSC", async () => {
    const body = {
      accountHolderName: DUAL_BODY.accountHolderName,
      bankName: DUAL_BODY.bankName,
      accountNumber: DUAL_BODY.accountNumber,
      upiId: DUAL_BODY.upiId,
    };
    const res = await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(body);
    expect(res.status).toBe(400);
  });

  it("rejects missing UPI ID", async () => {
    const body = {
      accountHolderName: DUAL_BODY.accountHolderName,
      bankName: DUAL_BODY.bankName,
      accountNumber: DUAL_BODY.accountNumber,
      ifsc: DUAL_BODY.ifsc,
    };
    const res = await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(body);
    expect(res.status).toBe(400);
  });

  it("TEAM_MEMBER cannot access another user's profile", async () => {
    await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(DUAL_BODY);

    await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(otherMember))
      .send(DUAL_BODY);

    const readB = await request(app.getHttpServer())
      .get("/api/v1/team/payout-profile")
      .set(authHeaders(otherMember));
    expect(readB.body.upiId).toBe("ada@okhdfcbank");
    expect(readB.body.accountNumber).toBe("50100123456789");
    expect(readB.body.id).not.toBeUndefined();

    const readA = await request(app.getHttpServer())
      .get("/api/v1/team/payout-profile")
      .set(authHeaders(member));
    expect(readA.body.preferredMethod).toBe(PayoutMethod.BANK_TRANSFER);
    expect(readA.body.accountNumber).toBe("50100123456789");
    expect(readA.body.id).not.toBe(readB.body.id);
  });

  it("cross-organization access fails", async () => {
    const prisma = app.get(PrismaService);
    const otherOrgId = await createSecondOrganization(app);
    const foreignUser = await prisma.user.create({
      data: {
        organization_id: otherOrgId,
        email: `${PAYOUT_TEST_PREFIX}foreign-${Date.now()}@forge.local`,
        name: "Foreign",
        role: UserRole.TEAM_MEMBER,
        password_hash: "unused",
        active: true,
        onboarded_at: new Date(),
      },
    });
    const foreignProfile = await prisma.payoutProfile.create({
      data: {
        organization_id: otherOrgId,
        user_id: foreignUser.id,
        preferred_method: PayoutMethod.UPI,
        upi_id: "foreign@paytm",
      },
    });

    await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(DUAL_BODY);

    const home = await request(app.getHttpServer())
      .get("/api/v1/team/payout-profile")
      .set(authHeaders(member));
    expect(home.body.id).not.toBe(foreignProfile.id);
    expect(home.body.upiId).toBe("ada@okhdfcbank");
    expect(home.body.accountNumber).toBe("50100123456789");

    const leaked = await prisma.payoutProfile.findFirst({
      where: {
        id: foreignProfile.id,
        organization_id: member.organizationId,
      },
    });
    expect(leaked).toBeNull();
  });

  it("duplicate profile cannot be created (PUT is idempotent upsert)", async () => {
    const prisma = app.get(PrismaService);
    const first = await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(DUAL_BODY);
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send({
        ...DUAL_BODY,
        accountHolderName: "Still One Row",
      });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const count = await prisma.payoutProfile.count({
      where: { user_id: member.userId },
    });
    expect(count).toBe(1);
  });

  it("upsert keeps both bank and UPI fields", async () => {
    await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(DUAL_BODY);

    const updated = await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send({
        ...DUAL_BODY,
        upiId: "ada@paytm",
        bankName: "ICICI Bank",
      });
    expect(updated.status).toBe(200);
    expect(updated.body.upiId).toBe("ada@paytm");
    expect(updated.body.bankName).toBe("ICICI Bank");
    expect(updated.body.accountNumber).toBe("50100123456789");
    expect(updated.body.accountHolderName).toBe("Ada Lovelace");
  });

  it("registers UPI QR via R2 flow and never exposes storage keys", async () => {
    await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(DUAL_BODY);

    const presign = await request(app.getHttpServer())
      .post("/api/v1/team/payout-profile/upi-qr/presign-upload")
      .set(authHeaders(member))
      .send({
        filename: "upi-qr.png",
        mimeType: "image/png",
        sizeBytes: 2048,
      });
    expect(presign.status).toBe(201);
    expect(presign.body.storageKey).toMatch(new RegExp(`^${member.organizationId}/`));

    const registered = await request(app.getHttpServer())
      .post("/api/v1/team/payout-profile/upi-qr")
      .set(authHeaders(member))
      .send({
        filename: "upi-qr.png",
        storageKey: presign.body.storageKey,
        mimeType: "image/png",
        sizeBytes: 2048,
      });
    expect(registered.status).toBe(201);
    expect(registered.body.upiQr.uploaded).toBe(true);
    expect(registered.body.upiQr.filename).toBe("upi-qr.png");
    expect(registered.body.upiQrStorageKey).toBeUndefined();
    expect(registered.body.upi_qr_storage_key).toBeUndefined();
    expect(JSON.stringify(registered.body)).not.toContain(presign.body.storageKey);

    const removed = await request(app.getHttpServer())
      .post("/api/v1/team/payout-profile/upi-qr/delete")
      .set(authHeaders(member))
      .send({});
    expect(removed.status).toBe(201);
    expect(removed.body.upiQr.uploaded).toBe(false);
  });

  it("QR register requires an existing payout profile", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/team/payout-profile/upi-qr/presign-upload")
      .set(authHeaders(member))
      .send({
        filename: "upi-qr.png",
        mimeType: "image/png",
        sizeBytes: 2048,
      });
    expect(res.status).toBe(404);
  });

  it("sensitive fields do not appear in audit payloads", async () => {
    const prisma = app.get(PrismaService);
    const created = await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(DUAL_BODY);
    expect(created.status).toBe(200);

    await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(DUAL_BODY);

    const logs = await prisma.auditLog.findMany({
      where: {
        entity_type: "PayoutProfile",
        entity_id: created.body.id,
        action: {
          in: ["payout_profile.created", "payout_profile.updated"],
        },
      },
    });
    expect(logs.length).toBeGreaterThanOrEqual(2);

    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain("50100123456789");
    expect(serialized).not.toContain("HDFC0001234");
    expect(serialized).not.toContain("ada@okhdfcbank");
    expect(serialized).not.toContain("HDFC Bank");
    expect(serialized).not.toMatch(
      /account_number|accountNumber|ifsc|upi_id|upiId|bank_name|bankName/
    );
  });

  it("payout data is not exposed via /auth/me", async () => {
    await request(app.getHttpServer())
      .put("/api/v1/team/payout-profile")
      .set(authHeaders(member))
      .send(DUAL_BODY);

    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set(authHeaders(member));
    expect(me.status).toBe(200);
    const serialized = JSON.stringify(me.body);
    expect(serialized).not.toContain("50100123456789");
    expect(serialized).not.toContain("HDFC0001234");
    expect(serialized).not.toMatch(/payout|accountNumber|upiId/i);
  });
});
