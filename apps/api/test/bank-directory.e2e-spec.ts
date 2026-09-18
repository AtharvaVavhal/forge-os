import type { INestApplication } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { PrismaService } from "../src/database/prisma.service";
import { authHeaders, loginSession, type AuthSession } from "./support/team-shared";

/**
 * K10 e2e — deliberately seeds its own fixtures (a small, fixed set of
 * `TEST0000nnn` IFSCs) rather than depending on the real imported dataset,
 * so this suite passes in any environment regardless of whether
 * `db:import-bank-directory` has been run against it.
 */
const TEST_BANK_CODE = "TEST";
const FIXTURES = [
  {
    bank_name: "K10 TEST BANK ONE",
    bank_code: TEST_BANK_CODE,
    ifsc: "TEST0000001",
    branch_name: "Main Branch",
    address: "1 Test Street",
    city: "Testville",
    district: "Test District",
    state: "Test State",
  },
  {
    bank_name: "K10 TEST BANK ONE",
    bank_code: TEST_BANK_CODE,
    ifsc: "TEST0000002",
    branch_name: "Second Branch",
    address: "2 Test Street",
    city: "Testville",
    district: "Test District",
    state: "Test State",
  },
  {
    bank_name: "K10 TEST BANK TWO",
    bank_code: "TSTB",
    ifsc: "TSTB0000001",
    branch_name: "Main Branch",
    address: "1 Other Street",
    city: "Otherville",
    district: null,
    state: "Other State",
  },
];

async function seedFixtures(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  for (const fixture of FIXTURES) {
    await prisma.bankDirectoryEntry.upsert({
      where: { ifsc: fixture.ifsc },
      create: fixture,
      update: fixture,
    });
  }
}

async function cleanupFixtures(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.bankDirectoryEntry.deleteMany({
    where: { ifsc: { in: FIXTURES.map((f) => f.ifsc) } },
  });
}

describe("K10: Bank & IFSC Directory (e2e)", () => {
  let app: INestApplication;
  let member: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
    await seedFixtures(app);
    member = await loginSession(app, UserRole.TEAM_MEMBER, { emailSuffix: "k10-banks" });
  });

  afterAll(async () => {
    await cleanupFixtures(app);
    await app.close();
  });

  describe("GET /banks/search", () => {
    it("requires authentication", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/banks/search?q=test");
      expect(res.status).toBe(401);
    });

    it("rejects a query shorter than 2 characters", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/banks/search?q=t")
        .set(authHeaders(member));
      expect(res.status).toBe(400);
    });

    it("rejects a missing query", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/banks/search")
        .set(authHeaders(member));
      expect(res.status).toBe(400);
    });

    it("is case-insensitive and matches a substring", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/banks/search?q=test bank")
        .set(authHeaders(member));
      expect(res.status).toBe(200);
      const names = res.body.banks.map((b: { bankName: string }) => b.bankName);
      expect(names).toContain("K10 TEST BANK ONE");
      expect(names).toContain("K10 TEST BANK TWO");

      const lower = await request(app.getHttpServer())
        .get("/api/v1/banks/search?q=test bank one")
        .set(authHeaders(member));
      expect(lower.body.banks.map((b: { bankName: string }) => b.bankName)).toEqual([
        "K10 TEST BANK ONE",
      ]);
    });

    it("normalizes repeated internal whitespace", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/banks/search?q=test    bank")
        .set(authHeaders(member));
      expect(res.status).toBe(200);
      expect(res.body.query).toBe("test bank");
    });

    it("returns a unique bank list — multiple branches collapse to one row", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/banks/search?q=K10 TEST BANK ONE")
        .set(authHeaders(member));
      expect(res.status).toBe(200);
      expect(res.body.banks).toHaveLength(1);
      expect(res.body.banks[0]).toEqual({
        id: TEST_BANK_CODE,
        bankName: "K10 TEST BANK ONE",
        bankCode: TEST_BANK_CODE,
      });
      // Never leaks branch-level fields.
      expect(res.body.banks[0].ifsc).toBeUndefined();
      expect(res.body.banks[0].branchName).toBeUndefined();
    });

    it("returns no results for an unmatched query", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/banks/search?q=zzzznonexistentbankzzzz")
        .set(authHeaders(member));
      expect(res.status).toBe(200);
      expect(res.body.banks).toEqual([]);
    });

    it("handles special characters safely without erroring", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/banks/search?q=" + encodeURIComponent("100%_'; DROP TABLE users; --"))
        .set(authHeaders(member));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.banks)).toBe(true);
    });

    it("orders results deterministically across repeated calls", async () => {
      const first = await request(app.getHttpServer())
        .get("/api/v1/banks/search?q=K10 TEST")
        .set(authHeaders(member));
      const second = await request(app.getHttpServer())
        .get("/api/v1/banks/search?q=K10 TEST")
        .set(authHeaders(member));
      expect(first.body.banks).toEqual(second.body.banks);
    });
  });

  describe("GET /banks/ifsc/:ifsc", () => {
    it("requires authentication", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/banks/ifsc/TEST0000001");
      expect(res.status).toBe(401);
    });

    it("resolves a valid, existing IFSC with safe metadata only", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/banks/ifsc/TEST0000001")
        .set(authHeaders(member));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ifsc: "TEST0000001",
        bankName: "K10 TEST BANK ONE",
        bankCode: TEST_BANK_CODE,
        branchName: "Main Branch",
        address: "1 Test Street",
        city: "Testville",
        district: "Test District",
        state: "Test State",
      });
    });

    it("normalizes lowercase and whitespace before lookup", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/banks/ifsc/" + encodeURIComponent(" test0000001 "))
        .set(authHeaders(member));
      expect(res.status).toBe(200);
      expect(res.body.ifsc).toBe("TEST0000001");
    });

    it("returns 400 for a malformed IFSC (not a directory miss)", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/banks/ifsc/NOTAREALIFSC")
        .set(authHeaders(member));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_IFSC_FORMAT");
    });

    it("returns 404 for a well-formed but unknown IFSC", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/banks/ifsc/ZZZZ0999999")
        .set(authHeaders(member));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("IFSC_NOT_FOUND");
    });

    it("never leaks internal database details on error", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/banks/ifsc/ZZZZ0999999")
        .set(authHeaders(member));
      const serialized = JSON.stringify(res.body);
      expect(serialized.toLowerCase()).not.toMatch(/prisma|postgres|stack|sql/);
    });
  });
});
