import { Controller, Get, Query } from "@nestjs/common";
import { RequirePermissions } from "../../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../../auth/types/authenticated-request.interface";
import { AuditLogsService } from "../services/audit-logs.service";
import { ListAuditLogsQueryDto } from "../dto/audit-log.dto";

@Controller("audit-logs")
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @RequirePermissions("audit.read")
  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListAuditLogsQueryDto
  ) {
    return this.auditLogsService.list(actor, query);
  }
}
