-- K8 hardening: prevent concurrent registration of the same R2 object
-- onto multiple KycDocument rows. Additive unique constraint.
DROP INDEX IF EXISTS "kyc_documents_storage_key_idx";

CREATE UNIQUE INDEX "kyc_documents_storage_key_key" ON "kyc_documents"("storage_key");
