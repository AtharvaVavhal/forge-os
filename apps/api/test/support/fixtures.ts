import type { INestApplication } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import { PrismaService } from "../../src/database/prisma.service";
import { PasswordService } from "../../src/modules/auth/services/password.service";
import { OrganizationContextService } from "../../src/modules/shared/organization-context.service";

/**
 * All Phase 1 e2e fixtures use this prefix so they're trivially
 * distinguishable from the real Document 2 §D seed data (`founder@
 * forge.local` etc.) and from anything else in this shared local
 * database — `afterAll` cleanup targets exactly this prefix and nothing
 * else, so these tests never touch seeded or hand-created data.
 */
export const TEST_EMAIL_PREFIX = "phase1-e2e-";

export interface TestUserFixture {
  id: string;
  email: string;
  password: string;
  role: UserRole;
  organizationId: string;
}

export async function resolveOrganizationId(app: INestApplication): Promise<string> {
  return app.get(OrganizationContextService).resolveSingleOrganizationId();
}

export async function createTestUser(
  app: INestApplication,
  opts: {
    role: UserRole;
    active?: boolean;
    organizationId?: string;
    emailSuffix?: string;
  }
): Promise<TestUserFixture> {
  const prisma = app.get(PrismaService);
  const passwordService = app.get(PasswordService);
  const organizationId = opts.organizationId ?? (await resolveOrganizationId(app));

  const email = `${TEST_EMAIL_PREFIX}${opts.emailSuffix ?? opts.role.toLowerCase()}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@forge.local`;
  const password = "Correct-Horse-Battery-Staple-1";
  const passwordHash = await passwordService.hash(password);

  const user = await prisma.user.create({
    data: {
      organization_id: organizationId,
      email,
      name: `Phase 1 Test ${opts.role}`,
      role: opts.role,
      password_hash: passwordHash,
      active: opts.active ?? true,
    },
  });

  return { id: user.id, email, password, role: user.role, organizationId };
}

export async function createSecondOrganization(app: INestApplication): Promise<string> {
  const prisma = app.get(PrismaService);
  const org = await prisma.organization.create({
    data: {
      name: `Phase 1 E2E Second Org ${Date.now()}`,
      billing_state: "Karnataka",
      billing_address: "Test fixture — safe to delete",
    },
  });
  return org.id;
}

/** Deletes everything this fixture module could have created. Never
 * touches rows outside the `TEST_EMAIL_PREFIX` namespace or organizations
 * not created by `createSecondOrganization`. AuditLog rows are
 * deliberately left alone — the table is genuinely append-only (DB
 * REVOKE), and audit history accumulating from test runs is correct,
 * expected behavior, not test pollution. */
export async function cleanupTestFixtures(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);

  await prisma.invitationToken.deleteMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
  });
  await prisma.clientUser.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } });
  await prisma.organization.deleteMany({
    where: { name: { startsWith: "Phase 1 E2E Second Org" } },
  });
}
