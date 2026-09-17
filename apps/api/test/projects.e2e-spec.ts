import type { INestApplication } from "@nestjs/common";
import { MilestoneStatus, ProjectPhase, ProjectStatus, TaskStatus } from "@prisma/client";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import {
  createSecondOrganization,
  createTestUser,
  cleanupTestFixtures,
} from "./support/fixtures";
import {
  authHeaders,
  cleanupProjectsFixtures,
  createTestCompany,
  createTestMilestone,
  createTestProject,
  createTestTask,
  createTestTimeEntry,
  listData,
  loginSession,
  PROJECTS_TEST_PREFIX,
  type AuthSession,
} from "./support/projects";
import { PrismaService } from "../src/database/prisma.service";

describe("Projects Module (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let founder: AuthSession;
  let operations: AuthSession;
  let sales: AuthSession;
  let finance: AuthSession;
  let teamMember: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    founder = await loginSession(app, "FOUNDER_ADMIN");
    operations = await loginSession(app, "OPERATIONS");
    sales = await loginSession(app, "SALES");
    finance = await loginSession(app, "FINANCE");
    teamMember = await loginSession(app, "TEAM_MEMBER");
  });

  afterAll(async () => {
    await cleanupProjectsFixtures(app);
    await cleanupTestFixtures(app);
    await app.close();
  });

  describe("1. Authentication & RBAC", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/projects");
      expect(response.status).toBe(401);
    });

    it("SALES can read projects but cannot create or manage projects (403)", async () => {
      const readRes = await request(app.getHttpServer())
        .get("/api/v1/projects")
        .set(authHeaders(sales));
      expect(readRes.status).toBe(200);

      const createRes = await request(app.getHttpServer())
        .post("/api/v1/projects")
        .set(authHeaders(sales))
        .send({ name: `${PROJECTS_TEST_PREFIX}Fail`, companyId: "11111111-1111-1111-1111-111111111111" });
      expect(createRes.status).toBe(403);
      expect(createRes.body.error.code).toBe("FORBIDDEN_PERMISSION");
    });

    it("FINANCE can read projects but cannot create or manage projects (403)", async () => {
      const readRes = await request(app.getHttpServer())
        .get("/api/v1/projects")
        .set(authHeaders(finance));
      expect(readRes.status).toBe(200);

      const createRes = await request(app.getHttpServer())
        .post("/api/v1/projects")
        .set(authHeaders(finance))
        .send({ name: `${PROJECTS_TEST_PREFIX}Fail`, companyId: "11111111-1111-1111-1111-111111111111" });
      expect(createRes.status).toBe(403);
    });

    it("FOUNDER_ADMIN can read projects and project templates", async () => {
      const readRes = await request(app.getHttpServer())
        .get("/api/v1/projects")
        .set(authHeaders(founder));
      expect(readRes.status).toBe(200);

      const tplRes = await request(app.getHttpServer())
        .get("/api/v1/project-templates")
        .set(authHeaders(founder));
      expect(tplRes.status).toBe(200);
      expect(Array.isArray(tplRes.body)).toBe(true);
    });
  });

  describe("2. Project Lifecycle & CRUD", () => {
    it("OPERATIONS creates project; defaults to ACTIVE status and PLANNING phase", async () => {
      const company = await createTestCompany(app, operations.organizationId);

      const response = await request(app.getHttpServer())
        .post("/api/v1/projects")
        .set(authHeaders(operations))
        .send({
          name: `${PROJECTS_TEST_PREFIX}Alpha Web App`,
          companyId: company.id,
          deadline: "2026-12-31",
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe(`${PROJECTS_TEST_PREFIX}Alpha Web App`);
      expect(response.body.status).toBe("ACTIVE");
      expect(response.body.phase).toBe("PLANNING");
      expect(response.body.ownerId).toBe(operations.userId);
      expect(response.body.companyId).toBe(company.id);
    });

    it("GET /projects/:id returns project and derived health read model", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId, {
        status: ProjectStatus.AT_RISK,
        deadline: new Date("2026-10-01"),
      });

      // Add one overdue milestone
      await createTestMilestone(app, operations.organizationId, project.id, {
        dueDate: new Date("2020-01-01"),
        status: MilestoneStatus.IN_PROGRESS,
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}`)
        .set(authHeaders(operations));

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(project.id);
      expect(response.body.health).toBeDefined();
      expect(response.body.health.atRisk).toBe(true);
      expect(response.body.health.overdueMilestones).toBe(1);
      expect(typeof response.body.health.deadlineProximityDays).toBe("number");
    });

    it("PATCH /projects/:id updates name, deadline, owner; arbitrary status PATCH is rejected", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId);

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}`)
        .set(authHeaders(operations))
        .send({ name: `${PROJECTS_TEST_PREFIX}Renamed`, deadline: "2027-01-01" });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe(`${PROJECTS_TEST_PREFIX}Renamed`);

      // Attempting to PATCH status directly is rejected by forbidNonWhitelisted
      const badPatch = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}`)
        .set(authHeaders(operations))
        .send({ status: "COMPLETED" });
      expect(badPatch.status).toBe(400);
    });

    it("no delete/archive endpoint exists (404)", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId);

      const delRes = await request(app.getHttpServer())
        .delete(`/api/v1/projects/${project.id}`)
        .set(authHeaders(operations));
      expect(delRes.status).toBe(404);
    });

    it("mass assignment & unknown fields are rejected (400)", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const response = await request(app.getHttpServer())
        .post("/api/v1/projects")
        .set(authHeaders(operations))
        .send({
          name: `${PROJECTS_TEST_PREFIX}Unknown`,
          companyId: company.id,
          organizationId: "11111111-1111-1111-1111-111111111111",
        });
      expect(response.status).toBe(400);
    });
  });

  describe("3. Project Status State Machine", () => {
    it("valid transitions: ACTIVE -> ON_HOLD -> ACTIVE -> AT_RISK -> ACTIVE -> CANCELLED", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId);

      // ACTIVE -> ON_HOLD
      const res1 = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/status`)
        .set(authHeaders(operations))
        .send({ to: "ON_HOLD" });
      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe("ON_HOLD");

      // ON_HOLD -> ACTIVE
      const res2 = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/status`)
        .set(authHeaders(operations))
        .send({ to: "ACTIVE" });
      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe("ACTIVE");

      // ACTIVE -> AT_RISK
      const res3 = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/status`)
        .set(authHeaders(operations))
        .send({ to: "AT_RISK" });
      expect(res3.status).toBe(200);
      expect(res3.body.status).toBe("AT_RISK");

      // AT_RISK -> ACTIVE
      const res4 = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/status`)
        .set(authHeaders(operations))
        .send({ to: "ACTIVE" });
      expect(res4.status).toBe(200);
      expect(res4.body.status).toBe("ACTIVE");

      // ACTIVE -> CANCELLED
      const res5 = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/status`)
        .set(authHeaders(operations))
        .send({ to: "CANCELLED" });
      expect(res5.status).toBe(200);
      expect(res5.body.status).toBe("CANCELLED");

      // CANCELLED is terminal: CANCELLED -> ACTIVE fails with 409
      const res6 = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/status`)
        .set(authHeaders(operations))
        .send({ to: "ACTIVE" });
      expect(res6.status).toBe(409);
      expect(res6.body.error.code).toBe("PROJECT_STATUS_TERMINAL");
    });
  });

  describe("4. Project Phase State Machine & Gating", () => {
    it("linear progression: PLANNING -> DESIGN -> DEVELOPMENT", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId, {
        phase: ProjectPhase.PLANNING,
      });

      const res1 = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/phase`)
        .set(authHeaders(operations))
        .send({ to: "DESIGN" });
      expect(res1.status).toBe(200);
      expect(res1.body.phase).toBe("DESIGN");

      const res2 = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/phase`)
        .set(authHeaders(operations))
        .send({ to: "DEVELOPMENT" });
      expect(res2.status).toBe(200);
      expect(res2.body.phase).toBe("DEVELOPMENT");
    });

    it("phase regression is rejected (409)", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId, {
        phase: ProjectPhase.DEVELOPMENT,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/phase`)
        .set(authHeaders(operations))
        .send({ to: "DESIGN" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("PROJECT_INVALID_PHASE_REGRESSION");
    });

    it("skipping a phase without override fails with 409", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId, {
        phase: ProjectPhase.PLANNING,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/phase`)
        .set(authHeaders(operations))
        .send({ to: "DEVELOPMENT" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("PHASE_SKIP_REQUIRES_OVERRIDE");
    });

    it("skipping a phase with override succeeds and audits Tier A", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId, {
        phase: ProjectPhase.PLANNING,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/phase`)
        .set(authHeaders(operations))
        .send({ to: "DEVELOPMENT", override: true, overrideReason: "Client provided designs upfront" });
      expect(res.status).toBe(200);
      expect(res.body.phase).toBe("DEVELOPMENT");

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: {
          organization_id: operations.organizationId,
          action: "project.phase_overridden",
          entity_id: project.id,
        },
      });
      expect(audit).toBeTruthy();
    });

    it("gate failure: CLIENT_REVIEW -> DEPLOYMENT is blocked without approved gating milestone (422)", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId, {
        phase: ProjectPhase.CLIENT_REVIEW,
      });

      // Milestone requires approval but approved_at is null
      await createTestMilestone(app, operations.organizationId, project.id, {
        name: `${PROJECTS_TEST_PREFIX}UAT Approval`,
        requiresClientApproval: true,
        approvedAt: null,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/phase`)
        .set(authHeaders(operations))
        .send({ to: "DEPLOYMENT" });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("PHASE_GATE_FAILED");
    });

    it("gate success: CLIENT_REVIEW -> DEPLOYMENT succeeds once gating milestone is approved", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId, {
        phase: ProjectPhase.CLIENT_REVIEW,
      });

      await createTestMilestone(app, operations.organizationId, project.id, {
        name: `${PROJECTS_TEST_PREFIX}Approved Gating`,
        requiresClientApproval: true,
        approvedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/phase`)
        .set(authHeaders(operations))
        .send({ to: "DEPLOYMENT" });
      expect(res.status).toBe(200);
      expect(res.body.phase).toBe("DEPLOYMENT");
    });
  });

  describe("5. Handover Checklist & Project Completion", () => {
    it("update handover checklist sets doneAt and doneBy, and records audit on completion", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId);

      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/projects/${project.id}/handover-checklist`)
        .set(authHeaders(operations))
        .send({
          items: [
            { item: "Credentials handed over", done: true },
            { item: "DNS updated", done: false },
          ],
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.handoverChecklist).toHaveLength(2);
      expect(patchRes.body.handoverChecklist[0].done).toBe(true);
      expect(patchRes.body.handoverChecklist[0].doneBy).toBe(operations.userId);
      expect(patchRes.body.handoverChecklist[1].done).toBe(false);

      // Verify audit
      const audit = await prisma.auditLog.findFirst({
        where: {
          organization_id: operations.organizationId,
          action: "project.handover_item_completed",
          entity_id: project.id,
        },
      });
      expect(audit).toBeTruthy();
    });

    it("complete project blocked when handover checklist is incomplete (422)", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId, {
        handoverChecklist: [
          { item: "Final backup", done: false, done_at: null, done_by: null },
        ],
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/complete`)
        .set(authHeaders(operations));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("HANDOVER_CHECKLIST_INCOMPLETE");
    });

    it("complete project succeeds when checklist is 100% done; sets status & phase COMPLETED + completed_at", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId, {
        handoverChecklist: [
          { item: "All done item 1", done: true, done_at: new Date().toISOString(), done_by: operations.userId },
        ],
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/complete`)
        .set(authHeaders(operations));

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("COMPLETED");
      expect(res.body.phase).toBe("COMPLETED");
      expect(res.body.completedAt).toBeTruthy();

      // Audit recorded
      const audit = await prisma.auditLog.findFirst({
        where: {
          organization_id: operations.organizationId,
          action: "project.completed",
          entity_id: project.id,
        },
      });
      expect(audit).toBeTruthy();
    });
  });

  describe("6. Project Templates", () => {
    it("GET /project-templates returns list of configured template ids and names", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/project-templates")
        .set(authHeaders(sales));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].id).toBeDefined();
      expect(res.body[0].name).toBeDefined();
    });
  });

  describe("7. Milestones", () => {
    it("create and list milestones for project", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId);

      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/milestones`)
        .set(authHeaders(operations))
        .send({
          name: `${PROJECTS_TEST_PREFIX}Phase 1 Milestone`,
          requiresClientApproval: true,
          dueDate: "2026-11-01",
          sortOrder: 1,
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.name).toBe(`${PROJECTS_TEST_PREFIX}Phase 1 Milestone`);
      expect(createRes.body.status).toBe("PENDING");

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/projects/${project.id}/milestones`)
        .set(authHeaders(operations));
      expect(listRes.status).toBe(200);
      expect(listData(listRes.body).some((m: { id: string }) => m.id === createRes.body.id)).toBe(true);
    });

    it("milestone transition lifecycle and revert reason enforcement", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId);
      const milestone = await createTestMilestone(app, operations.organizationId, project.id, {
        status: MilestoneStatus.PENDING,
      });

      // PENDING -> IN_PROGRESS
      const step1 = await request(app.getHttpServer())
        .post(`/api/v1/milestones/${milestone.id}/transition`)
        .set(authHeaders(operations))
        .send({ to: "IN_PROGRESS" });
      expect(step1.status).toBe(200);
      expect(step1.body.status).toBe("IN_PROGRESS");

      // IN_PROGRESS -> AWAITING_APPROVAL
      const step2 = await request(app.getHttpServer())
        .post(`/api/v1/milestones/${milestone.id}/transition`)
        .set(authHeaders(operations))
        .send({ to: "AWAITING_APPROVAL" });
      expect(step2.status).toBe(200);
      expect(step2.body.status).toBe("AWAITING_APPROVAL");

      // AWAITING_APPROVAL -> COMPLETED
      const step3 = await request(app.getHttpServer())
        .post(`/api/v1/milestones/${milestone.id}/transition`)
        .set(authHeaders(operations))
        .send({ to: "COMPLETED" });
      expect(step3.status).toBe(200);
      expect(step3.body.status).toBe("COMPLETED");

      // Revert without reason fails with 400
      const badRevert = await request(app.getHttpServer())
        .post(`/api/v1/milestones/${milestone.id}/transition`)
        .set(authHeaders(operations))
        .send({ to: "AWAITING_APPROVAL" });
      expect(badRevert.status).toBe(400);
      expect(badRevert.body.error.code).toBe("MILESTONE_REVERT_REASON_REQUIRED");

      // Revert with reason succeeds
      const goodRevert = await request(app.getHttpServer())
        .post(`/api/v1/milestones/${milestone.id}/transition`)
        .set(authHeaders(operations))
        .send({ to: "AWAITING_APPROVAL", reason: "Client requested changes" });
      expect(goodRevert.status).toBe(200);
      expect(goodRevert.body.status).toBe("AWAITING_APPROVAL");

      // Verify revert audit
      const audit = await prisma.auditLog.findFirst({
        where: {
          organization_id: operations.organizationId,
          action: "milestone.reverted",
          entity_id: milestone.id,
        },
      });
      expect(audit).toBeTruthy();
    });
  });

  describe("8. Tasks", () => {
    it("create task, update allowed fields, and verify blocker flag", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId);

      const task1 = await createTestTask(app, operations.organizationId, project.id, {
        title: `${PROJECTS_TEST_PREFIX}Blocker Task`,
      });

      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set(authHeaders(operations))
        .send({
          title: `${PROJECTS_TEST_PREFIX}Dependent Task`,
          priority: "HIGH",
          blockedByTaskId: task1.id,
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.title).toBe(`${PROJECTS_TEST_PREFIX}Dependent Task`);
      expect(createRes.body.priority).toBe("HIGH");
      expect(createRes.body.blockedByTaskId).toBe(task1.id);

      // Self-blocking is rejected with 400
      const selfBlock = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${createRes.body.id}`)
        .set(authHeaders(operations))
        .send({ blockedByTaskId: createRes.body.id });
      expect(selfBlock.status).toBe(400);
      expect(selfBlock.body.error.code).toBe("TASK_CANNOT_BLOCK_SELF");
    });

    it("task transition: TODO -> IN_PROGRESS -> IN_REVIEW -> DONE and reopen (DONE -> TODO)", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId);
      const task = await createTestTask(app, operations.organizationId, project.id, {
        status: TaskStatus.TODO,
      });

      // Invalid jump directly to DONE is rejected with 409
      const badJump = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${task.id}/transition`)
        .set(authHeaders(operations))
        .send({ to: "DONE" });
      expect(badJump.status).toBe(409);
      expect(badJump.body.error.code).toBe("TASK_INVALID_TRANSITION");

      // Progression
      await request(app.getHttpServer())
        .post(`/api/v1/tasks/${task.id}/transition`)
        .set(authHeaders(operations))
        .send({ to: "IN_PROGRESS" });

      await request(app.getHttpServer())
        .post(`/api/v1/tasks/${task.id}/transition`)
        .set(authHeaders(operations))
        .send({ to: "IN_REVIEW" });

      const doneRes = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${task.id}/transition`)
        .set(authHeaders(operations))
        .send({ to: "DONE" });
      expect(doneRes.status).toBe(200);
      expect(doneRes.body.status).toBe("DONE");

      // Reopen DONE -> TODO
      const reopenRes = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${task.id}/transition`)
        .set(authHeaders(operations))
        .send({ to: "TODO" });
      expect(reopenRes.status).toBe(200);
      expect(reopenRes.body.status).toBe("TODO");

      // Audit recorded for reopen
      const audit = await prisma.auditLog.findFirst({
        where: {
          organization_id: operations.organizationId,
          action: "task.reopened",
          entity_id: task.id,
        },
      });
      expect(audit).toBeTruthy();
    });

    it("task assignment to same org user succeeds; cross-org user fails with 404", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId);
      const task = await createTestTask(app, operations.organizationId, project.id);

      const assignRes = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${task.id}/assign`)
        .set(authHeaders(operations))
        .send({ assigneeId: teamMember.userId });
      expect(assignRes.status).toBe(200);
      expect(assignRes.body.assigneeId).toBe(teamMember.userId);

      // Audit recorded
      const audit = await prisma.auditLog.findFirst({
        where: {
          organization_id: operations.organizationId,
          action: "task.assigned",
          entity_id: task.id,
        },
      });
      expect(audit).toBeTruthy();

      // Cross-org user assignment fails with 404
      const otherOrgId = await createSecondOrganization(app);
      const otherUser = await createTestUser(app, {
        organizationId: otherOrgId,
        role: "TEAM_MEMBER",
        emailSuffix: "cross-assign",
      });

      const badAssign = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${task.id}/assign`)
        .set(authHeaders(operations))
        .send({ assigneeId: otherUser.id });
      expect(badAssign.status).toBe(404);
    });

    it("assignee self: assignee can update and transition own task, but cannot update unassigned task", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId);
      const task = await createTestTask(app, operations.organizationId, project.id, {
        assigneeId: teamMember.userId,
        status: TaskStatus.TODO,
      });

      // Assigned team member can update own task title/priority
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${task.id}`)
        .set(authHeaders(teamMember))
        .send({ priority: "URGENT" });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.priority).toBe("URGENT");

      // Assigned team member can transition own task
      const transRes = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${task.id}/transition`)
        .set(authHeaders(teamMember))
        .send({ to: "IN_PROGRESS" });
      expect(transRes.status).toBe(200);
      expect(transRes.body.status).toBe("IN_PROGRESS");

      // Unassigned task cannot be mutated by team member (403)
      const unassignedTask = await createTestTask(app, operations.organizationId, project.id, {
        assigneeId: operations.userId,
      });

      const deniedRes = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${unassignedTask.id}`)
        .set(authHeaders(teamMember))
        .send({ priority: "LOW" });
      expect(deniedRes.status).toBe(403);
    });
  });

  describe("9. Time Entries", () => {
    it("create, list, and delete time entry", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId);
      const task = await createTestTask(app, operations.organizationId, project.id);

      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${task.id}/time-entries`)
        .set(authHeaders(operations))
        .send({ minutes: 90, loggedAt: "2026-09-17" });
      expect(createRes.status).toBe(201);
      expect(createRes.body.minutes).toBe(90);
      expect(createRes.body.userId).toBe(operations.userId);

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/tasks/${task.id}/time-entries`)
        .set(authHeaders(operations));
      expect(listRes.status).toBe(200);
      expect(listData(listRes.body).some((e: { id: string }) => e.id === createRes.body.id)).toBe(true);

      const delRes = await request(app.getHttpServer())
        .delete(`/api/v1/time-entries/${createRes.body.id}`)
        .set(authHeaders(operations));
      expect(delRes.status).toBe(204);
    });

    it("rejects non-positive minutes (400)", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId);
      const task = await createTestTask(app, operations.organizationId, project.id);

      const badMinutes = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${task.id}/time-entries`)
        .set(authHeaders(operations))
        .send({ minutes: 0, loggedAt: "2026-09-17" });
      expect(badMinutes.status).toBe(400);
    });

    it("TEAM_MEMBER only sees own time entries and cannot delete other's entry (403)", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId);
      const task = await createTestTask(app, operations.organizationId, project.id, {
        assigneeId: teamMember.userId,
      });

      // Entry by operations
      const opEntry = await createTestTimeEntry(app, operations.organizationId, task.id, operations.userId, {
        minutes: 120,
      });
      // Entry by teamMember
      const tmEntry = await createTestTimeEntry(app, operations.organizationId, task.id, teamMember.userId, {
        minutes: 45,
      });

      const tmList = await request(app.getHttpServer())
        .get(`/api/v1/tasks/${task.id}/time-entries`)
        .set(authHeaders(teamMember));
      expect(tmList.status).toBe(200);
      const items = listData<{ id: string }>(tmList.body);
      expect(items.some((e) => e.id === tmEntry.id)).toBe(true);
      expect(items.some((e) => e.id === opEntry.id)).toBe(false);

      // TEAM_MEMBER cannot delete operations' entry
      const deleteDenied = await request(app.getHttpServer())
        .delete(`/api/v1/time-entries/${opEntry.id}`)
        .set(authHeaders(teamMember));
      expect(deleteDenied.status).toBe(403);
    });
  });

  describe("10. Organization Isolation & IDOR Protection", () => {
    it("cross-organization project is invisible (404)", async () => {
      const otherOrgId = await createSecondOrganization(app);
      const otherCompany = await createTestCompany(app, otherOrgId);
      const otherUser = await createTestUser(app, { organizationId: otherOrgId, role: "OPERATIONS", emailSuffix: "org2-op" });
      const otherProject = await createTestProject(app, otherOrgId, otherCompany.id, otherUser.id);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/projects/${otherProject.id}`)
        .set(authHeaders(operations));
      expect(getRes.status).toBe(404);

      const listRes = await request(app.getHttpServer())
        .get("/api/v1/projects")
        .set(authHeaders(operations));
      expect(listData(listRes.body).some((p: { id: string }) => p.id === otherProject.id)).toBe(false);
    });

    it("cannot link project to another organization's company (404)", async () => {
      const otherOrgId = await createSecondOrganization(app);
      const otherCompany = await createTestCompany(app, otherOrgId);

      const createRes = await request(app.getHttpServer())
        .post("/api/v1/projects")
        .set(authHeaders(operations))
        .send({
          name: `${PROJECTS_TEST_PREFIX}Cross Link`,
          companyId: otherCompany.id,
        });
      expect(createRes.status).toBe(404);
    });

    it("cannot access or transition another organization's milestone (404)", async () => {
      const otherOrgId = await createSecondOrganization(app);
      const otherCompany = await createTestCompany(app, otherOrgId);
      const otherUser = await createTestUser(app, { organizationId: otherOrgId, role: "OPERATIONS", emailSuffix: "org2-ms" });
      const otherProject = await createTestProject(app, otherOrgId, otherCompany.id, otherUser.id);
      const otherMilestone = await createTestMilestone(app, otherOrgId, otherProject.id);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/milestones/${otherMilestone.id}/transition`)
        .set(authHeaders(operations))
        .send({ to: "IN_PROGRESS" });
      expect(res.status).toBe(404);
    });

    it("cannot access or transition another organization's task (404)", async () => {
      const otherOrgId = await createSecondOrganization(app);
      const otherCompany = await createTestCompany(app, otherOrgId);
      const otherUser = await createTestUser(app, { organizationId: otherOrgId, role: "OPERATIONS", emailSuffix: "org2-task" });
      const otherProject = await createTestProject(app, otherOrgId, otherCompany.id, otherUser.id);
      const otherTask = await createTestTask(app, otherOrgId, otherProject.id);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/tasks/${otherTask.id}/transition`)
        .set(authHeaders(operations))
        .send({ to: "IN_PROGRESS" });
      expect(res.status).toBe(404);
    });
  });

  describe("11. Concurrency / State Safety", () => {
    it("handles concurrent status transition requests safely", async () => {
      const company = await createTestCompany(app, operations.organizationId);
      const project = await createTestProject(app, operations.organizationId, company.id, operations.userId, {
        status: ProjectStatus.ACTIVE,
      });

      // Two simultaneous status transitions
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/projects/${project.id}/status`)
          .set(authHeaders(operations))
          .send({ to: "CANCELLED" }),
        request(app.getHttpServer())
          .post(`/api/v1/projects/${project.id}/status`)
          .set(authHeaders(operations))
          .send({ to: "ON_HOLD" }),
      ]);

      // Exactly one succeeds, or both complete cleanly to a consistent state
      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);

      const finalProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(["CANCELLED", "ON_HOLD"]).toContain(finalProject?.status);
    });
  });
});
