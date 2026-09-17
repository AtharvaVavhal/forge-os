import type { INestApplication } from "@nestjs/common";
import { DocumentCategory, Visibility } from "@prisma/client";
import request from "supertest";
import { PrismaService } from "../../src/database/prisma.service";
import { PasswordService } from "../../src/modules/auth/services/password.service";
import { extractCookie } from "./bootstrap";
import { createTestUser, resolveOrganizationId, TEST_EMAIL_PREFIX } from "./fixtures";
import { createTestDeal } from "./crm";
import { createTestProposal } from "./sales";
import { createTestProject } from "./projects";
import { createTestCompany, createTestInvoice } from "./finance";

export const PORTAL_TEST_PREFIX = "phase-b7-e2e-";

export interface PortalSession {
  cookie: string;
  csrf: string;
  clientUserId: string;
  email: string;
  organizationId: string;
  companyId: string;
}

export function portalAuthHeaders(session: PortalSession): Record<string, string> {
  return {
    Cookie: `portal_session=${session.cookie}; forge_csrf=${session.csrf}`,
    "X-CSRF-Token": session.csrf,
  };
}

export async function createTestClientUser(
  app: INestApplication,
  opts: {
    companyId: string;
    organizationId?: string;
    active?: boolean;
    emailSuffix?: string;
    password?: string;
  }
): Promise<{
  id: string;
  email: string;
  password: string;
  organizationId: string;
  companyId: string;
}> {
  const prisma = app.get(PrismaService);
  const passwordService = app.get(PasswordService);
  const organizationId = opts.organizationId ?? (await resolveOrganizationId(app));
  const password = opts.password ?? "Correct-Horse-Battery-Staple-1";
  const email = `${TEST_EMAIL_PREFIX}${PORTAL_TEST_PREFIX}${opts.emailSuffix ?? "client"}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@forge.local`;
  const passwordHash = await passwordService.hash(password);

  const clientUser = await prisma.clientUser.create({
    data: {
      organization_id: organizationId,
      company_id: opts.companyId,
      email,
      password_hash: passwordHash,
      active: opts.active ?? true,
    },
  });

  return {
    id: clientUser.id,
    email,
    password,
    organizationId,
    companyId: opts.companyId,
  };
}

export async function portalLoginSession(
  app: INestApplication,
  fixture: { email: string; password: string; id: string; organizationId: string; companyId: string }
): Promise<PortalSession> {
  const response = await request(app.getHttpServer())
    .post("/api/v1/portal/auth/login")
    .send({ email: fixture.email, password: fixture.password });
  if (response.status !== 200) {
    throw new Error(
      `Portal login failed with status ${response.status}: ${JSON.stringify(response.body)}`
    );
  }
  const setCookie = response.headers["set-cookie"] as unknown as string[];
  return {
    cookie: extractCookie(setCookie, "portal_session")!,
    csrf: extractCookie(setCookie, "forge_csrf")!,
    clientUserId: fixture.id,
    email: fixture.email,
    organizationId: fixture.organizationId,
    companyId: fixture.companyId,
  };
}

/** Full company + client + staff owner scaffold for portal resource tests. */
export async function createPortalCompanyWorld(app: INestApplication) {
  const organizationId = await resolveOrganizationId(app);
  const owner = await createTestUser(app, {
    role: "FOUNDER_ADMIN",
    organizationId,
    emailSuffix: `${PORTAL_TEST_PREFIX}owner`,
  });
  const company = await createTestCompany(app, organizationId);
  const client = await createTestClientUser(app, {
    companyId: company.id,
    organizationId,
    emailSuffix: "main",
  });
  const otherCompany = await createTestCompany(app, organizationId);
  const otherClient = await createTestClientUser(app, {
    companyId: otherCompany.id,
    organizationId,
    emailSuffix: "other",
  });

  return { organizationId, owner, company, client, otherCompany, otherClient };
}

export async function createPortalDocument(
  app: INestApplication,
  params: {
    organizationId: string;
    uploadedBy: string;
    visibility: Visibility;
    companyId?: string;
    projectId?: string;
    invoiceId?: string;
    deletedAt?: Date | null;
    filename?: string;
  }
) {
  const prisma = app.get(PrismaService);
  return prisma.document.create({
    data: {
      organization_id: params.organizationId,
      filename: params.filename ?? `${PORTAL_TEST_PREFIX}doc.pdf`,
      storage_key: `test/${PORTAL_TEST_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mime_type: "application/pdf",
      size_bytes: 1024,
      category: DocumentCategory.CLIENT_ASSET,
      visibility: params.visibility,
      company_id: params.companyId,
      project_id: params.projectId,
      invoice_id: params.invoiceId,
      uploaded_by: params.uploadedBy,
      deleted_at: params.deletedAt ?? null,
    },
  });
}

export { createTestDeal, createTestProposal, createTestProject, createTestInvoice, Visibility };
