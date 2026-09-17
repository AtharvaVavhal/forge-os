import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../../auth/types/authenticated-request.interface";
import { NotificationsService } from "../services/notifications.service";
import { ListNotificationsQueryDto } from "../dto/notification.dto";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto
  ) {
    return this.notificationsService.list(actor, query);
  }

  @Post(":id/read")
  markRead(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.notificationsService.markRead(actor, id);
  }
}
