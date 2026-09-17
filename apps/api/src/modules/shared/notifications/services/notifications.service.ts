import { Injectable, NotFoundException } from "@nestjs/common";
import {
  Notification,
  NotificationChannel,
  Prisma,
  RecipientType,
} from "@prisma/client";
import { PrismaService } from "../../../../database/prisma.service";
import {
  buildCursorMeta,
  cursorWhere,
  paginateCursorResult,
} from "../../../../common/pagination/cursor-pagination";
import type { ListEnvelope } from "../../../../common/pagination/offset-pagination";
import type { AuthenticatedUser } from "../../../auth/types/authenticated-request.interface";
import type { ListNotificationsQueryDto } from "../dto/notification.dto";

export interface CreateNotificationInput {
  organizationId: string;
  recipientType: RecipientType;
  recipientId: string;
  type: string;
  channel?: NotificationChannel;
  payload: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    actor: AuthenticatedUser,
    query: ListNotificationsQueryDto
  ): Promise<ListEnvelope<Notification>> {
    const limit = query.limit ?? 25;

    const where: Prisma.NotificationWhereInput = {
      organization_id: actor.organizationId,
      recipient_type: RecipientType.USER,
      recipient_id: actor.id,
      ...(query.unreadOnly ? { read_at: null } : {}),
      ...cursorWhere(query.cursor),
    };

    const rows = await this.prisma.notification.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const { data, nextCursor } = paginateCursorResult(rows, limit);
    return { data, meta: { pagination: buildCursorMeta(limit, nextCursor) } };
  }

  async markRead(actor: AuthenticatedUser, id: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        organization_id: actor.organizationId,
        recipient_type: RecipientType.USER,
        recipient_id: actor.id,
      },
    });

    if (!notification) {
      throw new NotFoundException({
        code: "NOTIFICATION_NOT_FOUND",
        message: "Notification not found.",
      });
    }

    if (notification.read_at) {
      return notification;
    }

    return this.prisma.notification.update({
      where: { id: notification.id },
      data: { read_at: new Date() },
    });
  }

  async createNotification(
    input: CreateNotificationInput
  ): Promise<Notification> {
    return this.prisma.notification.create({
      data: {
        organization_id: input.organizationId,
        recipient_type: input.recipientType,
        recipient_id: input.recipientId,
        type: input.type,
        channel: input.channel ?? NotificationChannel.IN_APP,
        payload: input.payload,
      },
    });
  }
}
