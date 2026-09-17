import { Injectable } from "@nestjs/common";

export interface ProjectTemplateConfig {
  id: string;
  name: string;
}

/**
 * Document 5 §7.2:
 * No ProjectTemplate table in frozen schema. Templates are application
 * configuration (code/JSON in projects module), not CRUD entities.
 *
 * GET /project-templates: lists config template ids/names.
 */
@Injectable()
export class ProjectTemplatesService {
  private readonly templates: ProjectTemplateConfig[] = [];

  list(): ProjectTemplateConfig[] {
    return this.templates;
  }
}
