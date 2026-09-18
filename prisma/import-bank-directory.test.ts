import { describe, expect, it, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildBatchUpsertSql, chunk, dedupe, type NormalizedRecord } from "./import-bank-directory";

function record(overrides: Partial<NormalizedRecord> = {}): NormalizedRecord {
  return {
    bank_name: "TEST BANK",
    bank_code: "TEST",
    ifsc: "TEST0000001",
    branch_name: "Main Branch",
    address: "1 Test Street",
    city: "Testville",
    district: "Test District",
    state: "Test State",
    ...overrides,
  };
}

describe("dedupe", () => {
  it("keeps every record when IFSCs are unique", () => {
    const a = record({ ifsc: "AAAA0000001" });
    const b = record({ ifsc: "BBBB0000001" });
    const { deduped, skippedDuplicates } = dedupe([a, b]);
    expect(deduped).toEqual([a, b]);
    expect(skippedDuplicates).toBe(0);
  });

  it("handles a duplicate IFSC by keeping only the last occurrence and counting the rest as skipped", () => {
    const first = record({ ifsc: "DUPL0000001", branch_name: "Old Branch" });
    const second = record({ ifsc: "DUPL0000001", branch_name: "New Branch" });
    const { deduped, skippedDuplicates } = dedupe([first, second]);
    expect(deduped).toEqual([second]);
    expect(skippedDuplicates).toBe(1);
  });

  it("counts every repeat beyond the first for a repeated IFSC", () => {
    const ifsc = "TRIP0000001";
    const { deduped, skippedDuplicates } = dedupe([
      record({ ifsc, branch_name: "v1" }),
      record({ ifsc, branch_name: "v2" }),
      record({ ifsc, branch_name: "v3" }),
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].branch_name).toBe("v3");
    expect(skippedDuplicates).toBe(2);
  });
});

describe("chunk", () => {
  it("splits records into batches no larger than the given size", () => {
    const items = Array.from({ length: 2501 }, (_, i) => i);
    const batches = chunk(items, 1000);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(1000);
    expect(batches[1]).toHaveLength(1000);
    expect(batches[2]).toHaveLength(501);
    expect(batches.flat()).toEqual(items);
  });

  it("returns no batches for an empty input", () => {
    expect(chunk([], 1000)).toEqual([]);
  });
});

describe("buildBatchUpsertSql", () => {
  it("builds a single INSERT ... ON CONFLICT (ifsc) DO UPDATE statement for the whole batch", () => {
    const batch = [record({ ifsc: "AAAA0000001" }), record({ ifsc: "BBBB0000001" })];
    const sql = buildBatchUpsertSql(batch);

    expect(sql.text).toContain("INSERT INTO bank_directory_entries");
    expect(sql.text).toContain(
      "(ifsc, bank_name, bank_code, branch_name, address, city, district, state, updated_at)"
    );
    expect(sql.text).toContain("ON CONFLICT (ifsc) DO UPDATE SET");
    // Idempotency key: ifsc itself is never reassigned in the DO UPDATE SET list.
    expect(sql.text).not.toMatch(/ifsc\s*=\s*EXCLUDED\.ifsc/);
    // id/created_at are left untouched on conflict (preserve original row identity/creation time).
    expect(sql.text).not.toContain("id =");
    expect(sql.text).not.toContain("created_at =");
  });

  it("parameterizes every value instead of interpolating it into the SQL text", () => {
    const dangerous = record({
      ifsc: "AAAA0000001",
      bank_name: "Robert'); DROP TABLE bank_directory_entries; --",
    });
    const sql = buildBatchUpsertSql([dangerous]);

    // The raw value never appears embedded in the SQL text itself...
    expect(sql.text).not.toContain("DROP TABLE");
    // ...it's carried as a bound parameter instead.
    expect(sql.values).toContain("Robert'); DROP TABLE bank_directory_entries; --");
  });

  it("passes exactly one parameter set per record, in column order", () => {
    const a = record({ ifsc: "AAAA0000001", bank_name: "Bank A", district: null });
    const b = record({ ifsc: "BBBB0000001", bank_name: "Bank B" });
    const sql = buildBatchUpsertSql([a, b]);

    expect(sql.values).toEqual([
      a.ifsc,
      a.bank_name,
      a.bank_code,
      a.branch_name,
      a.address,
      a.city,
      a.district,
      a.state,
      b.ifsc,
      b.bank_name,
      b.bank_code,
      b.branch_name,
      b.address,
      b.city,
      b.district,
      b.state,
    ]);
  });

  it("stays well within PostgreSQL's parameter limit at the chosen batch size (1000 records/batch)", () => {
    const batch = Array.from({ length: 1000 }, (_, i) =>
      record({ ifsc: `AAAA000${String(i).padStart(4, "0")}` })
    );
    const sql = buildBatchUpsertSql(batch);
    // 8 bound values per row (ifsc..state); `now()` is a literal, not a parameter.
    expect(sql.values).toHaveLength(8000);
    expect(sql.values.length).toBeLessThan(65535);
  });
});

// Exercises buildBatchUpsertSql against a real database when one is
// configured, mirroring apps/api/test/bank-directory.e2e-spec.ts's
// TEST-prefixed-fixture + cleanup convention. Skipped (not failed) when no
// DATABASE_URL is available, so this file stays runnable in environments
// without a live Postgres instance.
const IMPORT_TEST_IFSCS = ["IMPT0009001", "IMPT0009002"];
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

describeIfDb("upsertBatch (live database)", () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.bankDirectoryEntry.deleteMany({ where: { ifsc: { in: IMPORT_TEST_IFSCS } } });
    await prisma.$disconnect();
  });

  it("inserts a new IFSC that does not exist yet", async () => {
    const ifsc = IMPORT_TEST_IFSCS[0];
    await prisma.bankDirectoryEntry.deleteMany({ where: { ifsc } });

    await prisma.$executeRaw(buildBatchUpsertSql([record({ ifsc, branch_name: "First Insert" })]));

    const row = await prisma.bankDirectoryEntry.findUnique({ where: { ifsc } });
    expect(row?.branch_name).toBe("First Insert");
  });

  it("updates an existing IFSC in place rather than creating a duplicate row", async () => {
    const ifsc = IMPORT_TEST_IFSCS[1];
    await prisma.bankDirectoryEntry.deleteMany({ where: { ifsc } });

    await prisma.$executeRaw(buildBatchUpsertSql([record({ ifsc, branch_name: "Before" })]));
    const created = await prisma.bankDirectoryEntry.findUniqueOrThrow({ where: { ifsc } });

    await prisma.$executeRaw(
      buildBatchUpsertSql([record({ ifsc, branch_name: "After", city: "New City" })])
    );

    const rows = await prisma.bankDirectoryEntry.findMany({ where: { ifsc } });
    expect(rows).toHaveLength(1); // no duplicate row
    expect(rows[0].id).toBe(created.id); // same row, updated in place
    expect(rows[0].branch_name).toBe("After");
    expect(rows[0].city).toBe("New City");
    expect(rows[0].created_at).toEqual(created.created_at); // creation time preserved
    expect(rows[0].updated_at.getTime()).toBeGreaterThanOrEqual(created.updated_at.getTime());
  });

  it("re-running the same batch is idempotent — no duplicate rows, same data", async () => {
    const ifsc = IMPORT_TEST_IFSCS[0];
    const batch = [record({ ifsc, branch_name: "Rerun Branch" })];

    await prisma.$executeRaw(buildBatchUpsertSql(batch));
    await prisma.$executeRaw(buildBatchUpsertSql(batch));

    const rows = await prisma.bankDirectoryEntry.findMany({ where: { ifsc } });
    expect(rows).toHaveLength(1);
    expect(rows[0].branch_name).toBe("Rerun Branch");
  });
});
