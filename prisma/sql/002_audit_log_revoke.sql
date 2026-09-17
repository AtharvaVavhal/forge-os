-- Applied after app DB role exists.
-- AuditLog immutability at the PostgreSQL role level (Doc 2 §14 / §I).
-- Replace forge_app with APP_DB_ROLE from environment if different.

REVOKE UPDATE, DELETE ON TABLE audit_logs FROM forge_app;
