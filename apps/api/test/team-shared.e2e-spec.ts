import type { INestApplication } from "@nestjs/common";
import {
  DocumentCategory,
  InvitationScope,
  PrismaClient,
  RecipientType,
  TaskPriority,
  TaskStatus,
  UserRole,
  Visibility,
} from "@prisma/client";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import {
  authHeaders,
  cleanupTeamSharedTestData,
  listData,
  loginSession,
  TEAM_SHARED_TEST_PREFIX,
  type AuthSession,
} from "./support/team-shared";

describe("Phase B6: Team + Shared Systems (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let founderSession: AuthSession;
  let opsSession: AuthSession;
  let financeSession: AuthSession;
  let salesSession: AuthSession;
  let teamMemberSession: AuthSession;

  let sharedCompany: any;
  let secondOrg: any;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL },
      },
    });

    founderSession = await loginSession(app, UserRole.FOUNDER_ADMIN, {
      emailSuffix: "founder",
    });

    opsSession = await loginSession(app, UserRole.OPERATIONS, {
      organizationId: founderSession.organizationId,
      emailSuffix: "ops",
    });
    financeSession = await loginSession(app, UserRole.FINANCE, {
      organizationId: founderSession.organizationId,
      emailSuffix: "finance",
    });
    salesSession = await loginSession(app, UserRole.SALES, {
      organizationId: founderSession.organizationId,
      emailSuffix: "sales",
    });
    teamMemberSession = await loginSession(app, UserRole.TEAM_MEMBER, {
      organizationId: founderSession.organizationId,
      emailSuffix: "dev1",
    });

    secondOrg = await prisma.organization.create({
      data: {
        name: `${TEAM_SHARED_TEST_PREFIX}Other-Org`,
        billing_state: "Karnataka",
        billing_address: "Bangalore",
      },
    });

    sharedCompany = await prisma.company.create({
      data: {
        organization_id: founderSession.organizationId,
        name: `${TEAM_SHARED_TEST_PREFIX}Main-Client-Co`,
      },
    });
  });

  afterAll(async () => {
    await cleanupTeamSharedTestData(app);
    await prisma.$disconnect();
    await app.close();
  });

  describe("1. Team Directory (GET /team/members)", () => {
    it("lists team members in organization and omits password hashes", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/team/members")
        .set(authHeaders(founderSession))
        .expect(200);

      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("meta");
      const members = listData<any>(res.body);
      expect(members.length).toBeGreaterThanOrEqual(5);

      for (const m of members) {
        expect(m.organizationId).toBe(founderSession.organizationId);
        expect(m).toHaveProperty("email");
        expect(m).toHaveProperty("role");
        expect(m).not.toHaveProperty("password");
        expect(m).not.toHaveProperty("password_hash");
      }
    });

    it("filters members by role", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/team/members?role=TEAM_MEMBER")
        .set(authHeaders(opsSession))
        .expect(200);

      const members = listData<any>(res.body);
      expect(members.length).toBeGreaterThanOrEqual(1);
      for (const m of members) {
        expect(m.role).toBe(UserRole.TEAM_MEMBER);
      }
    });

    it("is accessible by all internal roles including TEAM_MEMBER", async () => {
      for (const session of [opsSession, financeSession, salesSession, teamMemberSession]) {
        await request(app.getHttpServer())
          .get("/api/v1/team/members")
          .set(authHeaders(session))
          .expect(200);
      }
    });

    it("enforces tenant isolation (other org members are not visible)", async () => {
      const otherUser = await prisma.user.create({
        data: {
          organization_id: secondOrg.id,
          name: `${TEAM_SHARED_TEST_PREFIX}Other-Member`,
          email: `${TEAM_SHARED_TEST_PREFIX}other-${Date.now()}@example.com`,
          role: UserRole.TEAM_MEMBER,
        },
      });

      const res = await request(app.getHttpServer())
        .get("/api/v1/team/members")
        .set(authHeaders(founderSession))
        .expect(200);

      const members = listData<any>(res.body);
      expect(members.some((m) => m.id === otherUser.id)).toBe(false);
      for (const m of members) {
        expect(m.organizationId).toBe(founderSession.organizationId);
      }
    });

    it("rejects unauthenticated requests with 401", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/team/members")
        .expect(401);
    });
  });

  describe("2. Team Workload (GET /team/workload)", () => {
    let testProject: any;
    let testTask: any;

    beforeAll(async () => {
      testProject = await prisma.project.create({
        data: {
          organization_id: founderSession.organizationId,
          company_id: sharedCompany.id,
          name: `${TEAM_SHARED_TEST_PREFIX}Project-Workload`,
          owner_id: founderSession.userId,
        },
      });

      testTask = await prisma.task.create({
        data: {
          organization_id: founderSession.organizationId,
          project_id: testProject.id,
          title: `${TEAM_SHARED_TEST_PREFIX}Task-1`,
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.HIGH,
          assignee_id: teamMemberSession.userId,
        },
      });

      await prisma.timeEntry.create({
        data: {
          organization_id: founderSession.organizationId,
          task_id: testTask.id,
          user_id: teamMemberSession.userId,
          minutes: 120,
          logged_at: new Date(),
        },
      });
    });

    it("founder/operations can view workload for all team members", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/team/workload")
        .set(authHeaders(founderSession))
        .expect(200);

      expect(res.body).toHaveProperty("rows");
      const rows = res.body.rows as Array<{
        userId: string;
        openTaskCount: number;
        timeEntryCount: number;
      }>;
      expect(Array.isArray(rows)).toBe(true);

      const memberRow = rows.find((r) => r.userId === teamMemberSession.userId);
      expect(memberRow).toBeDefined();
      expect(memberRow!.openTaskCount).toBeGreaterThanOrEqual(1);
      expect(memberRow!.timeEntryCount).toBeGreaterThanOrEqual(1);
    });

    it("filters workload by userId", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/team/workload?userId=${teamMemberSession.userId}`)
        .set(authHeaders(opsSession))
        .expect(200);

      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0].userId).toBe(teamMemberSession.userId);
    });

    it("returns 404 when querying workload for non-existent userId", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/team/workload?userId=00000000-0000-0000-0000-000000000000")
        .set(authHeaders(opsSession))
        .expect(404);
    });

    it("team member querying their own workload succeeds", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/team/workload")
        .set(authHeaders(teamMemberSession))
        .expect(200);

      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0].userId).toBe(teamMemberSession.userId);
    });

    it("team member querying another user's workload fails with 403", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/team/workload?userId=${founderSession.userId}`)
        .set(authHeaders(teamMemberSession))
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN_PERMISSION");
    });
  });

  describe("3. Shared Notes (/notes)", () => {
    let company: any;
    let project: any;
    let createdNoteId: string;

    beforeAll(async () => {
      company = await prisma.company.create({
        data: {
          organization_id: founderSession.organizationId,
          name: `${TEAM_SHARED_TEST_PREFIX}Company-Notes`,
        },
      });

      project = await prisma.project.create({
        data: {
          organization_id: founderSession.organizationId,
          company_id: company.id,
          name: `${TEAM_SHARED_TEST_PREFIX}Project-Notes`,
          owner_id: founderSession.userId,
        },
      });
    });

    it("creates a note attached to a company", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/notes")
        .set(authHeaders(founderSession))
        .send({
          body: "Initial discovery notes for client.",
          companyId: company.id,
          visibility: Visibility.INTERNAL,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.body).toBe("Initial discovery notes for client.");
      expect(res.body.companyId).toBe(company.id);
      expect(res.body.visibility).toBe(Visibility.INTERNAL);
      createdNoteId = res.body.id;
    });

    it("creates a note attached to a project", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/notes")
        .set(authHeaders(teamMemberSession))
        .send({
          body: "Sprint 1 retrospective findings.",
          projectId: project.id,
          visibility: Visibility.INTERNAL,
        })
        .expect(201);

      expect(res.body.projectId).toBe(project.id);
    });

    it("rejects note creation with zero parents (400)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/notes")
        .set(authHeaders(founderSession))
        .send({
          body: "Parentless note.",
        })
        .expect(400);

      expect(res.body.error.code).toBe("NOTE_REQUIRES_EXACTLY_ONE_PARENT");
    });

    it("rejects note creation with multiple parents (400)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/notes")
        .set(authHeaders(founderSession))
        .send({
          body: "Dual parent note.",
          companyId: company.id,
          projectId: project.id,
        })
        .expect(400);

      expect(res.body.error.code).toBe("NOTE_REQUIRES_EXACTLY_ONE_PARENT");
    });

    it("rejects note creation on a parent in another organization (404)", async () => {
      const otherCompany = await prisma.company.create({
        data: {
          organization_id: secondOrg.id,
          name: `${TEAM_SHARED_TEST_PREFIX}Other-Company`,
        },
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/notes")
        .set(authHeaders(founderSession))
        .send({
          body: "Cross-org attack note.",
          companyId: otherCompany.id,
        })
        .expect(404);

      expect(res.body.error.code).toBe("PARENT_NOT_FOUND");
    });

    it("lists notes with filtering by parent entity", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/notes?companyId=${company.id}`)
        .set(authHeaders(founderSession))
        .expect(200);

      const notes = listData<any>(res.body);
      expect(notes.length).toBeGreaterThanOrEqual(1);
      expect(notes.every((n) => n.companyId === company.id)).toBe(true);
    });

    it("updates note body", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notes/${createdNoteId}`)
        .set(authHeaders(founderSession))
        .send({
          body: "Updated discovery notes.",
        })
        .expect(200);

      expect(res.body.body).toBe("Updated discovery notes.");
    });

    it("updates note visibility and emits Tier B audit event", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/notes/${createdNoteId}`)
        .set(authHeaders(founderSession))
        .send({
          visibility: Visibility.CLIENT_VISIBLE,
        })
        .expect(200);

      const auditEvent = await prisma.auditLog.findFirst({
        where: {
          organization_id: founderSession.organizationId,
          entity_id: createdNoteId,
          action: "note.visibility_changed",
        },
      });
      expect(auditEvent).toBeDefined();
    });

    it("team member cannot update notes created by another user", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notes/${createdNoteId}`)
        .set(authHeaders(teamMemberSession))
        .send({
          body: "Malicious edit.",
        })
        .expect(403);

      expect(res.body.error.code).toBe("FORBIDDEN_PERMISSION");
    });
  });

  describe("4. Shared Documents (/documents)", () => {
    let project: any;
    let createdDocumentId: string;
    let validStorageKey: string;

    beforeAll(async () => {
      project = await prisma.project.create({
        data: {
          organization_id: founderSession.organizationId,
          company_id: sharedCompany.id,
          name: `${TEAM_SHARED_TEST_PREFIX}Project-Docs`,
          owner_id: founderSession.userId,
        },
      });
    });

    it("presigns upload for a valid document file", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/documents/presign-upload")
        .set(authHeaders(founderSession))
        .send({
          filename: "Project_Proposal.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024 * 50,
          category: DocumentCategory.PROPOSAL,
        })
        .expect(201);

      expect(res.body).toHaveProperty("uploadUrl");
      expect(res.body).toHaveProperty("storageKey");
      expect(res.body).toHaveProperty("expiresAt");
      expect(res.body.storageKey).toContain(founderSession.organizationId);
      validStorageKey = res.body.storageKey;
    });

    it("rejects presign upload when file size exceeds 25MB (400)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/documents/presign-upload")
        .set(authHeaders(founderSession))
        .send({
          filename: "huge.pdf",
          mimeType: "application/pdf",
          sizeBytes: 27_000_000,
          category: DocumentCategory.INTERNAL,
        })
        .expect(400);

      expect(res.body.error.code).toBe("INVALID_FILE_SIZE");
    });

    it("rejects presign upload with unallowed MIME type (400)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/documents/presign-upload")
        .set(authHeaders(founderSession))
        .send({
          filename: "payload.exe",
          mimeType: "application/x-msdownload",
          sizeBytes: 1024,
          category: DocumentCategory.INTERNAL,
        })
        .expect(400);

      expect(res.body.error.code).toBe("UNSUPPORTED_MIME_TYPE");
    });

    it("registers an uploaded document in the database", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/documents")
        .set(authHeaders(founderSession))
        .send({
          filename: "Architecture.pdf",
          storageKey: validStorageKey,
          mimeType: "application/pdf",
          sizeBytes: 1024 * 50,
          category: DocumentCategory.REQUIREMENT,
          projectId: project.id,
          visibility: Visibility.INTERNAL,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.filename).toBe("Architecture.pdf");
      expect(res.body.projectId).toBe(project.id);
      expect(res.body.deletedAt).toBeNull();
      createdDocumentId = res.body.id;
    });

    it("rejects document registration with zero parents (400)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/documents")
        .set(authHeaders(founderSession))
        .send({
          filename: "orphan.pdf",
          storageKey: validStorageKey,
          mimeType: "application/pdf",
          sizeBytes: 1024,
          category: DocumentCategory.INTERNAL,
        })
        .expect(400);

      expect(res.body.error.code).toBe("DOCUMENT_REQUIRES_EXACTLY_ONE_PARENT");
    });

    it("generates download URL with attachment disposition", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/documents/${createdDocumentId}/download-url`)
        .set(authHeaders(founderSession))
        .expect(200);

      expect(res.body).toHaveProperty("downloadUrl");
      expect(res.body.downloadUrl).toContain("disposition=attachment");
      expect(res.body.downloadUrl).toContain("sig=");
    });

    it("soft deletes a document and emits Tier A audit event", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/documents/${createdDocumentId}/delete`)
        .set(authHeaders(founderSession))
        .expect(201);

      expect(res.body.deletedAt).not.toBeNull();

      // Ensure no longer in active list
      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/documents?projectId=${project.id}`)
        .set(authHeaders(founderSession))
        .expect(200);

      const docs = listData<any>(listRes.body);
      expect(docs.some((d) => d.id === createdDocumentId)).toBe(false);

      // Verify Tier A audit record
      const auditRecord = await prisma.auditLog.findFirst({
        where: {
          organization_id: founderSession.organizationId,
          entity_id: createdDocumentId,
          action: "document.deleted",
        },
      });
      expect(auditRecord).toBeDefined();
    });

    it("download url on deleted document returns 404", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/documents/${createdDocumentId}/download-url`)
        .set(authHeaders(founderSession))
        .expect(404);

      expect(res.body.error.code).toBe("DOCUMENT_NOT_FOUND");
    });

    describe("TEAM_MEMBER assigned-parent authorization", () => {
      let assignedProject: { id: string };
      let unassignedProject: { id: string };
      let unauthorizedCompanyDocId: string;
      let unauthorizedProjectDocId: string;
      let authorizedProjectDocId: string;

      beforeAll(async () => {
        assignedProject = await prisma.project.create({
          data: {
            organization_id: founderSession.organizationId,
            company_id: sharedCompany.id,
            name: `${TEAM_SHARED_TEST_PREFIX}Docs-Assigned`,
            owner_id: founderSession.userId,
          },
        });
        await prisma.task.create({
          data: {
            organization_id: founderSession.organizationId,
            project_id: assignedProject.id,
            title: `${TEAM_SHARED_TEST_PREFIX}Docs-Assign-Task`,
            status: TaskStatus.TODO,
            priority: TaskPriority.MEDIUM,
            assignee_id: teamMemberSession.userId,
          },
        });
        unassignedProject = await prisma.project.create({
          data: {
            organization_id: founderSession.organizationId,
            company_id: sharedCompany.id,
            name: `${TEAM_SHARED_TEST_PREFIX}Docs-Unassigned`,
            owner_id: founderSession.userId,
          },
        });

        const companyDoc = await prisma.document.create({
          data: {
            organization_id: founderSession.organizationId,
            filename: "company-secret.pdf",
            storage_key: `${founderSession.organizationId}/company-secret.pdf`,
            mime_type: "application/pdf",
            size_bytes: 1024,
            category: DocumentCategory.INTERNAL,
            visibility: Visibility.INTERNAL,
            company_id: sharedCompany.id,
            uploaded_by: founderSession.userId,
          },
        });
        unauthorizedCompanyDocId = companyDoc.id;

        const unassignedDoc = await prisma.document.create({
          data: {
            organization_id: founderSession.organizationId,
            filename: "unassigned-project.pdf",
            storage_key: `${founderSession.organizationId}/unassigned-project.pdf`,
            mime_type: "application/pdf",
            size_bytes: 1024,
            category: DocumentCategory.INTERNAL,
            visibility: Visibility.INTERNAL,
            project_id: unassignedProject.id,
            uploaded_by: founderSession.userId,
          },
        });
        unauthorizedProjectDocId = unassignedDoc.id;

        const assignedDoc = await prisma.document.create({
          data: {
            organization_id: founderSession.organizationId,
            filename: "assigned-project.pdf",
            storage_key: `${founderSession.organizationId}/assigned-project.pdf`,
            mime_type: "application/pdf",
            size_bytes: 1024,
            category: DocumentCategory.INTERNAL,
            visibility: Visibility.INTERNAL,
            project_id: assignedProject.id,
            uploaded_by: founderSession.userId,
          },
        });
        authorizedProjectDocId = assignedDoc.id;
      });

      it("TEAM_MEMBER cannot presign upload against unauthorized parent (company)", async () => {
        const res = await request(app.getHttpServer())
          .post("/api/v1/documents/presign-upload")
          .set(authHeaders(teamMemberSession))
          .send({
            filename: "leak.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
            category: DocumentCategory.INTERNAL,
            companyId: sharedCompany.id,
          })
          .expect(403);

        expect(res.body.error.code).toBe("FORBIDDEN_PERMISSION");
      });

      it("TEAM_MEMBER cannot presign upload against unassigned project", async () => {
        const res = await request(app.getHttpServer())
          .post("/api/v1/documents/presign-upload")
          .set(authHeaders(teamMemberSession))
          .send({
            filename: "leak.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1024,
            category: DocumentCategory.INTERNAL,
            projectId: unassignedProject.id,
          })
          .expect(403);

        expect(res.body.error.code).toBe("FORBIDDEN_PERMISSION");
      });

      it("TEAM_MEMBER cannot register a document against unauthorized parent", async () => {
        const res = await request(app.getHttpServer())
          .post("/api/v1/documents")
          .set(authHeaders(teamMemberSession))
          .send({
            filename: "leak.pdf",
            storageKey: `${founderSession.organizationId}/tm-leak.pdf`,
            mimeType: "application/pdf",
            sizeBytes: 1024,
            category: DocumentCategory.INTERNAL,
            projectId: unassignedProject.id,
          })
          .expect(403);

        expect(res.body.error.code).toBe("FORBIDDEN_PERMISSION");
      });

      it("TEAM_MEMBER cannot list unauthorized parent documents", async () => {
        const byCompany = await request(app.getHttpServer())
          .get(`/api/v1/documents?companyId=${sharedCompany.id}`)
          .set(authHeaders(teamMemberSession))
          .expect(200);
        expect(listData(byCompany.body).some((d) => d.id === unauthorizedCompanyDocId)).toBe(
          false
        );

        const byUnassigned = await request(app.getHttpServer())
          .get(`/api/v1/documents?projectId=${unassignedProject.id}`)
          .set(authHeaders(teamMemberSession))
          .expect(200);
        expect(
          listData(byUnassigned.body).some((d) => d.id === unauthorizedProjectDocId)
        ).toBe(false);
      });

      it("TEAM_MEMBER cannot obtain download URL for unauthorized document", async () => {
        await request(app.getHttpServer())
          .get(`/api/v1/documents/${unauthorizedProjectDocId}/download-url`)
          .set(authHeaders(teamMemberSession))
          .expect(403);

        await request(app.getHttpServer())
          .get(`/api/v1/documents/${unauthorizedCompanyDocId}/download-url`)
          .set(authHeaders(teamMemberSession))
          .expect(403);
      });

      it("TEAM_MEMBER cannot delete unauthorized document", async () => {
        await request(app.getHttpServer())
          .post(`/api/v1/documents/${unauthorizedProjectDocId}/delete`)
          .set(authHeaders(teamMemberSession))
          .expect(403);
      });

      it("TEAM_MEMBER authorized assigned-parent document operations still work", async () => {
        const presign = await request(app.getHttpServer())
          .post("/api/v1/documents/presign-upload")
          .set(authHeaders(teamMemberSession))
          .send({
            filename: "assigned-upload.pdf",
            mimeType: "application/pdf",
            sizeBytes: 2048,
            category: DocumentCategory.INTERNAL,
            projectId: assignedProject.id,
          })
          .expect(201);

        expect(presign.body.storageKey).toContain(teamMemberSession.organizationId);

        const created = await request(app.getHttpServer())
          .post("/api/v1/documents")
          .set(authHeaders(teamMemberSession))
          .send({
            filename: "assigned-upload.pdf",
            storageKey: presign.body.storageKey,
            mimeType: "application/pdf",
            sizeBytes: 2048,
            category: DocumentCategory.INTERNAL,
            projectId: assignedProject.id,
          })
          .expect(201);

        expect(created.body.projectId).toBe(assignedProject.id);

        const listed = await request(app.getHttpServer())
          .get(`/api/v1/documents?projectId=${assignedProject.id}`)
          .set(authHeaders(teamMemberSession))
          .expect(200);
        const docs = listData<any>(listed.body);
        expect(docs.some((d) => d.id === authorizedProjectDocId)).toBe(true);
        expect(docs.some((d) => d.id === created.body.id)).toBe(true);

        await request(app.getHttpServer())
          .get(`/api/v1/documents/${authorizedProjectDocId}/download-url`)
          .set(authHeaders(teamMemberSession))
          .expect(200);

        const deleted = await request(app.getHttpServer())
          .post(`/api/v1/documents/${created.body.id}/delete`)
          .set(authHeaders(teamMemberSession))
          .expect(201);
        expect(deleted.body.deletedAt).not.toBeNull();
      });

      it("cross-org document access remains blocked for TEAM_MEMBER", async () => {
        const otherOwner = await prisma.user.create({
          data: {
            organization_id: secondOrg.id,
            email: `${TEAM_SHARED_TEST_PREFIX}other-owner-${Date.now()}@forge.local`,
            name: "Other Org Owner",
            role: UserRole.FOUNDER_ADMIN,
            password_hash: "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUV",
            active: true,
          },
        });
        const otherCompany = await prisma.company.create({
          data: {
            organization_id: secondOrg.id,
            name: `${TEAM_SHARED_TEST_PREFIX}Other-Org-Co`,
          },
        });
        const otherOrgProject = await prisma.project.create({
          data: {
            organization_id: secondOrg.id,
            company_id: otherCompany.id,
            name: `${TEAM_SHARED_TEST_PREFIX}Other-Org-Project`,
            owner_id: otherOwner.id,
          },
        });
        const otherDoc = await prisma.document.create({
          data: {
            organization_id: secondOrg.id,
            filename: "other-org.pdf",
            storage_key: `${secondOrg.id}/other-org.pdf`,
            mime_type: "application/pdf",
            size_bytes: 512,
            category: DocumentCategory.INTERNAL,
            visibility: Visibility.INTERNAL,
            project_id: otherOrgProject.id,
            uploaded_by: otherOwner.id,
          },
        });

        await request(app.getHttpServer())
          .post("/api/v1/documents/presign-upload")
          .set(authHeaders(teamMemberSession))
          .send({
            filename: "x.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
            category: DocumentCategory.INTERNAL,
            projectId: otherOrgProject.id,
          })
          .expect(404);

        await request(app.getHttpServer())
          .get(`/api/v1/documents/${otherDoc.id}/download-url`)
          .set(authHeaders(teamMemberSession))
          .expect(404);

        const listed = await request(app.getHttpServer())
          .get("/api/v1/documents")
          .set(authHeaders(teamMemberSession))
          .expect(200);
        expect(listData(listed.body).some((d) => d.id === otherDoc.id)).toBe(false);
      });
    });
  });

  describe("5. Shared Notifications (/notifications)", () => {
    let notificationId: string;

    beforeAll(async () => {
      const n = await prisma.notification.create({
        data: {
          organization_id: founderSession.organizationId,
          recipient_type: RecipientType.USER,
          recipient_id: founderSession.userId,
          type: "TASK_ASSIGNED",
          channel: "IN_APP",
          payload: { message: "You have been assigned to Project Architecture." },
        },
      });
      notificationId = n.id;
    });

    it("lists notifications for the authenticated user", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/notifications")
        .set(authHeaders(founderSession))
        .expect(200);

      const notifications = listData<any>(res.body);
      expect(notifications.length).toBeGreaterThanOrEqual(1);
      expect(notifications.some((n) => n.id === notificationId)).toBe(true);
    });

    it("other users cannot see the notification", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/notifications")
        .set(authHeaders(opsSession))
        .expect(200);

      const notifications = listData<any>(res.body);
      expect(notifications.some((n) => n.id === notificationId)).toBe(false);
    });

    it("marks notification as read", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/notifications/${notificationId}/read`)
        .set(authHeaders(founderSession))
        .expect(201);

      expect(res.body.readAt).not.toBeNull();
    });

    it("filters notifications by unreadOnly", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/notifications?unreadOnly=true")
        .set(authHeaders(founderSession))
        .expect(200);

      const notifications = listData<any>(res.body);
      expect(notifications.some((n) => n.id === notificationId)).toBe(false);
    });

    it("another user cannot mark this notification as read (404)", async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/notifications/${notificationId}/read`)
        .set(authHeaders(opsSession))
        .expect(404);
    });
  });

  describe("6. Shared Global Search (GET /search)", () => {
    let searchCompany: any;
    let searchProject: any;

    beforeAll(async () => {
      searchCompany = await prisma.company.create({
        data: {
          organization_id: founderSession.organizationId,
          name: `${TEAM_SHARED_TEST_PREFIX}Starlight Corp`,
        },
      });

      searchProject = await prisma.project.create({
        data: {
          organization_id: founderSession.organizationId,
          company_id: searchCompany.id,
          name: `${TEAM_SHARED_TEST_PREFIX}Starlight Portal App`,
          owner_id: founderSession.userId,
        },
      });
    });

    it("returns matching records across multiple entity types", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/search?q=Starlight")
        .set(authHeaders(founderSession))
        .expect(200);

      expect(res.body).toHaveProperty("hits");
      const hits = res.body.hits as Array<{ id: string; type: string }>;
      expect(hits.length).toBeGreaterThanOrEqual(2);

      expect(hits.some((h) => h.id === searchCompany.id && h.type === "company")).toBe(true);
      expect(hits.some((h) => h.id === searchProject.id && h.type === "project")).toBe(true);
    });

    it("enforces tenant isolation during search (other org records are never returned)", async () => {
      await prisma.company.create({
        data: {
          organization_id: secondOrg.id,
          name: `${TEAM_SHARED_TEST_PREFIX}SecretOtherCorp`,
        },
      });

      const res = await request(app.getHttpServer())
        .get("/api/v1/search?q=SecretOtherCorp")
        .set(authHeaders(founderSession))
        .expect(200);

      expect(res.body.hits).toHaveLength(0);
    });

    it("returns empty hits for empty or whitespace query", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/search?q=%20%20")
        .set(authHeaders(founderSession))
        .expect(200);

      expect(res.body.hits).toHaveLength(0);
    });

    it("TEAM_MEMBER cannot search org-wide CRM records (companies/contacts/deals fail-closed)", async () => {
      const crmCompany = await prisma.company.create({
        data: {
          organization_id: founderSession.organizationId,
          name: `${TEAM_SHARED_TEST_PREFIX}Hidden-CRM-Co`,
        },
      });
      const crmContact = await prisma.contact.create({
        data: {
          organization_id: founderSession.organizationId,
          company_id: crmCompany.id,
          name: `${TEAM_SHARED_TEST_PREFIX}Hidden-Contact`,
          email: `${TEAM_SHARED_TEST_PREFIX}hidden-contact@example.com`,
        },
      });
      const crmDeal = await prisma.deal.create({
        data: {
          organization_id: founderSession.organizationId,
          company_id: crmCompany.id,
          title: `${TEAM_SHARED_TEST_PREFIX}Hidden-Deal`,
          owner_id: founderSession.userId,
          stage: "QUALIFIED",
          estimated_value: "10000.00",
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/search?q=${encodeURIComponent(TEAM_SHARED_TEST_PREFIX + "Hidden")}`)
        .set(authHeaders(teamMemberSession))
        .expect(200);

      const hits = res.body.hits as Array<{ id: string; type: string }>;
      expect(hits.some((h) => h.id === crmCompany.id && h.type === "company")).toBe(false);
      expect(hits.some((h) => h.id === crmContact.id && h.type === "contact")).toBe(false);
      expect(hits.some((h) => h.id === crmDeal.id && h.type === "deal")).toBe(false);
    });

    it("TEAM_MEMBER only sees assigned projects/tasks in search; unassigned are excluded", async () => {
      const assignedCompany = await prisma.company.create({
        data: {
          organization_id: founderSession.organizationId,
          name: `${TEAM_SHARED_TEST_PREFIX}Search-Assign-Co`,
        },
      });
      const assignedProject = await prisma.project.create({
        data: {
          organization_id: founderSession.organizationId,
          company_id: assignedCompany.id,
          name: `${TEAM_SHARED_TEST_PREFIX}Assigned-Beacon-Project`,
          owner_id: founderSession.userId,
        },
      });
      const unassignedProject = await prisma.project.create({
        data: {
          organization_id: founderSession.organizationId,
          company_id: assignedCompany.id,
          name: `${TEAM_SHARED_TEST_PREFIX}Unassigned-Beacon-Project`,
          owner_id: founderSession.userId,
        },
      });
      const assignedTask = await prisma.task.create({
        data: {
          organization_id: founderSession.organizationId,
          project_id: assignedProject.id,
          title: `${TEAM_SHARED_TEST_PREFIX}Assigned-Beacon-Task`,
          status: TaskStatus.TODO,
          priority: TaskPriority.MEDIUM,
          assignee_id: teamMemberSession.userId,
        },
      });
      const foreignTask = await prisma.task.create({
        data: {
          organization_id: founderSession.organizationId,
          project_id: unassignedProject.id,
          title: `${TEAM_SHARED_TEST_PREFIX}Foreign-Beacon-Task`,
          status: TaskStatus.TODO,
          priority: TaskPriority.MEDIUM,
          assignee_id: founderSession.userId,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/search?q=${encodeURIComponent("Beacon")}`)
        .set(authHeaders(teamMemberSession))
        .expect(200);

      const hits = res.body.hits as Array<{ id: string; type: string }>;
      expect(hits.some((h) => h.id === assignedProject.id && h.type === "project")).toBe(true);
      expect(hits.some((h) => h.id === assignedTask.id && h.type === "task")).toBe(true);
      expect(hits.some((h) => h.id === unassignedProject.id && h.type === "project")).toBe(false);
      expect(hits.some((h) => h.id === foreignTask.id && h.type === "task")).toBe(false);
    });

    it("OPERATIONS retains org-wide project search visibility", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/search?q=${encodeURIComponent(TEAM_SHARED_TEST_PREFIX + "Starlight")}`)
        .set(authHeaders(opsSession))
        .expect(200);

      const hits = res.body.hits as Array<{ id: string; type: string }>;
      expect(hits.some((h) => h.id === searchProject.id && h.type === "project")).toBe(true);
      expect(hits.some((h) => h.id === searchCompany.id && h.type === "company")).toBe(true);
    });
  });

  describe("7. Shared Audit Logs (GET /audit-logs)", () => {
    it("accessible to FOUNDER_ADMIN", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/audit-logs")
        .set(authHeaders(founderSession))
        .expect(200);

      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("meta");
    });

    it("accessible to FINANCE role (audit.read permission)", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/audit-logs")
        .set(authHeaders(financeSession))
        .expect(200);
    });

    it("forbidden to OPERATIONS, SALES, and TEAM_MEMBER (403)", async () => {
      for (const session of [opsSession, salesSession, teamMemberSession]) {
        const res = await request(app.getHttpServer())
          .get("/api/v1/audit-logs")
          .set(authHeaders(session))
          .expect(403);

        expect(res.body.error.code).toBe("FORBIDDEN_PERMISSION");
      }
    });

    it("filters audit logs by action", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/audit-logs?action=document.deleted")
        .set(authHeaders(founderSession))
        .expect(200);

      const logs = listData<any>(res.body);
      for (const log of logs) {
        expect(log.action).toBe("document.deleted");
      }
    });

    it("enforces tenant isolation on audit logs (other org audit logs never returned)", async () => {
      const otherAudit = await prisma.auditLog.create({
        data: {
          organization_id: secondOrg.id,
          actor_type: "USER",
          actor_id: founderSession.userId,
          action: "document.deleted",
          entity_type: "DOCUMENT",
          entity_id: "00000000-0000-0000-0000-000000000000",
        },
      });

      const res = await request(app.getHttpServer())
        .get("/api/v1/audit-logs")
        .set(authHeaders(founderSession))
        .expect(200);

      const logs = listData<any>(res.body);
      expect(logs.some((l) => l.id === otherAudit.id)).toBe(false);
      for (const log of logs) {
        expect(log.organizationId).toBe(founderSession.organizationId);
      }
    });
  });

  describe("8. Team Invitations (POST /invitations & /invitations/accept)", () => {
    it("creates an invitation for a new team member", async () => {
      const inviteEmail = `${TEAM_SHARED_TEST_PREFIX}invited-${Date.now()}@example.com`;
      const res = await request(app.getHttpServer())
        .post("/api/v1/invitations")
        .set(authHeaders(founderSession))
        .send({
          scope: InvitationScope.TEAM,
          email: inviteEmail,
          userRole: UserRole.TEAM_MEMBER,
        })
        .expect(201);

      expect(res.body).toHaveProperty("invitation");
      expect(res.body.invitation.email).toBe(inviteEmail);
      expect(res.body.invitation.userRole).toBe(UserRole.TEAM_MEMBER);
    });
  });
});
