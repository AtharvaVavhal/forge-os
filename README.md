# FORGE Business OS

Greenfield backend foundation for **FORGE Business OS** (NestJS + PostgreSQL + Prisma).

This is **not** the marketing website at `/Users/atharva/Forge`. Do not merge Prisma/Nest into that repo.

## Source of truth

- Architecture / Red-Team Review (Document 1)
- Database Specification — Frozen Architecture v1 (Document 2)
- Frozen conflict resolutions:
  1. Invoice / Payment — no soft-delete (`VOID` / `CANCELLED` / `REVERSED`)
  2. Project — no `archived_at` / `deleted_at` (status lifecycle only)
  3. `CreditNoteSequence` — separate FY counter from `InvoiceSequence`

## Document 3 artifacts

| Path | Purpose |
| --- | --- |
| `prisma/schema.prisma` | Production Prisma schema |
| `prisma/sql/001_check_constraints.sql` | Polymorphic exactly-one-parent + `paid_amount <= amount` |
| `prisma/sql/002_audit_log_revoke.sql` | `REVOKE UPDATE, DELETE` on `audit_logs` |
| `prisma/sql/003_partial_uniques.sql` | Forge Fund + Contact email partial uniques |
| `prisma/sql/004_fts_gin_indexes.sql` | GIN full-text indexes |
| `prisma/seed.ts` | Doc 2 §D seed strategy (`SEED_DEMO=1` for local CRM only) |

## Setup

```bash
cp .env.example .env
# set DATABASE_URL to a dedicated Business OS Postgres database (NOT marketing Supabase)

npm install
npm run db:setup   # migrate deploy + baseline seed
```

Full guide: [`docs/FORGE-BUSINESS-OS-DATABASE-MIGRATION.md`](docs/FORGE-BUSINESS-OS-DATABASE-MIGRATION.md)

Custom SQL `001`–`004` is **embedded** in the init migration (reproducible). Files under `prisma/sql/` remain the readable source references.

## Out of scope here

NestJS modules, Razorpay handlers, portal auth, and UI — later phases.
