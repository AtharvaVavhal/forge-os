import type { INestApplication } from "@nestjs/common";
import { InvoiceStatus, ProposalStatus, DomainEventStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { cleanupTestFixtures } from "./support/fixtures";
import {
  authHeaders,
  cleanupCrmFixtures,
  createTestCompany,
  createTestContact,
  listData,
  loginSession,
  CRM_TEST_PREFIX,
} from "./support/crm";
import { cleanupSalesFixtures, createTestLineItem, createTestTaxRate } from "./support/sales";
import { cleanupProjectsFixtures } from "./support/projects";
import {
  cleanupFinanceFixtures,
  createTestPayment,
  signWebhookPayload,
} from "./support/finance";
import {
  createTestClientUser,
  portalAuthHeaders,
  portalLoginSession,
  PORTAL_TEST_PREFIX,
} from "./support/portal";
import { B8_TEST_PREFIX, drainOutbox, processOutboxEvent } from "./support/integration";
import { PrismaService } from "../src/database/prisma.service";

/**
 * B8 Integration lifecycle E2E — Lead → … → Payment (Document 5 §13–14).
 */
describe("B8 Integration lifecycle (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    const safe = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch {
        /* best-effort */
      }
    };
    await safe(() =>
      prisma.notification.deleteMany({
        where: { type: { in: ["deal.won", "proposal.accepted_ready_for_won", "proposal.sent"] } },
      })
    );
    await safe(() =>
      prisma.domainEvent.deleteMany({
        where: { type: { in: ["DealWon", "ProposalAccepted", "ProposalSent"] } },
      })
    );
    await safe(() =>
      prisma.invitationToken.deleteMany({
        where: { email: { contains: PORTAL_TEST_PREFIX } },
      })
    );
    await safe(() =>
      prisma.supportTicket.deleteMany({ where: { subject: { startsWith: B8_TEST_PREFIX } } })
    );
    await safe(() => cleanupFinanceFixtures(app));
    await safe(() => cleanupProjectsFixtures(app));
    await safe(() => cleanupSalesFixtures(app));
    await safe(() => cleanupCrmFixtures(app));
    await safe(() => cleanupTestFixtures(app));
    await app.close();
  });

  it("runs the full Lead → Proposal → Portal accept → Deal WON → outbox → invoice → payment lifecycle", async () => {
    const prisma = app.get(PrismaService);
    const founder = await loginSession(app, "FOUNDER_ADMIN");
    const finance = await loginSession(app, "FINANCE");
    const sales = await loginSession(app, "SALES");

    // Company + contact (finance-prefixed company for cleanup compatibility)
    const company = await createTestCompany(app, founder.organizationId);
    const contact = await createTestContact(app, founder.organizationId, {
      name: `${CRM_TEST_PREFIX}${B8_TEST_PREFIX}contact`,
      email: `${PORTAL_TEST_PREFIX}lifecycle-${Date.now()}@forge.local`,
      companyId: company.id,
    });

    // Lead → QUALIFIED → convert
    const leadCreate = await request(app.getHttpServer())
      .post("/api/v1/leads")
      .set(authHeaders(sales))
      .send({
        source: "REFERRAL",
        companyId: company.id,
        contactId: contact.id,
        notes: `${CRM_TEST_PREFIX}${B8_TEST_PREFIX}lead`,
      });
    expect(leadCreate.status).toBe(201);
    const leadId = leadCreate.body.id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/leads/${leadId}/transition`)
      .set(authHeaders(sales))
      .send({ to: "CONTACTED" })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/leads/${leadId}/transition`)
      .set(authHeaders(sales))
      .send({ to: "QUALIFIED" })
      .expect(200);

    const converted = await request(app.getHttpServer())
      .post(`/api/v1/leads/${leadId}/convert`)
      .set(authHeaders(sales))
      .send({ title: `${CRM_TEST_PREFIX}${B8_TEST_PREFIX}deal`, estimatedValue: "50000.00" });
    expect(converted.status).toBe(200);
    const dealId = converted.body.deal.id as string;
    expect(converted.body.deal.companyId).toBe(company.id);

    // Tax rate + proposal + lines
    const taxRate = await createTestTaxRate(app, sales.organizationId);
    const proposalCreate = await request(app.getHttpServer())
      .post("/api/v1/proposals")
      .set(authHeaders(sales))
      .send({ dealId, terms: `${B8_TEST_PREFIX}terms` });
    expect(proposalCreate.status).toBe(201);
    const proposalId = proposalCreate.body.id as string;

    const linesPut = await request(app.getHttpServer())
      .put(`/api/v1/proposals/${proposalId}/line-items`)
      .set(authHeaders(sales))
      .send({
        lines: [
          {
            description: `${B8_TEST_PREFIX}Website build`,
            quantity: "1.00",
            unitPrice: "50000.00",
            taxRateId: taxRate.id,
            sortOrder: 0,
          },
        ],
      });
    expect(linesPut.status).toBe(200);

    const sent = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${proposalId}/send`)
      .set(authHeaders(sales));
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe(ProposalStatus.SENT);

    const sentEvent = await prisma.domainEvent.findFirst({
      where: { type: "ProposalSent", aggregate_id: proposalId },
    });
    expect(sentEvent).toBeTruthy();

    // Portal client — same email as contact so DealWon invitation is skipped (user exists)
    const clientFixture = await createTestClientUser(app, {
      companyId: company.id,
      organizationId: founder.organizationId,
      emailSuffix: "lifecycle",
    });
    // Align contact email with ClientUser for invitation idempotency assertion
    await prisma.contact.update({
      where: { id: contact.id },
      data: { email: clientFixture.email },
    });
    const portal = await portalLoginSession(app, clientFixture);

    const portalGet = await request(app.getHttpServer())
      .get(`/api/v1/portal/proposals/${proposalId}`)
      .set(portalAuthHeaders(portal));
    expect(portalGet.status).toBe(200);
    expect(portalGet.body.status).toBe(ProposalStatus.VIEWED);

    const accept = await request(app.getHttpServer())
      .post(`/api/v1/portal/proposals/${proposalId}/accept`)
      .set(portalAuthHeaders(portal));
    expect(accept.status).toBe(200);
    expect(accept.body.status).toBe(ProposalStatus.ACCEPTED);
    expect(accept.body.acceptedAt).toBeTruthy();

    const acceptedEvent = await prisma.domainEvent.findFirst({
      where: { type: "ProposalAccepted", aggregate_id: proposalId },
    });
    expect(acceptedEvent).toBeTruthy();

    // CRITICAL: Deal is NOT auto-Won
    const dealAfterAccept = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(dealAfterAccept.stage).not.toBe("WON");

    await drainOutbox(app);
    const readyNotify = await prisma.notification.findFirst({
      where: { type: "proposal.accepted_ready_for_won", recipient_id: dealAfterAccept.owner_id },
    });
    expect(readyNotify).toBeTruthy();

    // Staff transitions Deal → WON
    const won = await request(app.getHttpServer())
      .post(`/api/v1/deals/${dealId}/transition`)
      .set(authHeaders(sales))
      .send({ to: "WON" });
    expect(won.status).toBe(200);
    expect(won.body.stage).toBe("WON");

    const project = await prisma.project.findFirst({
      where: { deal_id: dealId, organization_id: founder.organizationId },
    });
    expect(project).toBeTruthy();
    expect(project!.accepted_proposal_id).toBe(proposalId);
    expect(project!.company_id).toBe(company.id);
    expect(project!.phase).toBe("PLANNING");
    expect(project!.status).toBe("ACTIVE");

    const dealWonEvent = await prisma.domainEvent.findFirst({
      where: { type: "DealWon", aggregate_id: dealId },
    });
    expect(dealWonEvent).toBeTruthy();
    expect(dealWonEvent!.status).toBe(DomainEventStatus.PENDING);

    // Process outbox (template no-op, draft invoice, invitation, notify)
    const drained = await drainOutbox(app);
    expect(drained.processed).toBeGreaterThanOrEqual(1);

    const dealWonAfter = await prisma.domainEvent.findFirst({
      where: { type: "DealWon", aggregate_id: dealId },
    });
    expect(dealWonAfter!.status).toBe(DomainEventStatus.PROCESSED);

    const draftInvoice = await prisma.invoice.findFirst({
      where: { project_id: project!.id, status: InvoiceStatus.DRAFT },
      include: { line_items: true },
    });
    expect(draftInvoice).toBeTruthy();
    expect(draftInvoice!.line_items.length).toBe(1);
    expect(draftInvoice!.line_items[0]!.description).toContain("Website build");

    const invite = await prisma.invitationToken.findFirst({
      where: {
        organization_id: founder.organizationId,
        company_id: company.id,
        email: contact.email!.toLowerCase(),
        scope: "CLIENT",
      },
    });
    // ClientUser already exists for portal login — invitation should be skipped
    expect(invite).toBeNull();

    const wonNotify = await prisma.notification.findFirst({
      where: { type: "deal.won", recipient_id: dealAfterAccept.owner_id },
    });
    expect(wonNotify).toBeTruthy();

    // Send invoice so it becomes portal-visible / payable
    const sentInvoice = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${draftInvoice!.id}/send`)
      .set({
        ...authHeaders(finance),
        "Idempotency-Key": randomUUID(),
      });
    expect(sentInvoice.status).toBe(200);
    expect(sentInvoice.body.status).toBe(InvoiceStatus.SENT);

    const portalInvoices = await request(app.getHttpServer())
      .get("/api/v1/portal/invoices")
      .set(portalAuthHeaders(portal));
    expect(portalInvoices.status).toBe(200);
    expect(listData(portalInvoices.body).some((i) => i.id === draftInvoice!.id)).toBe(true);

    // Pay without CSRF fails
    const payNoCsrf = await request(app.getHttpServer())
      .post(`/api/v1/portal/invoices/${draftInvoice!.id}/pay`)
      .set({ Cookie: `portal_session=${portal.cookie}` });
    expect(payNoCsrf.status).toBe(403);

    // Pay with CSRF — may 503 if Razorpay unconfigured; either way invoice not auto-paid
    const pay = await request(app.getHttpServer())
      .post(`/api/v1/portal/invoices/${draftInvoice!.id}/pay`)
      .set(portalAuthHeaders(portal));
    expect([200, 503]).toContain(pay.status);

    const invoiceBeforeWebhook = await prisma.invoice.findUniqueOrThrow({
      where: { id: draftInvoice!.id },
    });
    expect(invoiceBeforeWebhook.status).toBe(InvoiceStatus.SENT);

    // Simulate Razorpay completion via PENDING payment + webhook (B5 authority)
    const orderId = `order_b8_${randomUUID().slice(0, 8)}`;
    const paymentId = `pay_b8_${randomUUID().slice(0, 8)}`;
    await createTestPayment(app, founder.organizationId, draftInvoice!.id, null, {
      amount: String(draftInvoice!.amount),
      status: "PENDING",
      method: "RAZORPAY",
      razorpayOrderId: orderId,
    });

    const eventId = `evt_b8_${randomUUID().slice(0, 8)}`;
    const webhookBody = JSON.stringify({
      event: "payment.captured",
      id: eventId,
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount: Math.round(Number(draftInvoice!.amount) * 100),
            currency: "INR",
            status: "captured",
          },
        },
      },
    });
    const signature = signWebhookPayload(webhookBody);
    const webhook = await request(app.getHttpServer())
      .post("/api/v1/webhooks/razorpay")
      .set("x-razorpay-signature", signature)
      .set("Content-Type", "application/json")
      .send(webhookBody);
    expect(webhook.status).toBe(200);

    const invoiceAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: draftInvoice!.id } });
    expect(Number(invoiceAfter.paid_amount)).toBeGreaterThan(0);
    expect([InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID]).toContain(invoiceAfter.status);

    // Duplicate webhook is safe
    const dup = await request(app.getHttpServer())
      .post("/api/v1/webhooks/razorpay")
      .set("x-razorpay-signature", signature)
      .set("Content-Type", "application/json")
      .send(webhookBody);
    expect(dup.status).toBe(200);

    const auditWon = await prisma.auditLog.findFirst({
      where: { entity_id: dealId, action: "deal.transitioned" },
      orderBy: { created_at: "desc" },
    });
    expect(auditWon).toBeTruthy();

    const auditAccepted = await prisma.auditLog.findFirst({
      where: { entity_id: proposalId, action: "proposal.accepted" },
    });
    expect(auditAccepted).toBeTruthy();
  });

  it("does not create duplicate Project or DealWon event on repeated WON", async () => {
    const sales = await loginSession(app, "SALES");
    const company = await createTestCompany(app, sales.organizationId);
    const prisma = app.get(PrismaService);

    const deal = await prisma.deal.create({
      data: {
        organization_id: sales.organizationId,
        title: `${CRM_TEST_PREFIX}${B8_TEST_PREFIX}dup-won`,
        estimated_value: "1000.00",
        owner_id: sales.userId,
        company_id: company.id,
        stage: "NEGOTIATION",
      },
    });
    await prisma.proposal.create({
      data: {
        organization_id: sales.organizationId,
        deal_id: deal.id,
        version: 1,
        status: "ACCEPTED",
        created_by: sales.userId,
        accepted_at: new Date(),
      },
    });

    const first = await request(app.getHttpServer())
      .post(`/api/v1/deals/${deal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "WON" });
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .post(`/api/v1/deals/${deal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "WON" });
    expect([200, 409]).toContain(second.status);

    const projects = await prisma.project.findMany({ where: { deal_id: deal.id } });
    expect(projects.length).toBe(1);
    const events = await prisma.domainEvent.findMany({
      where: { type: "DealWon", aggregate_id: deal.id },
    });
    expect(events.length).toBe(1);
  });

  it("processes DealWon idempotently when drained twice", async () => {
    const sales = await loginSession(app, "SALES");
    const company = await createTestCompany(app, sales.organizationId);
    const taxRate = await createTestTaxRate(app, sales.organizationId);
    const prisma = app.get(PrismaService);

    const deal = await prisma.deal.create({
      data: {
        organization_id: sales.organizationId,
        title: `${CRM_TEST_PREFIX}${B8_TEST_PREFIX}idem-worker`,
        estimated_value: "2000.00",
        owner_id: sales.userId,
        company_id: company.id,
        stage: "NEGOTIATION",
      },
    });
    const proposal = await prisma.proposal.create({
      data: {
        organization_id: sales.organizationId,
        deal_id: deal.id,
        version: 1,
        status: "ACCEPTED",
        created_by: sales.userId,
        accepted_at: new Date(),
      },
    });
    await createTestLineItem(app, sales.organizationId, proposal.id, {
      description: `${B8_TEST_PREFIX}line`,
      unitPrice: "2000.00",
    });
    await prisma.proposalLineItem.updateMany({
      where: { proposal_id: proposal.id },
      data: { tax_rate_id: taxRate.id },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/deals/${deal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "WON" })
      .expect(200);

    const project = await prisma.project.findFirstOrThrow({ where: { deal_id: deal.id } });
    await drainOutbox(app);
    await drainOutbox(app);

    const invoices = await prisma.invoice.findMany({
      where: { project_id: project.id, status: InvoiceStatus.DRAFT },
    });
    expect(invoices.length).toBe(1);
  });

  it("records failure and retries successfully for a DealWon consumer error", async () => {
    const sales = await loginSession(app, "SALES");
    const company = await createTestCompany(app, sales.organizationId);
    const prisma = app.get(PrismaService);

    const deal = await prisma.deal.create({
      data: {
        organization_id: sales.organizationId,
        title: `${CRM_TEST_PREFIX}${B8_TEST_PREFIX}retry`,
        estimated_value: "3000.00",
        owner_id: sales.userId,
        company_id: company.id,
        stage: "NEGOTIATION",
      },
    });
    const proposal = await prisma.proposal.create({
      data: {
        organization_id: sales.organizationId,
        deal_id: deal.id,
        version: 1,
        status: "ACCEPTED",
        created_by: sales.userId,
        accepted_at: new Date(),
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/deals/${deal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "WON" })
      .expect(200);

    const event = await prisma.domainEvent.findFirstOrThrow({
      where: { type: "DealWon", aggregate_id: deal.id },
    });

    // Corrupt payload to force one failure, then restore for retry.
    await prisma.domainEvent.update({
      where: { id: event.id },
      data: {
        payload: { dealId: deal.id },
        status: DomainEventStatus.PENDING,
        attempts: 0,
      },
    });

    const failResult = await processOutboxEvent(app, event.id);
    expect(["skipped", "failed"]).toContain(failResult);

    const afterFail = await prisma.domainEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(afterFail.status).toBe(DomainEventStatus.PENDING);
    expect(afterFail.attempts).toBeGreaterThanOrEqual(1);
    expect(afterFail.last_error).toBeTruthy();

    const project = await prisma.project.findFirstOrThrow({ where: { deal_id: deal.id } });
    await prisma.domainEvent.update({
      where: { id: event.id },
      data: {
        payload: {
          dealId: deal.id,
          projectId: project.id,
          acceptedProposalId: proposal.id,
          companyId: company.id,
          ownerId: sales.userId,
        },
        status: DomainEventStatus.PENDING,
        // Force due immediately (backoff uses updated_at + attempts)
        attempts: 1,
        last_error: "forced",
      },
    });
    // Bump updated_at into the past for backoff
    await prisma.$executeRaw`
      UPDATE domain_events SET updated_at = NOW() - INTERVAL '1 hour' WHERE id = ${event.id}::uuid
    `;

    await drainOutbox(app);
    const recovered = await prisma.domainEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(recovered.status).toBe(DomainEventStatus.PROCESSED);
  });

  describe("security", () => {
    it("rejects cross-plane tokens and cross-company portal access", async () => {
      const sales = await loginSession(app, "SALES");
      const companyA = await createTestCompany(app, sales.organizationId);
      const companyB = await createTestCompany(app, sales.organizationId);
      const clientA = await createTestClientUser(app, {
        companyId: companyA.id,
        organizationId: sales.organizationId,
        emailSuffix: "sec-a",
      });
      const clientB = await createTestClientUser(app, {
        companyId: companyB.id,
        organizationId: sales.organizationId,
        emailSuffix: "sec-b",
      });
      const portalA = await portalLoginSession(app, clientA);
      const portalB = await portalLoginSession(app, clientB);

      const prisma = app.get(PrismaService);
      const dealB = await prisma.deal.create({
        data: {
          organization_id: sales.organizationId,
          title: `${CRM_TEST_PREFIX}${B8_TEST_PREFIX}sec-deal`,
          estimated_value: "1.00",
          owner_id: sales.userId,
          company_id: companyB.id,
        },
      });
      const proposalB = await prisma.proposal.create({
        data: {
          organization_id: sales.organizationId,
          deal_id: dealB.id,
          version: 1,
          status: "SENT",
          created_by: sales.userId,
          sent_at: new Date(),
        },
      });

      // Internal JWT on portal
      const internalOnPortal = await request(app.getHttpServer())
        .get("/api/v1/portal/me")
        .set(authHeaders(sales));
      expect(internalOnPortal.status).toBe(401);

      // Portal JWT on internal
      const portalOnInternal = await request(app.getHttpServer())
        .get("/api/v1/companies")
        .set(portalAuthHeaders(portalA));
      expect(portalOnInternal.status).toBe(401);

      // Client A cannot see Client B proposal
      const cross = await request(app.getHttpServer())
        .get(`/api/v1/portal/proposals/${proposalB.id}`)
        .set(portalAuthHeaders(portalA));
      expect(cross.status).toBe(404);

      // Body injection on support ticket
      const projectB = await prisma.project.create({
        data: {
          organization_id: sales.organizationId,
          name: `${PORTAL_TEST_PREFIX}sec-proj`,
          company_id: companyB.id,
          owner_id: sales.userId,
        },
      });
      const inject = await request(app.getHttpServer())
        .post("/api/v1/portal/support-tickets")
        .set(portalAuthHeaders(portalA))
        .send({
          projectId: projectB.id,
          subject: `${B8_TEST_PREFIX}inject`,
          raisedByClientUserId: clientB.id,
        });
      expect([400, 404]).toContain(inject.status);

      void portalB;
    });
  });
});
