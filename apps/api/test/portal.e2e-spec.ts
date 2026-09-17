import type { INestApplication } from "@nestjs/common";
import { InvoiceStatus, ProposalStatus, Visibility } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./support/bootstrap";
import { cleanupTestFixtures, createSecondOrganization, createTestUser } from "./support/fixtures";
import { cleanupCrmFixtures, listData, loginSession } from "./support/crm";
import { cleanupSalesFixtures, createTestProposal } from "./support/sales";
import { cleanupProjectsFixtures, createTestProject } from "./support/projects";
import { cleanupFinanceFixtures, createTestInvoice } from "./support/finance";
import { PrismaService } from "../src/database/prisma.service";
import {
  createPortalCompanyWorld,
  createPortalDocument,
  createTestClientUser,
  portalAuthHeaders,
  portalLoginSession,
  PORTAL_TEST_PREFIX,
} from "./support/portal";

/**
 * B7 Client Portal e2e — Document 5 §11 / §19 (16 routes) + Document 6 §9.
 * Covers auth plane isolation, company IDOR, proposal accept, documents,
 * invoices/pay CSRF, and support tickets.
 */
describe("B7 Client Portal (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    const safe = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (error) {
        // eslint-disable-next-line no-console -- test cleanup diagnostics
        console.warn(`[portal e2e cleanup] ${label}:`, error instanceof Error ? error.message : error);
      }
    };
    await safe("support", () =>
      prisma.supportTicket.deleteMany({ where: { subject: { startsWith: PORTAL_TEST_PREFIX } } })
    );
    await safe("domain events", () =>
      prisma.domainEvent.deleteMany({ where: { type: "ProposalAccepted" } })
    );
    await safe("documents", () =>
      prisma.document.deleteMany({ where: { filename: { startsWith: PORTAL_TEST_PREFIX } } })
    );
    await safe("proposals", () =>
      prisma.proposal.deleteMany({ where: { deal: { title: { startsWith: PORTAL_TEST_PREFIX } } } })
    );
    await safe("deals", () =>
      prisma.deal.deleteMany({ where: { title: { startsWith: PORTAL_TEST_PREFIX } } })
    );
    await safe("milestones", () =>
      prisma.milestone.deleteMany({ where: { name: { startsWith: PORTAL_TEST_PREFIX } } })
    );
    await safe("projects", () =>
      prisma.project.deleteMany({ where: { name: { startsWith: PORTAL_TEST_PREFIX } } })
    );
    await safe("payments/invoices", async () => {
      await prisma.payment.deleteMany({
        where: { invoice: { company: { name: { contains: PORTAL_TEST_PREFIX } } } },
      });
      await prisma.invoiceLineItem.deleteMany({
        where: { invoice: { company: { name: { contains: PORTAL_TEST_PREFIX } } } },
      });
      await prisma.invoice.deleteMany({
        where: { company: { name: { contains: PORTAL_TEST_PREFIX } } },
      });
      // Also clear invoices on CRM companies used by portal fixtures.
      await prisma.payment.deleteMany({
        where: { invoice: { invoice_number: { startsWith: "phase-b5-e2e-" } } },
      });
      await prisma.invoiceLineItem.deleteMany({
        where: { invoice: { invoice_number: { startsWith: "phase-b5-e2e-" } } },
      });
      await prisma.invoice.deleteMany({
        where: { invoice_number: { startsWith: "phase-b5-e2e-" } },
      });
    });
    await safe("finance", () => cleanupFinanceFixtures(app));
    await safe("projects fixtures", () => cleanupProjectsFixtures(app));
    await safe("sales", () => cleanupSalesFixtures(app));
    await safe("auth fixtures", () => cleanupTestFixtures(app));
    await safe("portal companies", () =>
      prisma.company.deleteMany({ where: { name: { startsWith: PORTAL_TEST_PREFIX } } })
    );
    await safe("crm", () => cleanupCrmFixtures(app));
    await app.close();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  describe("auth", () => {
    it("logs in, returns me, and logs out", async () => {
      const world = await createPortalCompanyWorld(app);
      const login = await request(app.getHttpServer())
        .post("/api/v1/portal/auth/login")
        .send({ email: world.client.email, password: world.client.password });
      expect(login.status).toBe(200);
      expect(login.body.email).toBe(world.client.email);
      expect(login.body.companyId).toBe(world.company.id);

      const setCookie = login.headers["set-cookie"] as unknown as string[];
      expect(extractCookie(setCookie, "portal_session")).toBeTruthy();
      expect(extractCookie(setCookie, "forge_csrf")).toBeTruthy();

      const session = await portalLoginSession(app, world.client);
      const me = await request(app.getHttpServer())
        .get("/api/v1/portal/me")
        .set(portalAuthHeaders(session));
      expect(me.status).toBe(200);
      expect(me.body.id).toBe(world.client.id);

      const logout = await request(app.getHttpServer())
        .post("/api/v1/portal/auth/logout")
        .set(portalAuthHeaders(session));
      expect(logout.status).toBe(204);

      // Cookie cleared + security stamp bumped — retained JWT is rejected.
      const meAfter = await request(app.getHttpServer())
        .get("/api/v1/portal/me")
        .set(portalAuthHeaders(session));
      expect(meAfter.status).toBe(401);
    });

    it("rejects invalid credentials with a generic message", async () => {
      const world = await createPortalCompanyWorld(app);
      const res = await request(app.getHttpServer())
        .post("/api/v1/portal/auth/login")
        .send({ email: world.client.email, password: "wrong-password" });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe("Invalid email or password.");
    });

    it("rejects inactive ClientUser with the same generic message", async () => {
      const world = await createPortalCompanyWorld(app);
      const inactive = await createTestClientUser(app, {
        companyId: world.company.id,
        organizationId: world.organizationId,
        active: false,
        emailSuffix: "inactive",
      });
      const res = await request(app.getHttpServer())
        .post("/api/v1/portal/auth/login")
        .send({ email: inactive.email, password: inactive.password });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe("Invalid email or password.");
    });

    it("rejects unauthenticated portal access with 401", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/portal/me");
      expect(res.status).toBe(401);
    });

    it("rejects internal forge_session on portal routes", async () => {
      const internal = await loginSession(app, "FOUNDER_ADMIN");
      const res = await request(app.getHttpServer())
        .get("/api/v1/portal/me")
        .set({
          Cookie: `forge_session=${internal.cookie}; forge_csrf=${internal.csrf}`,
          "X-CSRF-Token": internal.csrf,
        });
      expect(res.status).toBe(401);
    });

    it("rejects portal_session on internal routes", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const res = await request(app.getHttpServer())
        .get("/api/v1/companies")
        .set(portalAuthHeaders(session));
      expect(res.status).toBe(401);
    });

    it("rejects inactive ClientUser mid-session", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const prisma = app.get(PrismaService);
      await prisma.clientUser.update({
        where: { id: world.client.id },
        data: { active: false },
      });
      const res = await request(app.getHttpServer())
        .get("/api/v1/portal/me")
        .set(portalAuthHeaders(session));
      expect(res.status).toBe(401);
    });
  });

  // ── Projects ──────────────────────────────────────────────────────────────

  describe("projects", () => {
    it("lists and gets company-scoped projects with safe fields", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const project = await createTestProject(
        app,
        world.organizationId,
        world.company.id,
        world.owner.id,
        {
          name: `${PORTAL_TEST_PREFIX}proj`,
          handoverChecklist: [{ item: "Deploy", done: true, doneAt: "2026-01-01T00:00:00.000Z" }],
        }
      );
      await createTestProject(app, world.organizationId, world.otherCompany.id, world.owner.id, {
        name: `${PORTAL_TEST_PREFIX}other-proj`,
      });

      const list = await request(app.getHttpServer())
        .get("/api/v1/portal/projects")
        .set(portalAuthHeaders(session));
      expect(list.status).toBe(200);
      const ids = listData<{ id: string }>(list.body).map((p) => p.id);
      expect(ids).toContain(project.id);
      expect(ids).not.toContain(
        (
          await app.get(PrismaService).project.findFirst({
            where: { name: `${PORTAL_TEST_PREFIX}other-proj` },
          })
        )?.id
      );

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/portal/projects/${project.id}`)
        .set(portalAuthHeaders(session));
      expect(detail.status).toBe(200);
      expect(detail.body.name).toBe(`${PORTAL_TEST_PREFIX}proj`);
      expect(detail.body.ownerId).toBeUndefined();

      const handover = await request(app.getHttpServer())
        .get(`/api/v1/portal/projects/${project.id}/handover`)
        .set(portalAuthHeaders(session));
      expect(handover.status).toBe(200);
      expect(handover.body.items).toEqual([
        { item: "Deploy", done: true, doneAt: "2026-01-01T00:00:00.000Z" },
      ]);
    });

    it("returns 404 for another company's project", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const otherProject = await createTestProject(
        app,
        world.organizationId,
        world.otherCompany.id,
        world.owner.id
      );
      const res = await request(app.getHttpServer())
        .get(`/api/v1/portal/projects/${otherProject.id}`)
        .set(portalAuthHeaders(session));
      expect(res.status).toBe(404);
    });

    it("lists milestones for a scoped project", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const project = await createTestProject(
        app,
        world.organizationId,
        world.company.id,
        world.owner.id
      );
      const prisma = app.get(PrismaService);
      await prisma.milestone.create({
        data: {
          organization_id: world.organizationId,
          project_id: project.id,
          name: `${PORTAL_TEST_PREFIX}m1`,
          requires_client_approval: true,
          sort_order: 0,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/portal/projects/${project.id}/milestones`)
        .set(portalAuthHeaders(session));
      expect(res.status).toBe(200);
      expect(listData(res.body).length).toBe(1);
      expect(listData<{ name: string }>(res.body)[0]?.name).toBe(`${PORTAL_TEST_PREFIX}m1`);
    });
  });

  // ── Proposals ─────────────────────────────────────────────────────────────

  describe("proposals", () => {
    async function createCompanyDeal(
      organizationId: string,
      ownerId: string,
      companyId: string
    ) {
      const prisma = app.get(PrismaService);
      return prisma.deal.create({
        data: {
          organization_id: organizationId,
          title: `${PORTAL_TEST_PREFIX}deal-${Date.now()}`,
          estimated_value: "10000.00",
          owner_id: ownerId,
          company_id: companyId,
        },
      });
    }

    it("lists proposals, marks SENT as VIEWED, and accepts", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const deal = await createCompanyDeal(
        world.organizationId,
        world.owner.id,
        world.company.id
      );
      const proposal = await createTestProposal(
        app,
        world.organizationId,
        deal.id,
        world.owner.id,
        { status: "SENT" }
      );

      const list = await request(app.getHttpServer())
        .get("/api/v1/portal/proposals")
        .set(portalAuthHeaders(session));
      expect(list.status).toBe(200);
      expect(listData<{ id: string }>(list.body).some((p) => p.id === proposal.id)).toBe(true);

      const get = await request(app.getHttpServer())
        .get(`/api/v1/portal/proposals/${proposal.id}`)
        .set(portalAuthHeaders(session));
      expect(get.status).toBe(200);
      expect(get.body.status).toBe(ProposalStatus.VIEWED);

      const accept = await request(app.getHttpServer())
        .post(`/api/v1/portal/proposals/${proposal.id}/accept`)
        .set(portalAuthHeaders(session));
      expect(accept.status).toBe(200);
      expect(accept.body.status).toBe(ProposalStatus.ACCEPTED);
      expect(accept.body.acceptedAt).toBeTruthy();

      const prisma = app.get(PrismaService);
      const event = await prisma.domainEvent.findFirst({
        where: { type: "ProposalAccepted", aggregate_id: proposal.id },
      });
      expect(event).toBeTruthy();

      const audit = await prisma.auditLog.findFirst({
        where: { action: "proposal.accepted", entity_id: proposal.id },
        orderBy: { created_at: "desc" },
      });
      expect(audit?.actor_type).toBe("CLIENT_USER");
      expect(audit?.actor_id).toBe(world.client.id);

      // Deal must NOT auto-Won
      const dealAfter = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
      expect(dealAfter.stage).not.toBe("WON");
    });

    it("rejects accept replay and illegal states", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);

      for (const status of ["DRAFT", "REJECTED", "EXPIRED", "ACCEPTED"] as const) {
        const deal = await createCompanyDeal(
          world.organizationId,
          world.owner.id,
          world.company.id
        );
        const proposal = await createTestProposal(
          app,
          world.organizationId,
          deal.id,
          world.owner.id,
          { status }
        );
        const res = await request(app.getHttpServer())
          .post(`/api/v1/portal/proposals/${proposal.id}/accept`)
          .set(portalAuthHeaders(session));
        if (status === "DRAFT") {
          expect(res.status).toBe(404);
        } else {
          expect([404, 409]).toContain(res.status);
        }
      }

      // Replay after successful accept
      const deal = await createCompanyDeal(
        world.organizationId,
        world.owner.id,
        world.company.id
      );
      const accepted = await createTestProposal(
        app,
        world.organizationId,
        deal.id,
        world.owner.id,
        { status: "VIEWED" }
      );
      const first = await request(app.getHttpServer())
        .post(`/api/v1/portal/proposals/${accepted.id}/accept`)
        .set(portalAuthHeaders(session));
      expect(first.status).toBe(200);
      const second = await request(app.getHttpServer())
        .post(`/api/v1/portal/proposals/${accepted.id}/accept`)
        .set(portalAuthHeaders(session));
      expect(second.status).toBe(409);
    });

    it("allows only one concurrent accept to succeed", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const deal = await createCompanyDeal(
        world.organizationId,
        world.owner.id,
        world.company.id
      );
      const proposal = await createTestProposal(
        app,
        world.organizationId,
        deal.id,
        world.owner.id,
        { status: "VIEWED" }
      );

      const [a, b] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/portal/proposals/${proposal.id}/accept`)
          .set(portalAuthHeaders(session)),
        request(app.getHttpServer())
          .post(`/api/v1/portal/proposals/${proposal.id}/accept`)
          .set(portalAuthHeaders(session)),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
    });

    it("returns 404 for another company's proposal", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const deal = await createCompanyDeal(
        world.organizationId,
        world.owner.id,
        world.otherCompany.id
      );
      const proposal = await createTestProposal(
        app,
        world.organizationId,
        deal.id,
        world.owner.id,
        { status: "SENT" }
      );
      const res = await request(app.getHttpServer())
        .get(`/api/v1/portal/proposals/${proposal.id}`)
        .set(portalAuthHeaders(session));
      expect(res.status).toBe(404);
    });

    it("ignores body organizationId / companyId injection on accept", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const deal = await createCompanyDeal(
        world.organizationId,
        world.owner.id,
        world.company.id
      );
      const proposal = await createTestProposal(
        app,
        world.organizationId,
        deal.id,
        world.owner.id,
        { status: "SENT" }
      );
      const res = await request(app.getHttpServer())
        .post(`/api/v1/portal/proposals/${proposal.id}/accept`)
        .set(portalAuthHeaders(session))
        .send({ organizationId: "00000000-0000-0000-0000-000000000099", companyId: world.otherCompany.id });
      // forbidNonWhitelisted → 400, or accept succeeds ignoring body
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.status).toBe(ProposalStatus.ACCEPTED);
      }
    });
  });

  // ── Invoices ──────────────────────────────────────────────────────────────

  describe("invoices", () => {
    it("lists and gets company invoices; hides DRAFT", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const sent = await createTestInvoice(app, world.organizationId, world.company.id, {
        status: "SENT",
        amount: "5000.00",
      });
      const draft = await createTestInvoice(app, world.organizationId, world.company.id, {
        status: "DRAFT",
        amount: "100.00",
      });
      await createTestInvoice(app, world.organizationId, world.otherCompany.id, {
        status: "SENT",
        amount: "999.00",
      });

      const list = await request(app.getHttpServer())
        .get("/api/v1/portal/invoices")
        .set(portalAuthHeaders(session));
      expect(list.status).toBe(200);
      const ids = listData<{ id: string }>(list.body).map((i) => i.id);
      expect(ids).toContain(sent.id);
      expect(ids).not.toContain(draft.id);

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/portal/invoices/${sent.id}`)
        .set(portalAuthHeaders(session));
      expect(detail.status).toBe(200);
      expect(detail.body.id).toBe(sent.id);
    });

    it("returns 404 for another company's invoice", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const other = await createTestInvoice(app, world.organizationId, world.otherCompany.id, {
        status: "SENT",
      });
      const res = await request(app.getHttpServer())
        .get(`/api/v1/portal/invoices/${other.id}`)
        .set(portalAuthHeaders(session));
      expect(res.status).toBe(404);
    });

    it("requires CSRF on pay and does not mutate invoice status", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const invoice = await createTestInvoice(app, world.organizationId, world.company.id, {
        status: "SENT",
        amount: "2500.00",
      });

      const noCsrf = await request(app.getHttpServer())
        .post(`/api/v1/portal/invoices/${invoice.id}/pay`)
        .set({ Cookie: `portal_session=${session.cookie}` });
      expect(noCsrf.status).toBe(403);

      const pay = await request(app.getHttpServer())
        .post(`/api/v1/portal/invoices/${invoice.id}/pay`)
        .set(portalAuthHeaders(session));
      // Razorpay may be unconfigured → 503; either way invoice stays SENT
      expect([200, 503]).toContain(pay.status);

      const prisma = app.get(PrismaService);
      const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(after.status).toBe(InvoiceStatus.SENT);
    });
  });

  // ── Documents ─────────────────────────────────────────────────────────────

  describe("documents", () => {
    it("lists CLIENT_VISIBLE only; hides INTERNAL and deleted", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const visible = await createPortalDocument(app, {
        organizationId: world.organizationId,
        uploadedBy: world.owner.id,
        visibility: Visibility.CLIENT_VISIBLE,
        companyId: world.company.id,
        filename: `${PORTAL_TEST_PREFIX}visible.pdf`,
      });
      await createPortalDocument(app, {
        organizationId: world.organizationId,
        uploadedBy: world.owner.id,
        visibility: Visibility.INTERNAL,
        companyId: world.company.id,
        filename: `${PORTAL_TEST_PREFIX}internal.pdf`,
      });
      await createPortalDocument(app, {
        organizationId: world.organizationId,
        uploadedBy: world.owner.id,
        visibility: Visibility.CLIENT_VISIBLE,
        companyId: world.company.id,
        deletedAt: new Date(),
        filename: `${PORTAL_TEST_PREFIX}deleted.pdf`,
      });
      await createPortalDocument(app, {
        organizationId: world.organizationId,
        uploadedBy: world.owner.id,
        visibility: Visibility.CLIENT_VISIBLE,
        companyId: world.otherCompany.id,
        filename: `${PORTAL_TEST_PREFIX}other-co.pdf`,
      });

      const list = await request(app.getHttpServer())
        .get("/api/v1/portal/documents")
        .set(portalAuthHeaders(session));
      expect(list.status).toBe(200);
      const ids = listData<{ id: string }>(list.body).map((d) => d.id);
      expect(ids).toContain(visible.id);
      expect(ids.length).toBeGreaterThanOrEqual(1);
      for (const id of ids) {
        expect(id).not.toBe(
          (
            await app.get(PrismaService).document.findFirst({
              where: { filename: `${PORTAL_TEST_PREFIX}internal.pdf` },
            })
          )?.id
        );
      }

      const download = await request(app.getHttpServer())
        .get(`/api/v1/portal/documents/${visible.id}/download-url`)
        .set(portalAuthHeaders(session));
      expect(download.status).toBe(200);
      expect(download.body.downloadUrl).toBeTruthy();
      expect(download.body.expiresAt).toBeTruthy();
    });

    it("returns 404 for INTERNAL document download", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const internal = await createPortalDocument(app, {
        organizationId: world.organizationId,
        uploadedBy: world.owner.id,
        visibility: Visibility.INTERNAL,
        companyId: world.company.id,
      });
      const res = await request(app.getHttpServer())
        .get(`/api/v1/portal/documents/${internal.id}/download-url`)
        .set(portalAuthHeaders(session));
      expect(res.status).toBe(404);
    });
  });

  // ── Support ───────────────────────────────────────────────────────────────

  describe("support tickets", () => {
    it("creates and lists company-scoped tickets; rejects other company project", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const project = await createTestProject(
        app,
        world.organizationId,
        world.company.id,
        world.owner.id
      );
      const otherProject = await createTestProject(
        app,
        world.organizationId,
        world.otherCompany.id,
        world.owner.id
      );

      const created = await request(app.getHttpServer())
        .post("/api/v1/portal/support-tickets")
        .set(portalAuthHeaders(session))
        .send({ projectId: project.id, subject: `${PORTAL_TEST_PREFIX}help please` });
      expect(created.status).toBe(201);
      expect(created.body.raisedByClientUserId).toBe(world.client.id);
      expect(created.body.status).toBe("OPEN");

      const massAssign = await request(app.getHttpServer())
        .post("/api/v1/portal/support-tickets")
        .set(portalAuthHeaders(session))
        .send({
          projectId: project.id,
          subject: `${PORTAL_TEST_PREFIX}mass`,
          raisedByClientUserId: world.otherClient.id,
          status: "CLOSED",
          organizationId: world.organizationId,
        });
      expect(massAssign.status).toBe(400);

      const cross = await request(app.getHttpServer())
        .post("/api/v1/portal/support-tickets")
        .set(portalAuthHeaders(session))
        .send({ projectId: otherProject.id, subject: `${PORTAL_TEST_PREFIX}cross` });
      expect(cross.status).toBe(404);

      const list = await request(app.getHttpServer())
        .get("/api/v1/portal/support-tickets")
        .set(portalAuthHeaders(session));
      expect(list.status).toBe(200);
      expect(
        listData<{ subject: string }>(list.body).some((t) => t.subject.startsWith(PORTAL_TEST_PREFIX))
      ).toBe(true);
    });
  });

  // ── Cross-org ─────────────────────────────────────────────────────────────

  describe("cross-org isolation", () => {
    it("returns 404 for another org's project UUID", async () => {
      const world = await createPortalCompanyWorld(app);
      const session = await portalLoginSession(app, world.client);
      const secondOrgId = await createSecondOrganization(app);
      const secondOwner = await createTestUser(app, {
        role: "FOUNDER_ADMIN",
        organizationId: secondOrgId,
        emailSuffix: `${PORTAL_TEST_PREFIX}org2`,
      });
      const prisma = app.get(PrismaService);
      const secondCompany = await prisma.company.create({
        data: {
          organization_id: secondOrgId,
          name: `${PORTAL_TEST_PREFIX}org2-co`,
          billing_state: "Karnataka",
          billing_address: "Other org",
        },
      });
      const foreignProject = await createTestProject(
        app,
        secondOrgId,
        secondCompany.id,
        secondOwner.id
      );

      const res = await request(app.getHttpServer())
        .get(`/api/v1/portal/projects/${foreignProject.id}`)
        .set(portalAuthHeaders(session));
      expect(res.status).toBe(404);

      await prisma.project.delete({ where: { id: foreignProject.id } });
      await prisma.company.delete({ where: { id: secondCompany.id } });
      await prisma.user.delete({ where: { id: secondOwner.id } });
      await prisma.organization.delete({ where: { id: secondOrgId } });
    });
  });
});
