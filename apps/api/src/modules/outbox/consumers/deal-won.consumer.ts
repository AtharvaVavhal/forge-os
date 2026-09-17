import { Injectable, Logger } from "@nestjs/common";
import {
  InvitationScope,
  NotificationChannel,
  RecipientType,
  type DomainEvent,
} from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../../config/configuration";
import { PrismaService } from "../../../database/prisma.service";
import { NotificationsService } from "../../shared/notifications/services/notifications.service";
import { InvoicesService } from "../../finance/services/invoices.service";

export interface DealWonPayload {
  dealId: string;
  projectId: string;
  acceptedProposalId: string;
  companyId: string;
  ownerId: string;
}

/**
 * DealWon async side effects (Document 5 §13 / Red Team §3).
 * Each step is check-before-act so retries are safe.
 *
 * Template milestones/tasks: ProjectTemplatesService currently returns an
 * empty config list (no ProjectTemplate table). Application is a documented
 * no-op until config milestones are defined — do not invent a DB model.
 */
@Injectable()
export class DealWonConsumer {
  private readonly logger = new Logger(DealWonConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<AppConfig, true>
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload as unknown as DealWonPayload;
    if (!payload?.dealId || !payload?.projectId || !payload?.acceptedProposalId || !payload?.companyId) {
      throw new Error("DealWon payload missing required fields");
    }

    // Template apply: no-op while config blueprint is empty (B4/B8).
    await this.applyTemplateIfConfigured(event.organization_id, payload.projectId);

    await this.invoices.createDraftFromAcceptedProposalForDealWon({
      organizationId: event.organization_id,
      proposalId: payload.acceptedProposalId,
      projectId: payload.projectId,
      companyId: payload.companyId,
    });
    await this.ensureClientInvitation(event.organization_id, payload);
    await this.notifyOwner(event.organization_id, payload);
  }

  private async applyTemplateIfConfigured(organizationId: string, projectId: string): Promise<void> {
    const existing = await this.prisma.milestone.count({
      where: { organization_id: organizationId, project_id: projectId },
    });
    if (existing > 0) {
      return;
    }
    // Empty template config — nothing to create (idempotent no-op).
    this.logger.debug(`DealWon: no project template milestones configured for project ${projectId}`);
  }

  private async ensureClientInvitation(
    organizationId: string,
    payload: DealWonPayload
  ): Promise<void> {
    const deal = await this.prisma.deal.findFirst({
      where: { id: payload.dealId, organization_id: organizationId },
      include: { contact: true },
    });
    const email = deal?.contact?.email?.trim().toLowerCase();
    if (!email) {
      this.logger.debug(`DealWon: no contact email for deal ${payload.dealId}; skipping invitation`);
      return;
    }

    const existingUser = await this.prisma.clientUser.findUnique({
      where: {
        organization_id_email: { organization_id: organizationId, email },
      },
    });
    if (existingUser) {
      return;
    }

    const openInvite = await this.prisma.invitationToken.findFirst({
      where: {
        organization_id: organizationId,
        scope: InvitationScope.CLIENT,
        company_id: payload.companyId,
        email,
        used_at: null,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
    });
    if (openInvite) {
      return;
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const ttlDays = this.config.get("auth.invitationTokenTtlDays", { infer: true });
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.invitationToken.create({
      data: {
        organization_id: organizationId,
        token_hash: tokenHash,
        scope: InvitationScope.CLIENT,
        email,
        company_id: payload.companyId,
        expires_at: expiresAt,
        created_by: payload.ownerId,
      },
    });
  }

  private async notifyOwner(organizationId: string, payload: DealWonPayload): Promise<void> {
    const type = "deal.won";
    const notificationPayload = { dealId: payload.dealId, projectId: payload.projectId };
    const existing = await this.prisma.notification.findFirst({
      where: {
        organization_id: organizationId,
        recipient_type: RecipientType.USER,
        recipient_id: payload.ownerId,
        type,
        payload: { equals: notificationPayload },
      },
    });
    if (existing) return;

    await this.notifications.createNotification({
      organizationId,
      recipientType: RecipientType.USER,
      recipientId: payload.ownerId,
      type,
      channel: NotificationChannel.IN_APP,
      payload: notificationPayload,
    });
  }
}
