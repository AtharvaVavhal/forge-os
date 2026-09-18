-- FORGE Business OS — F10.1: close the production credential blocker found
-- by the F10 backend deployment audit.
--
-- The init migration (20260917095408_init_business_os_schema) bootstraps
-- the `forge_app` application role with a hardcoded, git-committed password
-- (`forge_app_local_dev_only`) whenever the role does not already exist.
-- That statement is intentionally left untouched here — it is applied
-- migration history, and Document 4's own guidance is to prefer a new
-- forward migration over editing it (checksum drift would break `prisma
-- migrate deploy`/`migrate dev` on any environment that already ran it).
--
-- Instead, this migration runs immediately after bootstrap and unconditionally
-- clears `forge_app`'s password. This is safe regardless of how the role came
-- to exist:
--   - If it was just created by the init migration's fallback, this removes
--     the known/committed password before the deploy completes.
--   - If it was pre-provisioned by an operator via a secrets manager, this
--     still clears it — which only means the operator must (re)confirm the
--     real password afterward, exactly as already required below.
--
-- No table/sequence GRANTs and no part of the audit_logs REVOKE UPDATE,
-- DELETE restriction (Document 2 §14 / §I) are touched — only the login
-- password verifier is cleared. Password-based authentication as forge_app
-- will fail (fail-closed) until an operator explicitly sets a real password:
--   ALTER ROLE forge_app PASSWORD '<generated-by-secrets-manager>';
-- This was already the documented production requirement (Document 4,
-- "Production migration precautions" item 7); this migration makes it
-- mandatory instead of an easy-to-skip manual step.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'forge_app') THEN
    ALTER ROLE forge_app PASSWORD NULL;
  END IF;
END$$;
