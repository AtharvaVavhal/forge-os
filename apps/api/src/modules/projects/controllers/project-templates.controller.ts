import { Controller, Get } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { ProjectTemplatesService } from "../services/project-templates.service";

@Controller("project-templates")
export class ProjectTemplatesController {
  constructor(private readonly templates: ProjectTemplatesService) {}

  @RequirePermissions("projects.read")
  @Get()
  list() {
    return this.templates.list();
  }
}
