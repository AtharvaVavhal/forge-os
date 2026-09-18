-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KycGovernmentIdType" AS ENUM ('AADHAAR', 'PASSPORT', 'DRIVING_LICENCE', 'VOTER_ID', 'OTHER');

-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('PAN_CARD', 'GOVERNMENT_ID');

-- CreateEnum
CREATE TYPE "KycDocumentStatus" AS ENUM ('UPLOADED', 'REMOVED');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('BANK_TRANSFER', 'UPI');

-- CreateTable
CREATE TABLE "kyc_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "legal_name" TEXT,
    "date_of_birth" DATE,
    "mobile" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "pan" TEXT,
    "government_id_type" "KycGovernmentIdType",
    "government_id_number" TEXT,
    "status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "submitted_at" TIMESTAMPTZ(6),
    "verified_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kyc_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kyc_profile_id" UUID NOT NULL,
    "document_type" "KycDocumentType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" "KycDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "preferred_method" "PayoutMethod",
    "account_holder_name" TEXT,
    "bank_name" TEXT,
    "account_number" TEXT,
    "ifsc" TEXT,
    "upi_id" TEXT,
    "upi_qr_storage_key" TEXT,
    "upi_qr_filename" TEXT,
    "upi_qr_mime_type" TEXT,
    "upi_qr_size_bytes" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payout_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kyc_profiles_user_id_key" ON "kyc_profiles"("user_id");

-- CreateIndex
CREATE INDEX "kyc_profiles_organization_id_idx" ON "kyc_profiles"("organization_id");

-- CreateIndex
CREATE INDEX "kyc_profiles_organization_id_status_idx" ON "kyc_profiles"("organization_id", "status");

-- CreateIndex
CREATE INDEX "kyc_documents_organization_id_idx" ON "kyc_documents"("organization_id");

-- CreateIndex
CREATE INDEX "kyc_documents_kyc_profile_id_idx" ON "kyc_documents"("kyc_profile_id");

-- CreateIndex
CREATE INDEX "kyc_documents_kyc_profile_id_document_type_idx" ON "kyc_documents"("kyc_profile_id", "document_type");

-- CreateIndex
CREATE INDEX "kyc_documents_storage_key_idx" ON "kyc_documents"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "payout_profiles_user_id_key" ON "payout_profiles"("user_id");

-- CreateIndex
CREATE INDEX "payout_profiles_organization_id_idx" ON "payout_profiles"("organization_id");

-- AddForeignKey
ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_kyc_profile_id_fkey" FOREIGN KEY ("kyc_profile_id") REFERENCES "kyc_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_profiles" ADD CONSTRAINT "payout_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_profiles" ADD CONSTRAINT "payout_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
