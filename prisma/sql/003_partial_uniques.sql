-- Partial unique indexes Prisma cannot express in schema DSL (Doc 2).

-- Forge Fund: prevent double automatic contribution from the same payment.
-- Manual entries keep source_id NULL and are unconstrained by this index.
CREATE UNIQUE INDEX forge_fund_entries_auto_source_uidx
  ON forge_fund_entries (organization_id, source_type, source_id, type)
  WHERE source_id IS NOT NULL;

-- Contact email uniqueness when email is set (scoped to org + company).
CREATE UNIQUE INDEX contacts_org_company_email_uidx
  ON contacts (organization_id, company_id, email)
  WHERE email IS NOT NULL;

-- Payment.razorpay_payment_id and Refund.razorpay_refund_id uniqueness for
-- non-null gateway IDs is declared in schema.prisma as
-- @@unique([organization_id, razorpay_*]). PostgreSQL UNIQUE allows multiple
-- NULLs (offline methods), which matches the Database Specification.
