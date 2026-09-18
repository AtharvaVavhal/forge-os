import { Controller, Get, Param, Query } from "@nestjs/common";
import { BankSearchQueryDto } from "../dto/bank-search.dto";
import { BankDirectoryService } from "../services/bank-directory.service";

/**
 * K10 — Bank & IFSC directory. Non-sensitive shared reference data (Doc §16)
 * — no `@RequirePermissions`, matching other authenticated-only routes like
 * /search; no NoStoreCacheInterceptor either, since (unlike /team/payout-profile)
 * nothing here is a secret worth stopping shared caches from retaining.
 */
@Controller("banks")
export class BankDirectoryController {
  constructor(private readonly bankDirectory: BankDirectoryService) {}

  @Get("search")
  search(@Query() query: BankSearchQueryDto) {
    return this.bankDirectory.search(query.q);
  }

  @Get("ifsc/:ifsc")
  getByIfsc(@Param("ifsc") ifsc: string) {
    return this.bankDirectory.getByIfsc(ifsc);
  }
}
