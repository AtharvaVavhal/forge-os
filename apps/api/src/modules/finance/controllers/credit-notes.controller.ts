import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Idempotent } from "../../../common/idempotency/idempotent.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { CreditNotesService } from "../services/credit-notes.service";
import { CreateCreditNoteDto, ListCreditNotesQueryDto } from "../dto/credit-note.dto";

/** Document 5 §8.3/§19. */
@Controller("credit-notes")
export class CreditNotesController {
  constructor(private readonly creditNotes: CreditNotesService) {}

  @RequirePermissions("finance.read")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCreditNotesQueryDto) {
    return this.creditNotes.list(user, query);
  }

  @RequirePermissions("finance.read")
  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.creditNotes.get(user, id);
  }

  @RequirePermissions("finance.manage")
  @Idempotent()
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCreditNoteDto) {
    return this.creditNotes.create(user, dto);
  }
}
