import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";

function assertInOrg(exists: boolean, notFoundMessage: string): void {
  if (!exists) {
    throw new NotFoundException({ code: "NOT_FOUND", message: notFoundMessage });
  }
}

export async function assertCompanyInOrg(
  prisma: PrismaService,
  companyId: string,
  organizationId: string
): Promise<void> {
  const row = await prisma.company.findFirst({
    where: { id: companyId, organization_id: organizationId },
    select: { id: true },
  });
  assertInOrg(!!row, "Company not found.");
}

export async function assertDealInOrg(
  prisma: PrismaService,
  dealId: string,
  organizationId: string
): Promise<void> {
  const row = await prisma.deal.findFirst({
    where: { id: dealId, organization_id: organizationId },
    select: { id: true },
  });
  assertInOrg(!!row, "Deal not found.");
}

export async function assertUserInOrg(
  prisma: PrismaService,
  userId: string,
  organizationId: string
): Promise<void> {
  const row = await prisma.user.findFirst({
    where: { id: userId, organization_id: organizationId },
    select: { id: true },
  });
  assertInOrg(!!row, "User not found.");
}

export async function assertMilestoneInProject(
  prisma: PrismaService,
  milestoneId: string,
  projectId: string,
  organizationId: string
): Promise<void> {
  const row = await prisma.milestone.findFirst({
    where: { id: milestoneId, project_id: projectId, organization_id: organizationId },
    select: { id: true },
  });
  assertInOrg(!!row, "Milestone not found in this project.");
}

export async function assertTaskInProject(
  prisma: PrismaService,
  taskId: string,
  projectId: string,
  organizationId: string
): Promise<void> {
  const row = await prisma.task.findFirst({
    where: { id: taskId, project_id: projectId, organization_id: organizationId },
    select: { id: true },
  });
  assertInOrg(!!row, "Task not found in this project.");
}
