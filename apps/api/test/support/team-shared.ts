import type { INestApplication } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import request from "supertest";
import { extractCookie } from "./bootstrap";
import { PrismaService } from "../../src/database/prisma.service";
import { PasswordService } from "../../src/modules/auth/services/password.service";
import { OrganizationContextService } from "../../src/modules/shared/organization-context.service";

export const TEAM_SHARED_TEST_PREFIX = "phase-b6-e2e-";

export function listData<T = { id: string }>(body: unknown): T[] {
  return (body as { data: T[] }).data;
}

export interface AuthSession {
  cookie: string;
  csrf: string;
  userId: string;
  email: string;
  organizationId: string;
  role: UserRole;
}

export async function createB6TestUser(
  app: INestApplication,
  opts: {
    role: UserRole;
    active?: boolean;
    organizationId?: string;
    emailSuffix?: string;
  }
) {
  const prisma = app.get(PrismaService);
  const passwordService = app.get(PasswordService);
  const organizationId =
    opts.organizationId ??
    (await app.get(OrganizationContextService).resolveSingleOrganizationId());

  const email = `${TEAM_SHARED_TEST_PREFIX}${opts.emailSuffix ?? opts.role.toLowerCase()}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@forge.local`;
  const password = "Correct-Horse-Battery-Staple-1";
  const passwordHash = await passwordService.hash(password);

  const user = await prisma.user.create({
    data: {
      organization_id: organizationId,
      email,
      name: `B6 Test ${opts.role}`,
      role: opts.role,
      password_hash: passwordHash,
      active: opts.active ?? true,
    },
  });

  return { id: user.id, email, password, role: user.role, organizationId };
}

export async function loginSession(
  app: INestApplication,
  role: UserRole,
  opts?: { organizationId?: string; active?: boolean; emailSuffix?: string }
): Promise<AuthSession> {
  const fixture = await createB6TestUser(app, {
    role,
    organizationId: opts?.organizationId,
    active: opts?.active,
    emailSuffix: opts?.emailSuffix,
  });

  const response = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email: fixture.email, password: fixture.password });

  if (response.status !== 200) {
    throw new Error(
      `Login failed with status ${response.status}: ${JSON.stringify(response.body)}`
    );
  }

  const setCookie = response.headers["set-cookie"] as unknown as string[];
  return {
    cookie: extractCookie(setCookie, "forge_session")!,
    csrf: extractCookie(setCookie, "forge_csrf")!,
    userId: fixture.id,
    email: fixture.email,
    organizationId: fixture.organizationId,
    role,
  };
}

export function authHeaders(session: AuthSession): Record<string, string> {
  return {
    Cookie: `forge_session=${session.cookie}; forge_csrf=${session.csrf}`,
    "X-CSRF-Token": session.csrf,
  };
}

export async function cleanupTeamSharedTestData(
  app: INestApplication
): Promise<void> {
  const prisma = app.get(PrismaService);

  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEAM_SHARED_TEST_PREFIX } },
    select: { id: true },
  });
  const testUserIds = testUsers.map((u) => u.id);

  if (testUserIds.length > 0) {
    await prisma.notification.deleteMany({
      where: { recipient_id: { in: testUserIds } },
    }).catch(() => {});
    await prisma.document.deleteMany({
    where: { uploaded_by: { in: testUserIds } },
  }).catch(() => {});
    await prisma.note.deleteMany({
      where: { created_by: { in: testUserIds } },
    }).catch(() => {});
    await prisma.timeEntry.deleteMany({
      where: { user_id: { in: testUserIds } },
    }).catch(() => {});
  }

  await prisma.notification.deleteMany({
    where: { type: "TASK_ASSIGNED" },
  }).catch(() => {});

  await prisma.document.deleteMany({
    where: {
      OR: [
        { filename: { in: ["Architecture.pdf", "Project_Proposal.pdf"] } },
        { filename: { startsWith: TEAM_SHARED_TEST_PREFIX } },
        { filename: { in: [
          "company-secret.pdf",
          "unassigned-project.pdf",
          "assigned-project.pdf",
          "assigned-upload.pdf",
          "other-org.pdf",
          "leak.pdf",
        ] } },
        { project: { name: { startsWith: TEAM_SHARED_TEST_PREFIX } } },
        { company: { name: { startsWith: TEAM_SHARED_TEST_PREFIX } } },
      ],
    },
  }).catch(() => {});

  await prisma.note.deleteMany({
    where: { body: { contains: "discovery notes" } },
  }).catch(() => {});
  await prisma.note.deleteMany({
    where: { body: { contains: "Sprint 1 retrospective" } },
  }).catch(() => {});

  await prisma.timeEntry.deleteMany({
    where: { task: { title: { startsWith: TEAM_SHARED_TEST_PREFIX } } },
  }).catch(() => {});

  await prisma.task.deleteMany({
    where: { title: { startsWith: TEAM_SHARED_TEST_PREFIX } },
  }).catch(() => {});

  await prisma.deal.deleteMany({
    where: { title: { startsWith: TEAM_SHARED_TEST_PREFIX } },
  }).catch(() => {});

  await prisma.contact.deleteMany({
    where: {
      OR: [
        { name: { startsWith: TEAM_SHARED_TEST_PREFIX } },
        { email: { startsWith: TEAM_SHARED_TEST_PREFIX } },
      ],
    },
  }).catch(() => {});

  await prisma.project.deleteMany({
    where: { name: { startsWith: TEAM_SHARED_TEST_PREFIX } },
  }).catch(() => {});

  await prisma.company.deleteMany({
    where: { name: { startsWith: TEAM_SHARED_TEST_PREFIX } },
  }).catch(() => {});

  await prisma.invitationToken.deleteMany({
    where: { email: { startsWith: TEAM_SHARED_TEST_PREFIX } },
  }).catch(() => {});

  if (testUserIds.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: testUserIds } },
    }).catch(() => {});
  }

  await prisma.organization.deleteMany({
    where: { name: { startsWith: TEAM_SHARED_TEST_PREFIX } },
  }).catch(() => {});
}
