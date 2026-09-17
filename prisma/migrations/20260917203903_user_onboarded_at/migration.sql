-- Additive: first-run onboarding completion timestamp (nullable).
-- Existing users are backfilled so they never see onboarding screens.

ALTER TABLE "users" ADD COLUMN "onboarded_at" TIMESTAMPTZ(6);

UPDATE "users"
SET "onboarded_at" = COALESCE("last_login_at", "created_at")
WHERE "onboarded_at" IS NULL;
