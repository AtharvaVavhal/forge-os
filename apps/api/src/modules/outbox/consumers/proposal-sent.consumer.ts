import { Injectable, Logger } from "@nestjs/common";
import {
  NotificationChannel,
  RecipientType,
  type DomainEvent,
} from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { NotificationsService } from "../../shared/notifications/services/notifications.service";

export interface ProposalSentPayload {
  proposalId: string;
  version: number;
  dealId: string;
}

/** ProposalSent async consumer — notify deal owner (Document 5 §14). */
@Injectable()
export class ProposalSentConsumer {
  private readonly logger = new Logger(ProposalSentConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload as unknown as ProposalSentPayload;
    if (!payload?.proposalId) {
      throw new Error("ProposalSent payload missing proposalId");
    }

    const proposal = await this.prisma.proposal.findFirst({
      where: { id: payload.proposalId, organization_id: event.organization_id },
      include: { deal: true },
    });
    if (!proposal) {
      this.logger.warn(`ProposalSent: proposal ${payload.proposalId} not found`);
      return;
    }

    const type = "proposal.sent";
    const notificationPayload = {
      proposalId: proposal.id,
      dealId: proposal.deal_id,
      version: payload.version,
    };

    const existing = await this.prisma.notification.findFirst({
      where: {
        organization_id: event.organization_id,
        recipient_type: RecipientType.USER,
        recipient_id: proposal.deal.owner_id,
        type,
        payload: { equals: notificationPayload },
      },
    });
    if (existing) return;

    await this.notifications.createNotification({
      organizationId: event.organization_id,
      recipientType: RecipientType.USER,
      recipientId: proposal.deal.owner_id,
      type,
      channel: NotificationChannel.IN_APP,
      payload: notificationPayload,
    });
  }
}
