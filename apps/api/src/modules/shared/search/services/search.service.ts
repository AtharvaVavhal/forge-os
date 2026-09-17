import { Injectable } from "@nestjs/common";
import { UserRole, type Prisma } from "@prisma/client";
import { PrismaService } from "../../../../database/prisma.service";
import { roleHasPermission } from "../../../auth/policies/permissions";
import type { AuthenticatedUser } from "../../../auth/types/authenticated-request.interface";
import {
  teamMemberScopedCompanyContactWhere,
} from "../../../crm/policies/resource-authorization";
import { teamMemberProjectWhere } from "../../../projects/policies/resource-authorization";
import type { SearchQueryDto } from "../dto/search.dto";

export interface SearchHit {
  type: "company" | "contact" | "deal" | "project" | "task" | "invoice";
  id: string;
  title: string;
  subtitle?: string;
}

export interface SearchResult {
  query: string;
  hits: SearchHit[];
}

/**
 * Global search — Document 5 §10.2 / §19.
 *
 * Coarse gates use `crm.read` / `projects.read` / `finance.read`. Row-level
 * narrowing reuses the same B2/B4 helpers as the resource APIs so search
 * cannot surface records the actor could not load through those routes
 * (Document 5 §4.3 footnotes ¹/²; B2 fail-closed companies/contacts; B2
 * full deny of deals for TEAM_MEMBER; B4 assigned project/task scope).
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    actor: AuthenticatedUser,
    dto: SearchQueryDto
  ): Promise<SearchResult> {
    const query = dto.q.trim();
    if (!query) {
      return { query, hits: [] };
    }

    const hits: SearchHit[] = [];
    const orgId = actor.organizationId;
    const canReadCrm = roleHasPermission(actor.role, "crm.read");
    const canReadProjects = roleHasPermission(actor.role, "projects.read");
    const canReadFinance = roleHasPermission(actor.role, "finance.read");
    const canSearchDeals = canReadCrm && actor.role !== UserRole.TEAM_MEMBER;
    // B2 fail-closed companies/contacts scope (same helper the CRM list APIs use).
    const tmCompanyScope = teamMemberScopedCompanyContactWhere(actor) as
      | Prisma.CompanyWhereInput
      | undefined;
    const tmContactScope = teamMemberScopedCompanyContactWhere(actor) as
      | Prisma.ContactWhereInput
      | undefined;
    const projectScope = teamMemberProjectWhere(actor);

    const searches: Promise<void>[] = [];

    if (canReadCrm) {
      searches.push(
        this.prisma.company
          .findMany({
            where: {
              organization_id: orgId,
              name: { contains: query, mode: "insensitive" },
              ...tmCompanyScope,
            },
            select: { id: true, name: true },
            take: 5,
          })
          .then((companies) => {
            for (const c of companies) {
              hits.push({
                type: "company",
                id: c.id,
                title: c.name,
                subtitle: "Company",
              });
            }
          })
      );

      searches.push(
        this.prisma.contact
          .findMany({
            where: {
              organization_id: orgId,
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
              ],
              ...tmContactScope,
            },
            select: { id: true, name: true, email: true },
            take: 5,
          })
          .then((contacts) => {
            for (const c of contacts) {
              hits.push({
                type: "contact",
                id: c.id,
                title: c.name,
                subtitle: c.email ?? "Contact",
              });
            }
          })
      );

      if (canSearchDeals) {
        searches.push(
          this.prisma.deal
            .findMany({
              where: {
                organization_id: orgId,
                title: { contains: query, mode: "insensitive" },
              },
              select: { id: true, title: true, stage: true },
              take: 5,
            })
            .then((deals) => {
              for (const d of deals) {
                hits.push({
                  type: "deal",
                  id: d.id,
                  title: d.title,
                  subtitle: `Deal • ${d.stage}`,
                });
              }
            })
        );
      }
    }

    if (canReadProjects) {
      searches.push(
        this.prisma.project
          .findMany({
            where: {
              organization_id: orgId,
              name: { contains: query, mode: "insensitive" },
              ...projectScope,
            },
            select: { id: true, name: true, phase: true },
            take: 5,
          })
          .then((projects) => {
            for (const p of projects) {
              hits.push({
                type: "project",
                id: p.id,
                title: p.name,
                subtitle: `Project • ${p.phase}`,
              });
            }
          })
      );

      // Match GET /projects/:id/tasks: TEAM_MEMBER may only see tasks on
      // projects in their assigned owner/assignee scope (B4 helper).
      searches.push(
        this.prisma.task
          .findMany({
            where: {
              organization_id: orgId,
              title: { contains: query, mode: "insensitive" },
              project: {
                organization_id: orgId,
                ...projectScope,
              },
            },
            select: { id: true, title: true, status: true },
            take: 5,
          })
          .then((tasks) => {
            for (const t of tasks) {
              hits.push({
                type: "task",
                id: t.id,
                title: t.title,
                subtitle: `Task • ${t.status}`,
              });
            }
          })
      );
    }

    if (canReadFinance) {
      searches.push(
        this.prisma.invoice
          .findMany({
            where: {
              organization_id: orgId,
              invoice_number: { contains: query, mode: "insensitive" },
            },
            select: { id: true, invoice_number: true, status: true },
            take: 5,
          })
          .then((invoices) => {
            for (const inv of invoices) {
              hits.push({
                type: "invoice",
                id: inv.id,
                title: inv.invoice_number,
                subtitle: `Invoice • ${inv.status}`,
              });
            }
          })
      );
    }

    await Promise.all(searches);

    return {
      query,
      hits,
    };
  }
}
