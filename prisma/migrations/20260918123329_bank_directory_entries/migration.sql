-- CreateTable
CREATE TABLE "bank_directory_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bank_name" TEXT NOT NULL,
    "bank_code" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "branch_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "state" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bank_directory_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_directory_entries_ifsc_key" ON "bank_directory_entries"("ifsc");

-- CreateIndex
CREATE INDEX "bank_directory_entries_bank_name_idx" ON "bank_directory_entries"("bank_name");

-- CreateIndex
CREATE INDEX "bank_directory_entries_bank_code_idx" ON "bank_directory_entries"("bank_code");
