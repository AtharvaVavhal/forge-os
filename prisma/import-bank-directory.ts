/**
 * K10 — Bank & IFSC directory import (Doc: implementation spec §5).
 *
 * A standalone, manually-run, idempotent import. NOT invoked at app
 * startup, build, or `db:setup` — the source Excel file is never required
 * at runtime. Re-running against a refreshed source file is safe: rows are
 * upserted by their normalized IFSC (the table's unique key).
 *
 * Usage:
 *   npm run db:import-bank-directory -- --source=/path/to/directory.xlsx
 *   (or set BANK_DIRECTORY_SOURCE_XLSX instead of --source)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const BATCH_SIZE = 1000;

interface SourceRow {
  BANK?: unknown;
  IFSC?: unknown;
  BRANCH?: unknown;
  ADDRESS?: unknown;
  CITY1?: unknown;
  CITY2?: unknown;
  STATE?: unknown;
}

export interface NormalizedRecord {
  bank_name: string;
  bank_code: string;
  ifsc: string;
  branch_name: string;
  address: string;
  city: string;
  district: string | null;
  state: string;
}

interface RejectedRow {
  sheet: string;
  rowNumber: number;
  reason: string;
  raw: SourceRow;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function asCleanString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const collapsed = collapseWhitespace(String(value));
  return collapsed.length > 0 ? collapsed : null;
}

function parseArgs(argv: string[]): { source: string } {
  const sourceArg = argv.find((arg) => arg.startsWith("--source="));
  const source = sourceArg?.slice("--source=".length) ?? process.env.BANK_DIRECTORY_SOURCE_XLSX;
  if (!source) {
    throw new Error(
      "Missing source file. Pass --source=/path/to/directory.xlsx or set BANK_DIRECTORY_SOURCE_XLSX."
    );
  }
  return { source: resolve(source) };
}

/** Reads every sheet, normalizes + validates rows. Never throws on a bad row — it rejects it. */
function extractRecords(workbook: XLSX.WorkBook): {
  records: NormalizedRecord[];
  rejected: RejectedRow[];
  totalSourceRows: number;
} {
  const records: NormalizedRecord[] = [];
  const rejected: RejectedRow[] = [];
  let totalSourceRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<SourceRow>(sheet, { defval: null });

    rows.forEach((row, index) => {
      totalSourceRows += 1;
      const rowNumber = index + 2; // +1 header row, +1 for 1-based row numbers

      const bankName = asCleanString(row.BANK);
      const branchName = asCleanString(row.BRANCH);
      const address = asCleanString(row.ADDRESS);
      const city = asCleanString(row.CITY1);
      const district = asCleanString(row.CITY2);
      const state = asCleanString(row.STATE);
      const rawIfsc = asCleanString(row.IFSC);

      if (!bankName || !rawIfsc || !branchName || !address || !city || !state) {
        rejected.push({
          sheet: sheetName,
          rowNumber,
          reason: "Missing required field (bank, ifsc, branch, address, city, or state).",
          raw: row,
        });
        return;
      }

      const ifsc = rawIfsc.toUpperCase();
      if (!IFSC_PATTERN.test(ifsc)) {
        rejected.push({
          sheet: sheetName,
          rowNumber,
          reason: `Malformed IFSC "${rawIfsc}".`,
          raw: row,
        });
        return;
      }

      records.push({
        bank_name: bankName,
        bank_code: ifsc.slice(0, 4),
        ifsc,
        branch_name: branchName,
        address,
        city,
        district,
        state,
      });
    });
  }

  return { records, rejected, totalSourceRows };
}

/** Dedupes by normalized IFSC, keeping the last occurrence — reports the rest as skipped. */
export function dedupe(records: NormalizedRecord[]): {
  deduped: NormalizedRecord[];
  skippedDuplicates: number;
} {
  const byIfsc = new Map<string, NormalizedRecord>();
  let skippedDuplicates = 0;
  for (const record of records) {
    if (byIfsc.has(record.ifsc)) skippedDuplicates += 1;
    byIfsc.set(record.ifsc, record);
  }
  return { deduped: [...byIfsc.values()], skippedDuplicates };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Builds one parameterized `INSERT ... ON CONFLICT (ifsc) DO UPDATE`
 * statement for a batch (values passed as query parameters via
 * `Prisma.sql`/`Prisma.join`, never string-interpolated) — a pure function
 * so the generated SQL/params can be asserted on directly in tests without a
 * database. `id` and `created_at` are left to their column defaults on
 * insert and are untouched on conflict, matching the row's original create
 * time. `ifsc` is the sole conflict/idempotency key, so re-running the same
 * source file always converges to the same rows regardless of how a prior
 * run ended.
 */
export function buildBatchUpsertSql(batch: NormalizedRecord[]): Prisma.Sql {
  const rows = Prisma.join(
    batch.map(
      (record) =>
        Prisma.sql`(${record.ifsc}, ${record.bank_name}, ${record.bank_code}, ${record.branch_name}, ${record.address}, ${record.city}, ${record.district}, ${record.state}, now())`
    )
  );

  return Prisma.sql`
    INSERT INTO bank_directory_entries
      (ifsc, bank_name, bank_code, branch_name, address, city, district, state, updated_at)
    VALUES ${rows}
    ON CONFLICT (ifsc) DO UPDATE SET
      bank_name   = EXCLUDED.bank_name,
      bank_code   = EXCLUDED.bank_code,
      branch_name = EXCLUDED.branch_name,
      address     = EXCLUDED.address,
      city        = EXCLUDED.city,
      district    = EXCLUDED.district,
      state       = EXCLUDED.state,
      updated_at  = EXCLUDED.updated_at
  `;
}

/**
 * Replaces what used to be one Prisma `upsert()` call per record — at
 * ~183k records, a round-trip per row against remote Render PostgreSQL
 * dominated the runtime; this does the same conflict resolution in one
 * statement per batch instead.
 */
async function upsertBatch(prisma: PrismaClient, batch: NormalizedRecord[]): Promise<void> {
  await prisma.$executeRaw(buildBatchUpsertSql(batch));
}

async function main(): Promise<void> {
  const { source } = parseArgs(process.argv.slice(2));
  console.log(`Reading ${source} ...`);
  const workbook = XLSX.read(readFileSync(source), { type: "buffer" });

  const { records, rejected, totalSourceRows } = extractRecords(workbook);
  const { deduped, skippedDuplicates } = dedupe(records);

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.bankDirectoryEntry.findMany({ select: { ifsc: true } });
    const existingIfscs = new Set(existing.map((row) => row.ifsc));

    let imported = 0;
    let updated = 0;

    const batches = chunk(deduped, BATCH_SIZE);
    for (const [index, batch] of batches.entries()) {
      console.log(
        `Importing batch ${index + 1}/${batches.length} (${batch.length} records, ` +
          `${Math.round(((index + 1) / batches.length) * 100)}%)...`
      );
      await upsertBatch(prisma, batch);
      for (const record of batch) {
        if (existingIfscs.has(record.ifsc)) updated += 1;
        else imported += 1;
      }
    }

    console.log("\n=== Bank directory import summary ===");
    console.log(`Total source rows: ${totalSourceRows}`);
    console.log(`Imported (new):    ${imported}`);
    console.log(`Updated (existing):${updated}`);
    console.log(`Skipped duplicates:${skippedDuplicates}`);
    console.log(`Rejected:          ${rejected.length}`);

    if (rejected.length > 0) {
      console.log("\n--- Rejected rows (first 20) ---");
      for (const row of rejected.slice(0, 20)) {
        console.log(`[${row.sheet} row ${row.rowNumber}] ${row.reason}`, row.raw);
      }
      if (rejected.length > 20) {
        console.log(`... and ${rejected.length - 20} more.`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when executed directly (`tsx prisma/import-bank-directory.ts`),
// not when imported by tests for its pure helpers.
if (require.main === module) {
  main().catch((error) => {
    console.error("Bank directory import failed:", error);
    process.exitCode = 1;
  });
}
