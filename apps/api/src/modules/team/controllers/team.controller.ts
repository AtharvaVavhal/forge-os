import { Controller, Get, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { TeamService } from "../services/team.service";
import { ListTeamMembersQueryDto, TeamWorkloadQueryDto } from "../dto/team.dto";

@Controller("team")
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  /**
   * Document 5 §19 (Table 835) / Document 6 §2.3 footnote 2:
   * "All internal roles may view team directory to assign tasks / collaborate."
   * No specific single permission restricts member listing across internal staff.
   */
  @Get("members")
  listMembers(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListTeamMembersQueryDto
  ) {
    return this.teamService.listMembers(actor, query);
  }

  /**
   * Document 5 §4.2, §15, §19 (Table 834):
   * `GET /team/workload` — tasks by assignee, capacity views.
   * Gated by `team.workload.read`. TEAM_MEMBER is narrowed to own workload.
   */
  @RequirePermissions("team.workload.read")
  @Get("workload")
  getWorkload(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: TeamWorkloadQueryDto
  ) {
    return this.teamService.getWorkload(actor, query);
  }
}
