import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { TasksService } from "../services/tasks.service";
import { TimeEntriesService } from "../services/time-entries.service";
import { AssignTaskDto, TransitionTaskDto, UpdateTaskDto } from "../dto/task.dto";
import { CreateTimeEntryDto } from "../dto/time-entry.dto";

@Controller("tasks")
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly timeEntries: TimeEntriesService
  ) {}

  @RequirePermissions("projects.manage", "projects.read")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto
  ) {
    return this.tasks.update(user, id, dto);
  }

  @RequirePermissions("projects.manage", "projects.read")
  @HttpCode(200)
  @Post(":id/transition")
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TransitionTaskDto
  ) {
    return this.tasks.transition(user, id, dto);
  }

  @RequirePermissions("projects.manage")
  @HttpCode(200)
  @Post(":id/assign")
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignTaskDto
  ) {
    return this.tasks.assign(user, id, dto);
  }

  @RequirePermissions("projects.read")
  @Get(":id/time-entries")
  listTimeEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.timeEntries.list(user, id);
  }

  @RequirePermissions("projects.read")
  @Post(":id/time-entries")
  createTimeEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateTimeEntryDto
  ) {
    return this.timeEntries.create(user, id, dto);
  }
}
