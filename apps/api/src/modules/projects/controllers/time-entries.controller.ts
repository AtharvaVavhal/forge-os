import {
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
} from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { TimeEntriesService } from "../services/time-entries.service";

@Controller("time-entries")
export class TimeEntriesController {
  constructor(private readonly timeEntries: TimeEntriesService) {}

  @RequirePermissions("projects.manage", "projects.read")
  @HttpCode(204)
  @Delete(":id")
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.timeEntries.delete(user, id);
  }
}
