import { Injectable, Logger } from "@nestjs/common";
import {
  NotificationChannel,
  RecipientType,
  type DomainEvent,
} from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { NotificationsService } from "../../shared/notifications/services/notifications.service";

export interface ProposalAcceptedPayload {
  proposalId: string;
  acceptedByClientUserId: string;
  acceptedAt: string;
}

/**
 * ProposalAccepted async consumer (Document 5 §13/§14).
 * Notifications + "ready for Won" signal only — NEVER auto-transitions Deal to WON.
 */
@Injectable()
export class ProposalAcceptedConsumer {
  private readonly logger = new Logger(ProposalAcceptedConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload as unknown as ProposalAcceptedPayload;
    if (!payload?.proposalId) {
      throw new Error("ProposalAccepted payload missing proposalId");
    }

    const proposal = await this.prisma.proposal.findFirst({
      where: { id: payload.proposalId, organization_id: event.organization_id },
      include: { deal: true },
    });
    if (!proposal) {
      this.logger.warn(`ProposalAccepted: proposal ${payload.proposalId} not found`);
      return;
    }

    // Ready-for-Won signal: in-app notification to deal owner (CRM flag without new columns).
    const ownerId = proposal.deal.owner_id;
    const type = "proposal.accepted_ready_for_won";
    const notificationPayload = {
      proposalId: proposal.id,
      dealId: proposal.deal_id,
      acceptedAt: payload.acceptedAt,
    };

    const existing = await this.prisma.notification.findFirst({
      where: {
        organization_id: event.organization_id,
        recipient_type: RecipientType.USER,
        recipient_id: ownerId,
        type,
        payload: { equals: notificationPayload },
      },
    });
    if (existing) {
      return;
    }

    await this.notifications.createNotification({
      organizationId: event.organization_id,
      recipientType: RecipientType.USER,
      recipientId: ownerId,
      type,
      channel: NotificationChannel.IN_APP,
      payload: notificationPayload,
    });
  }
}
