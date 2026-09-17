import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../../database/prisma.service";
import { roleHasPermission } from "../../../auth/policies/permissions";
import type { AuthenticatedUser } from "../../../auth/types/authenticated-request.interface";
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

    const searches: Promise<void>[] = [];

    if (canReadCrm) {
      searches.push(
        this.prisma.company
          .findMany({
            where: {
              organization_id: orgId,
              name: { contains: query, mode: "insensitive" },
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

    if (canReadProjects) {
      searches.push(
        this.prisma.project
          .findMany({
            where: {
              organization_id: orgId,
              name: { contains: query, mode: "insensitive" },
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

      searches.push(
        this.prisma.task
          .findMany({
            where: {
              organization_id: orgId,
              title: { contains: query, mode: "insensitive" },
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
