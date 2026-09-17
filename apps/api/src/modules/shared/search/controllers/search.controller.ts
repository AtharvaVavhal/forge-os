import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../../auth/types/authenticated-request.interface";
import { SearchService } from "../services/search.service";
import { SearchQueryDto } from "../dto/search.dto";

@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: SearchQueryDto
  ) {
    return this.searchService.search(actor, query);
  }
}
