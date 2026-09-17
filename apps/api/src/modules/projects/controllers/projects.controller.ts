import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { ProjectsService } from "../services/projects.service";
import { MilestonesService } from "../services/milestones.service";
import { TasksService } from "../services/tasks.service";
import {
  CreateProjectDto,
  ListProjectsQueryDto,
  TransitionProjectPhaseDto,
  TransitionProjectStatusDto,
  UpdateHandoverChecklistDto,
  UpdateProjectDto,
} from "../dto/project.dto";
import { CreateMilestoneDto } from "../dto/milestone.dto";
import { CreateTaskDto, ListTasksQueryDto } from "../dto/task.dto";

@Controller("projects")
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly milestones: MilestonesService,
    private readonly tasks: TasksService
  ) {}

  @RequirePermissions("projects.read")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListProjectsQueryDto) {
    return this.projects.list(user, query);
  }

  @RequirePermissions("projects.read")
  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.projects.get(user, id);
  }

  @RequirePermissions("projects.manage")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  @RequirePermissions("projects.manage")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto
  ) {
    return this.projects.update(user, id, dto);
  }

  @RequirePermissions("projects.manage")
  @HttpCode(200)
  @Post(":id/status")
  transitionStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TransitionProjectStatusDto
  ) {
    return this.projects.transitionStatus(user, id, dto);
  }

  @RequirePermissions("projects.manage")
  @HttpCode(200)
  @Post(":id/phase")
  transitionPhase(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TransitionProjectPhaseDto
  ) {
    return this.projects.transitionPhase(user, id, dto);
  }

  @RequirePermissions("projects.manage")
  @Patch(":id/handover-checklist")
  updateHandoverChecklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateHandoverChecklistDto
  ) {
    return this.projects.updateHandoverChecklist(user, id, dto);
  }

  @RequirePermissions("projects.manage")
  @HttpCode(200)
  @Post(":id/complete")
  complete(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.projects.complete(user, id);
  }

  @RequirePermissions("projects.read")
  @Get(":id/milestones")
  listMilestones(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.milestones.list(user, id);
  }

  @RequirePermissions("projects.manage")
  @Post(":id/milestones")
  createMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateMilestoneDto
  ) {
    return this.milestones.create(user, id, dto);
  }

  @RequirePermissions("projects.read")
  @Get(":id/tasks")
  listTasks(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: ListTasksQueryDto
  ) {
    return this.tasks.list(user, id, query);
  }

  @RequirePermissions("projects.manage")
  @Post(":id/tasks")
  createTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateTaskDto
  ) {
    return this.tasks.create(user, id, dto);
  }
}
