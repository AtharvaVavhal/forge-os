import type { INestApplication } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import request from "supertest";
import { extractCookie } from "./bootstrap";
import { createTestUser } from "./fixtures";
import { PrismaService } from "../../src/database/prisma.service";

/** B2 CRM e2e fixtures use this prefix so cleanup never touches seeded or Phase 1 data. */
export const CRM_TEST_PREFIX = "phase-b2-e2e-";

/**
 * Supertest's `response.body` is typed `any`, so calling an array method
 * (`.some()`, `.map()`, ...) directly on `response.body.data` is a
 * `@typescript-eslint/no-unsafe-call` *error* (not just the `warn`-level
 * `no-unsafe-member-access`/`no-unsafe-argument` the rest of this test
 * suite already accepts) — this one explicit cast at the boundary is
 * cheaper than threading a real response type through every assertion.
 */
export function listData<T = { id: string }>(body: unknown): T[] {
  return (body as { data: T[] }).data;
}

export interface AuthSession {
  cookie: string;
  csrf: string;
  userId: string;
  email: string;
  organizationId: string;
}

/** Logs a fresh test user in and returns everything needed to authenticate further requests. */
export async function loginSession(
  app: INestApplication,
  role: UserRole,
  opts?: { organizationId?: string; active?: boolean }
): Promise<AuthSession> {
  const fixture = await createTestUser(app, {
    role,
    organizationId: opts?.organizationId,
    active: opts?.active,
    emailSuffix: `crm-${role.toLowerCase()}`,
  });
  const response = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email: fixture.email, password: fixture.password });
  const setCookie = response.headers["set-cookie"] as unknown as string[];
  return {
    cookie: extractCookie(setCookie, "forge_session")!,
    csrf: extractCookie(setCookie, "forge_csrf")!,
    userId: fixture.id,
    email: fixture.email,
    organizationId: fixture.organizationId,
  };
}

/** `Cookie` + `X-CSRF-Token` headers for an authenticated, CSRF-eligible request. */
export function authHeaders(session: AuthSession): Record<string, string> {
  return {
    Cookie: `forge_session=${session.cookie}; forge_csrf=${session.csrf}`,
    "X-CSRF-Token": session.csrf,
  };
}

export async function createTestCompany(
  app: INestApplication,
  organizationId: string,
  overrides?: Partial<{ name: string; archived: boolean; tags: string[] }>
) {
  const prisma = app.get(PrismaService);
  return prisma.company.create({
    data: {
      organization_id: organizationId,
      name: overrides?.name ?? `${CRM_TEST_PREFIX}company-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      billing_state: "Maharashtra",
      billing_address: "Test fixture — safe to delete",
      tags: overrides?.tags ?? [],
      archived_at: overrides?.archived ? new Date() : null,
    },
  });
}

export async function createTestContact(
  app: INestApplication,
  organizationId: string,
  overrides?: Partial<{ name: string; email: string; companyId: string }>
) {
  const prisma = app.get(PrismaService);
  return prisma.contact.create({
    data: {
      organization_id: organizationId,
      name: overrides?.name ?? `${CRM_TEST_PREFIX}contact-${Date.now()}`,
      email: overrides?.email,
      company_id: overrides?.companyId,
    },
  });
}

export async function createTestLead(
  app: INestApplication,
  organizationId: string,
  overrides?: Partial<{ status: "NEW" | "CONTACTED" | "QUALIFIED" | "CONVERTED" | "DISQUALIFIED"; companyId: string; contactId: string }>
) {
  const prisma = app.get(PrismaService);
  return prisma.lead.create({
    data: {
      organization_id: organizationId,
      status: overrides?.status ?? "NEW",
      company_id: overrides?.companyId,
      contact_id: overrides?.contactId,
      // Tags every fixture lead for cleanup, even one with no company/
      // contact context (the only free-text field a Lead has).
      notes: `${CRM_TEST_PREFIX}fixture`,
    },
  });
}

export async function createTestDeal(
  app: INestApplication,
  organizationId: string,
  ownerId: string,
  overrides?: Partial<{ title: string; stage: string; estimatedValue: string; companyId: string }>
) {
  const prisma = app.get(PrismaService);
  return prisma.deal.create({
    data: {
      organization_id: organizationId,
      title: overrides?.title ?? `${CRM_TEST_PREFIX}deal-${Date.now()}`,
      estimated_value: overrides?.estimatedValue ?? "10000.00",
      owner_id: ownerId,
      ...(overrides?.companyId ? { company_id: overrides.companyId } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only stage override for terminal-state fixtures
      ...(overrides?.stage ? { stage: overrides.stage as any } : {}),
    },
  });
}

/** Creates an ACCEPTED Proposal directly (Sales/B3 isn't implemented yet — this is the only way to exercise the Deal-WON precondition in an e2e test). */
export async function createAcceptedProposal(
  app: INestApplication,
  organizationId: string,
  dealId: string,
  createdByUserId: string
) {
  const prisma = app.get(PrismaService);
  return prisma.proposal.create({
    data: {
      organization_id: organizationId,
      deal_id: dealId,
      version: 1,
      status: "ACCEPTED",
      created_by: createdByUserId,
    },
  });
}

/** Deletes every row this fixture module could have created, scoped strictly to `CRM_TEST_PREFIX` names/emails. */
export async function cleanupCrmFixtures(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);

  const crmCompanies = await prisma.company.findMany({
    where: { name: { startsWith: CRM_TEST_PREFIX } },
    select: { id: true },
  });
  const companyIds = crmCompanies.map((c) => c.id);
  if (companyIds.length > 0) {
    const projects = await prisma.project.findMany({
      where: { company_id: { in: companyIds } },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);
    if (projectIds.length > 0) {
      await prisma.supportTicket.deleteMany({ where: { project_id: { in: projectIds } } });
      await prisma.invoiceLineItem.deleteMany({
        where: { invoice: { project_id: { in: projectIds } } },
      });
      await prisma.payment.deleteMany({
        where: { invoice: { project_id: { in: projectIds } } },
      });
      await prisma.invoice.deleteMany({ where: { project_id: { in: projectIds } } });
      await prisma.task.deleteMany({ where: { project_id: { in: projectIds } } });
      await prisma.milestone.deleteMany({ where: { project_id: { in: projectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }
  }

  await prisma.activity.deleteMany({ where: { summary: { startsWith: CRM_TEST_PREFIX } } });
  const crmDeals = await prisma.deal.findMany({
    where: { title: { startsWith: CRM_TEST_PREFIX } },
    select: { id: true },
  });
  const dealIds = crmDeals.map((d) => d.id);
  if (dealIds.length > 0) {
    await prisma.domainEvent.deleteMany({
      where: { aggregate_id: { in: dealIds } },
    });
  }
  await prisma.proposalLineItem.deleteMany({
    where: { proposal: { deal: { title: { startsWith: CRM_TEST_PREFIX } } } },
  });
  await prisma.proposal.deleteMany({
    where: { deal: { title: { startsWith: CRM_TEST_PREFIX } } },
  });
  await prisma.lead.deleteMany({
    where: {
      OR: [
        { company: { name: { startsWith: CRM_TEST_PREFIX } } },
        { contact: { name: { startsWith: CRM_TEST_PREFIX } } },
        { converted_deal: { title: { startsWith: CRM_TEST_PREFIX } } },
        { notes: { startsWith: CRM_TEST_PREFIX } },
      ],
    },
  });
  await prisma.deal.deleteMany({ where: { title: { startsWith: CRM_TEST_PREFIX } } });
  await prisma.contact.deleteMany({ where: { name: { startsWith: CRM_TEST_PREFIX } } });
  await prisma.company.deleteMany({ where: { name: { startsWith: CRM_TEST_PREFIX } } });
}
