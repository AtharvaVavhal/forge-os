# Custom SQL reference (Document 2 §C items 19–20 + indexes)

These files are the readable source for constraints Prisma cannot express.

**They are already embedded** (in order 001 → 004) in:

`prisma/migrations/20260917095408_init_business_os_schema/migration.sql`

Normal setup uses `prisma migrate deploy` / `migrate dev` only — do not hand-apply these on a database that already ran the init migration.

| Order | File |
| --- | --- |
| 001 | CHECK constraints (polymorphic parents + paid_amount) |
| 002 | AuditLog REVOKE UPDATE/DELETE for `forge_app` |
| 003 | Partial unique indexes (Forge Fund, Contact email) |
| 004 | GIN full-text indexes |
