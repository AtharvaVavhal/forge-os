import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

/**
 * Resolves "the" organization for pre-authentication lookups (the login
 * endpoint knows an email + password, not yet an `organization_id`).
 *
 * `organization_id` is non-nullable and scoped on every table (Document 2
 * §18/§19 — "future-scale" column, single org today), and `User.email` is
 * unique **per organization** (`unique(organization_id, email)`), not
 * globally. Correct organization-scoped lookup therefore means resolving
 * the org first, then querying `{ organization_id, email }` together —
 * not `findFirst({ where: { email } })`, which would happen to work only
 * by accident of there being exactly one seeded organization today and
 * would silently stop being correct the moment that stops being true.
 *
 * V1 has exactly one seeded `Organization` row (Document 2 §D seed
 * strategy) and no organization-selection UX exists anywhere in the
 * frozen architecture — this resolves it by querying for it, not by
 * hardcoding the seed script's literal UUID into application code.
 * Cached in memory for the process lifetime since it cannot change
 * without a fresh migration + reseed.
 */
@Injectable()
export class OrganizationContextService {
  private cachedOrganizationId: string | undefined;

  constructor(private readonly prisma: PrismaService) {}

  async resolveSingleOrganizationId(): Promise<string> {
    if (this.cachedOrganizationId) {
      return this.cachedOrganizationId;
    }

    const organization = await this.prisma.organization.findFirstOrThrow({
      select: { id: true },
      orderBy: { created_at: "asc" },
    });

    this.cachedOrganizationId = organization.id;
    return organization.id;
  }
}
