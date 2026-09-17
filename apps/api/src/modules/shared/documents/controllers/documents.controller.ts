import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { RequirePermissions } from "../../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../../auth/types/authenticated-request.interface";
import { DocumentsService } from "../services/documents.service";
import {
  CreateDocumentDto,
  ListDocumentsQueryDto,
  PresignUploadDto,
} from "../dto/document.dto";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @RequirePermissions("documents.read", "documents.manage")
  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListDocumentsQueryDto
  ) {
    return this.documentsService.list(actor, query);
  }

  @RequirePermissions("documents.manage")
  @Post("presign-upload")
  presignUpload(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: PresignUploadDto
  ) {
    return this.documentsService.presignUpload(actor, dto);
  }

  @RequirePermissions("documents.manage")
  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateDocumentDto
  ) {
    return this.documentsService.create(actor, dto);
  }

  @RequirePermissions("documents.read", "documents.manage")
  @Get(":id/download-url")
  getDownloadUrl(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.documentsService.getDownloadUrl(actor, id);
  }

  @RequirePermissions("documents.manage")
  @Post(":id/delete")
  delete(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.documentsService.delete(actor, id);
  }
}
