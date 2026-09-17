import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../../auth/types/authenticated-request.interface";
import { NotesService } from "../services/notes.service";
import {
  CreateNoteDto,
  ListNotesQueryDto,
  UpdateNoteDto,
} from "../dto/note.dto";

@Controller("notes")
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListNotesQueryDto
  ) {
    return this.notesService.list(actor, query);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateNoteDto
  ) {
    return this.notesService.create(actor, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoteDto
  ) {
    return this.notesService.update(actor, id, dto);
  }
}
