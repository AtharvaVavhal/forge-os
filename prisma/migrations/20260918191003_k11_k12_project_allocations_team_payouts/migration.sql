-- CreateEnum
CREATE TYPE "ProjectAllocationStatus" AS ENUM ('DRAFT', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TeamPayoutStatus" AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "project_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" "ProjectAllocationStatus" NOT NULL DEFAULT 'DRAFT',
    "adjustment_of_id" UUID,
    "revenue_snapshot" DECIMAL(12,2),
    "expenses_snapshot" DECIMAL(12,2),
    "distributable_snapshot" DECIMAL(12,2),
    "total_allocated" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_allocation_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "project_allocation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_allocation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_payout_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "TeamPayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "payout_method" "PayoutMethod" NOT NULL,
    "destination_snapshot" JSONB NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "processing_started_at" TIMESTAMPTZ(6),
    "processor" TEXT,
    "paid_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "failure_reason" TEXT,
    "external_reference" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "team_payout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_allocations_organization_id_project_id_idx" ON "project_allocations"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "project_allocations_organization_id_status_idx" ON "project_allocations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "project_allocations_created_by_idx" ON "project_allocations"("created_by");

-- CreateIndex
CREATE INDEX "project_allocations_approved_by_idx" ON "project_allocations"("approved_by");

-- CreateIndex
CREATE INDEX "project_allocations_adjustment_of_id_idx" ON "project_allocations"("adjustment_of_id");

-- CreateIndex
CREATE INDEX "project_allocation_lines_organization_id_project_allocation_idx" ON "project_allocation_lines"("organization_id", "project_allocation_id");

-- CreateIndex
CREATE INDEX "project_allocation_lines_organization_id_user_id_idx" ON "project_allocation_lines"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_allocation_lines_organization_id_project_allocation_key" ON "project_allocation_lines"("organization_id", "project_allocation_id", "user_id");

-- CreateIndex
CREATE INDEX "team_payout_requests_organization_id_user_id_idx" ON "team_payout_requests"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "team_payout_requests_organization_id_status_idx" ON "team_payout_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "team_payout_requests_reviewed_by_idx" ON "team_payout_requests"("reviewed_by");

-- CreateIndex
CREATE INDEX "team_payout_requests_approved_by_idx" ON "team_payout_requests"("approved_by");

-- AddForeignKey
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_allocations" ADD CONSTRAINT "project_allocations_adjustment_of_id_fkey" FOREIGN KEY ("adjustment_of_id") REFERENCES "project_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_allocation_lines" ADD CONSTRAINT "project_allocation_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_allocation_lines" ADD CONSTRAINT "project_allocation_lines_project_allocation_id_fkey" FOREIGN KEY ("project_allocation_id") REFERENCES "project_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_allocation_lines" ADD CONSTRAINT "project_allocation_lines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_payout_requests" ADD CONSTRAINT "team_payout_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_payout_requests" ADD CONSTRAINT "team_payout_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_payout_requests" ADD CONSTRAINT "team_payout_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_payout_requests" ADD CONSTRAINT "team_payout_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
