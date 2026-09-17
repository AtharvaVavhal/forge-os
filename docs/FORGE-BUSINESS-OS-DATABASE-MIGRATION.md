# FORGE Business OS — Database Migration Guide

Document 4. Source of truth: frozen Architecture + Database Specification + Production Prisma Schema.

This guide is for the **Business OS** database only.  
Do **not** point these commands at the Forge marketing-site Supabase project.

---

## Prerequisites

- PostgreSQL 14+ (tested on PostgreSQL 18 / Homebrew)
- Node.js 20+
- Repository: `/Users/atharva/forge-business-os` (or your clone of this greenfield backend)
- A **dedicated** empty database (e.g. `forge_business_os`)

```bash
cd /Users/atharva/forge-business-os
cp .env.example .env
# Edit DATABASE_URL — see below
npm install
```

---

## DATABASE_URL requirements

| Requirement | Rule |
| --- | --- |
| Dedicated DB | Separate database name for Business OS (e.g. `forge_business_os`) |
| Not marketing | Must **not** be the Forge marketing Supabase / `contact_submissions` database |
| Provider | PostgreSQL |
| Schema | `public` (default) |

Example (local):

```bash
DATABASE_URL="postgresql://USER@localhost:5432/forge_business_os?schema=public"
APP_DB_ROLE="forge_app"
```

Safe checks before migrating:

```bash
# Print host + database only (do not log passwords)
node -e "const u=new URL(process.env.DATABASE_URL); console.log(u.hostname, u.pathname)"
```

Stop if the host is a marketing Supabase project or the database is shared with the website.

---

## Exact migration order

1. Create empty PostgreSQL database.
2. Set `DATABASE_URL` in `.env`.
3. `npx prisma migrate deploy` (CI/prod) **or** `npx prisma migrate dev` (local first-time).
4. The single init migration applies:
   - Full Prisma schema (enums, tables, FKs, indexes)
   - Custom SQL **001 → 004** (embedded in `migration.sql`)
   - `forge_app` role bootstrap + AuditLog `REVOKE UPDATE, DELETE`
5. `npm run db:seed` (baseline only).
6. Optional: `SEED_DEMO=1 npm run db:seed` for local CRM demo rows only.

---

## Migration command

### Local development (first machine)

```bash
npx prisma migrate dev
```

### CI / staging / production / any fresh clone

```bash
npx prisma migrate deploy
```

Do **not** use `prisma db push` as a substitute for migrations.

### Migration artifact

```
prisma/migrations/20260917095408_init_business_os_schema/migration.sql
```

This file includes the generated schema **plus** the mandatory custom SQL (see below).

---

## Custom SQL handling

Source reference files (kept for readability / audits):

| Order | File | Purpose |
| --- | --- | --- |
| 001 | `prisma/sql/001_check_constraints.sql` | Polymorphic exactly-one-parent CHECKs + `paid_amount <= amount` |
| 002 | `prisma/sql/002_audit_log_revoke.sql` | AuditLog immutability for `forge_app` |
| 003 | `prisma/sql/003_partial_uniques.sql` | Forge Fund + Contact email partial uniques |
| 004 | `prisma/sql/004_fts_gin_indexes.sql` | GIN full-text indexes |

**These are already embedded** in the init migration in order `001 → 002 → 003 → 004`.  
A fresh `migrate deploy` applies them automatically. Do not rely on running the `prisma/sql/*.sql` files by hand for a normal setup.

The migration also:

- Ensures role `forge_app` exists
- Grants DML on tables to `forge_app`
- Revokes `UPDATE`/`DELETE` on `audit_logs` from `forge_app`
- Re-grants `SELECT`/`INSERT` on `audit_logs` (append-only)

---

## Seed command

```bash
npm run db:seed
```

Baseline creates:

1. One `Organization` (FORGE)
2. `InvoiceSequence` + `CreditNoteSequence` for the current Indian FY (`last_number = 0`)
3. One TaxRate placeholder (`998314` — **verify with accountant before production**)
4. Five users (one per `UserRole`) with `@forge.local` emails

Baseline does **not** create invoices, payments, expenses, or Forge Fund rows.

### Re-run safety

Baseline seed uses upserts / existence checks and is safe to re-run.

### SEED_DEMO behavior

```bash
SEED_DEMO=1 npm run db:seed
```

Creates sample Company + Contact for UI work.

**Known observation (unchanged):** `SEED_DEMO=1` is **not** idempotent — each run inserts another Company/Contact pair. Do not use against production. Never combine demo seeding with real FY financial data.

---

## Database verification commands

```bash
# Tables
psql "$DATABASE_URL" -c "\dt"

# CHECK constraints
psql "$DATABASE_URL" -c "SELECT conname FROM pg_constraint WHERE contype='c' AND conname LIKE '%exactly_one%' OR conname LIKE '%paid_amount_lte%';"

# Partial uniques + GIN
psql "$DATABASE_URL" -c "SELECT indexname FROM pg_indexes WHERE indexname LIKE '%auto_source%' OR indexname LIKE '%org_company_email%' OR indexname LIKE '%_fts_%';"

# AuditLog privileges for app role
psql "$DATABASE_URL" -c "SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='audit_logs' AND grantee='forge_app';"

# Sequences
psql "$DATABASE_URL" -c "SELECT * FROM invoice_sequences; SELECT * FROM credit_note_sequences;"
```

Critical constraint smoke tests (expect failures on illegal rows):

1. `paid_amount > amount` → CHECK fail  
2. Activity / Note / Document with 0 or 2+ parents → CHECK fail  
3. Duplicate Forge Fund automatic `(org, source_type, source_id, type)` → unique fail  
4. Duplicate Contact `(org, company, email)` when email set → unique fail  
5. `SET ROLE forge_app; UPDATE/DELETE audit_logs` → permission denied  

Notification has **no** polymorphic exactly-one-parent CHECK (not specified in Database Specification).

---

## Clean-database reproducibility

Any developer should be able to:

```text
Fresh PostgreSQL database
        ↓
cp .env.example .env   # set DATABASE_URL
npm install
npx prisma migrate deploy
npm run db:seed
        ↓
Valid Business OS database
```

Verified pattern:

```bash
createdb forge_business_os   # or CREATE DATABASE
export DATABASE_URL="postgresql://USER@localhost:5432/forge_business_os?schema=public"
npx prisma migrate deploy
npm run db:seed
```

---

## Rollback / recovery notes

- **Dev:** `prisma migrate reset` drops and re-applies all migrations, then re-seeds (destructive).
- **Prod:** Do not reset. Restore from PostgreSQL backup / PITR, then re-point `DATABASE_URL` if needed.
- Init migration is foundational — avoid editing applied migration history on shared environments. Prefer a new forward migration for later changes.
- Custom SQL is part of the init migration; changing CHECKs later requires a new migration, not editing `prisma/sql/*` alone.

---

## Production migration precautions

1. Confirm `DATABASE_URL` is the dedicated Business OS database (not marketing Supabase).
2. Take a backup / confirm PITR before `migrate deploy`.
3. Run `migrate deploy` (not `migrate dev`).
4. Run baseline seed **once** on a new environment; do not run `SEED_DEMO=1` in production.
5. Replace TaxRate placeholder HSN/SAC and org GSTIN with accountant-verified values before issuing real invoices.
6. Replace `@forge.local` user emails and set real password hashes / SSO before go-live.
7. Rotate `forge_app` password; provision the role via your secret manager (migration creates a local-dev password only if the role is missing).
8. Confirm `audit_logs` grants: app role has `SELECT`/`INSERT` only.

---

## What this document does not cover

- NestJS modules / API implementation (later documents)
- Razorpay webhooks, portal auth, or application middleware
- Marketing website (`/Users/atharva/Forge`)
