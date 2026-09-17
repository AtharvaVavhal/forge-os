import type { INestApplication } from "@nestjs/common";
import {
  ProjectPhase,
  ProjectStatus,
  MilestoneStatus,
  TaskPriority,
  TaskStatus,
  type UserRole,
} from "@prisma/client";
import request from "supertest";
import { PrismaService } from "../../src/database/prisma.service";
import { extractCookie } from "./bootstrap";
import { createTestUser } from "./fixtures";

export const PROJECTS_TEST_PREFIX = "phase-b4-e2e-";

export interface AuthSession {
  cookie: string;
  csrf: string;
  userId: string;
  email: string;
  organizationId: string;
}

export function authHeaders(session: AuthSession): Record<string, string> {
  return {
    Cookie: `forge_session=${session.cookie}; forge_csrf=${session.csrf}`,
    "X-CSRF-Token": session.csrf,
  };
}

export function listData<T = { id: string }>(body: unknown): T[] {
  return (body as { data: T[] }).data;
}

export async function loginSession(
  app: INestApplication,
  role: UserRole,
  opts?: { organizationId?: string; active?: boolean }
): Promise<AuthSession> {
  const fixture = await createTestUser(app, {
    role,
    organizationId: opts?.organizationId,
    active: opts?.active,
    emailSuffix: `proj-${role.toLowerCase()}`,
  });
  const response = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email: fixture.email, password: fixture.password });
  if (response.status !== 200) {
    throw new Error(`Login failed with status ${response.status}: ${JSON.stringify(response.body)}`);
  }
  const setCookie = response.headers["set-cookie"] as unknown as string[];
  return {
    cookie: extractCookie(setCookie, "forge_session")!,
    csrf: extractCookie(setCookie, "forge_csrf")!,
    userId: fixture.id,
    email: fixture.email,
    organizationId: fixture.organizationId,
  };
}

export async function createTestCompany(
  app: INestApplication,
  organizationId: string,
  overrides?: Partial<{ name: string }>
) {
  const prisma = app.get(PrismaService);
  return prisma.company.create({
    data: {
      organization_id: organizationId,
      name: overrides?.name ?? `${PROJECTS_TEST_PREFIX}company-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      billing_state: "Maharashtra",
      billing_address: "123 Forge Way, Mumbai",
    },
  });
}

export async function createTestProject(
  app: INestApplication,
  organizationId: string,
  companyId: string,
  ownerId: string,
  overrides?: Partial<{
    name: string;
    status: ProjectStatus;
    phase: ProjectPhase;
    deadline: Date | null;
    handoverChecklist: unknown;
  }>
) {
  const prisma = app.get(PrismaService);
  return prisma.project.create({
    data: {
      organization_id: organizationId,
      name: overrides?.name ?? `${PROJECTS_TEST_PREFIX}proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      company_id: companyId,
      owner_id: ownerId,
      status: overrides?.status ?? ProjectStatus.ACTIVE,
      phase: overrides?.phase ?? ProjectPhase.PLANNING,
      deadline: overrides?.deadline,
      handover_checklist: (overrides?.handoverChecklist as object) ?? [],
    },
  });
}

export async function createTestMilestone(
  app: INestApplication,
  organizationId: string,
  projectId: string,
  overrides?: Partial<{
    name: string;
    status: MilestoneStatus;
    requiresClientApproval: boolean;
    approvedAt: Date | null;
    dueDate: Date | null;
    sortOrder: number;
  }>
) {
  const prisma = app.get(PrismaService);
  return prisma.milestone.create({
    data: {
      organization_id: organizationId,
      project_id: projectId,
      name: overrides?.name ?? `${PROJECTS_TEST_PREFIX}milestone-${Date.now()}`,
      status: overrides?.status ?? MilestoneStatus.PENDING,
      requires_client_approval: overrides?.requiresClientApproval ?? false,
      approved_at: overrides?.approvedAt ?? null,
      due_date: overrides?.dueDate ?? null,
      sort_order: overrides?.sortOrder ?? 0,
    },
  });
}

export async function createTestTask(
  app: INestApplication,
  organizationId: string,
  projectId: string,
  overrides?: Partial<{
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    assigneeId: string | null;
    milestoneId: string | null;
    blockedByTaskId: string | null;
  }>
) {
  const prisma = app.get(PrismaService);
  return prisma.task.create({
    data: {
      organization_id: organizationId,
      project_id: projectId,
      title: overrides?.title ?? `${PROJECTS_TEST_PREFIX}task-${Date.now()}`,
      status: overrides?.status ?? TaskStatus.TODO,
      priority: overrides?.priority ?? TaskPriority.MEDIUM,
      assignee_id: overrides?.assigneeId ?? null,
      milestone_id: overrides?.milestoneId ?? null,
      blocked_by_task_id: overrides?.blockedByTaskId ?? null,
    },
  });
}

export async function createTestTimeEntry(
  app: INestApplication,
  organizationId: string,
  taskId: string,
  userId: string,
  overrides?: Partial<{
    minutes: number;
    loggedAt: Date;
  }>
) {
  const prisma = app.get(PrismaService);
  return prisma.timeEntry.create({
    data: {
      organization_id: organizationId,
      task_id: taskId,
      user_id: userId,
      minutes: overrides?.minutes ?? 60,
      logged_at: overrides?.loggedAt ?? new Date(),
    },
  });
}

export async function cleanupProjectsFixtures(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);

  await prisma.timeEntry.deleteMany({
    where: { task: { title: { startsWith: PROJECTS_TEST_PREFIX } } },
  });
  await prisma.task.deleteMany({
    where: { title: { startsWith: PROJECTS_TEST_PREFIX } },
  });
  await prisma.milestone.deleteMany({
    where: { name: { startsWith: PROJECTS_TEST_PREFIX } },
  });
  await prisma.project.deleteMany({
    where: { name: { startsWith: PROJECTS_TEST_PREFIX } },
  });
  await prisma.company.deleteMany({
    where: { name: { startsWith: PROJECTS_TEST_PREFIX } },
  });
}
