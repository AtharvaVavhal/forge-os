import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { ContactsService } from "../services/contacts.service";
import { CreateContactDto, ListContactsQueryDto, UpdateContactDto } from "../dto/contact.dto";

/** Document 5 §5.2. Also usable inline from a Deal form (same POST — no separate endpoint). */
@Controller("contacts")
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @RequirePermissions("crm.read")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListContactsQueryDto) {
    return this.contacts.list(user, query);
  }

  @RequirePermissions("crm.read")
  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.contacts.get(user, id);
  }

  @RequirePermissions("crm.manage")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateContactDto) {
    return this.contacts.create(user, dto);
  }

  @RequirePermissions("crm.manage")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto
  ) {
    return this.contacts.update(user, id, dto);
  }

  @RequirePermissions("crm.manage")
  @HttpCode(200)
  @Post(":id/archive")
  archive(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.contacts.archive(user, id);
  }
}
