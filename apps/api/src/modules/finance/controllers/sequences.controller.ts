import { Controller, Get } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { SequencesService } from "../services/sequences.service";

/** Document 5 §8.5/§19: "Sequences are not manually incremented via API (only via send/finalize transactions)." — read-only. */
@Controller()
export class SequencesController {
  constructor(private readonly sequences: SequencesService) {}

  @RequirePermissions("finance.read")
  @Get("invoice-sequences")
  listInvoiceSequences(@CurrentUser() user: AuthenticatedUser) {
    return this.sequences.listInvoiceSequences(user.organizationId);
  }

  @RequirePermissions("finance.read")
  @Get("credit-note-sequences")
  listCreditNoteSequences(@CurrentUser() user: AuthenticatedUser) {
    return this.sequences.listCreditNoteSequences(user.organizationId);
  }
}
