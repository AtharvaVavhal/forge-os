import { Module } from "@nestjs/common";
import { SharedModule } from "../shared/shared.module";
import { ProjectsController } from "./controllers/projects.controller";
import { ProjectTemplatesController } from "./controllers/project-templates.controller";
import { MilestonesController } from "./controllers/milestones.controller";
import { TasksController } from "./controllers/tasks.controller";
import { TimeEntriesController } from "./controllers/time-entries.controller";
import { ProjectsService } from "./services/projects.service";
import { ProjectTemplatesService } from "./services/project-templates.service";
import { MilestonesService } from "./services/milestones.service";
import { TasksService } from "./services/tasks.service";
import { TimeEntriesService } from "./services/time-entries.service";

@Module({
  imports: [SharedModule],
  controllers: [
    ProjectsController,
    ProjectTemplatesController,
    MilestonesController,
    TasksController,
    TimeEntriesController,
  ],
  providers: [
    ProjectsService,
    ProjectTemplatesService,
    MilestonesService,
    TasksService,
    TimeEntriesService,
  ],
  exports: [
    ProjectsService,
    ProjectTemplatesService,
    MilestonesService,
    TasksService,
    TimeEntriesService,
  ],
})
export class ProjectsModule {}
