import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../database/prisma.service";
import {
  toBankDirectoryEntryView,
  toBankSearchHit,
  type BankDirectoryEntryView,
  type BankSearchHit,
} from "./bank-directory-views";

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const SEARCH_RESULT_LIMIT = 20;

export interface BankSearchResult {
  query: string;
  banks: BankSearchHit[];
}

/**
 * K10 — read-only Bank & IFSC directory. Reference data only: no
 * organization scoping, no payout/KYC fields. See prisma/import-bank-directory.ts
 * for how bank_directory_entries is populated; this service never touches
 * the source Excel file.
 */
@Injectable()
export class BankDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Case-insensitive substring search over bank names, collapsed to one row per bank. */
  async search(rawQuery: string): Promise<BankSearchResult> {
    const query = rawQuery.trim().replace(/\s+/g, " ");
    if (query.length < 2) {
      return { query, banks: [] };
    }

    const groups = await this.prisma.bankDirectoryEntry.groupBy({
      by: ["bank_code", "bank_name"],
      where: { bank_name: { contains: query, mode: "insensitive" } },
      orderBy: [{ bank_name: "asc" }, { bank_code: "asc" }],
      take: SEARCH_RESULT_LIMIT,
    });

    return { query, banks: groups.map(toBankSearchHit) };
  }

  /** Controller-facing lookup: 400 on malformed format, 404 when not in the directory. */
  async getByIfsc(rawIfsc: string): Promise<BankDirectoryEntryView> {
    const ifsc = this.normalizeIfsc(rawIfsc);
    if (!IFSC_PATTERN.test(ifsc)) {
      throw new BadRequestException({
        code: "INVALID_IFSC_FORMAT",
        message: "ifsc must be a valid IFSC format.",
      });
    }

    const entry = await this.prisma.bankDirectoryEntry.findUnique({ where: { ifsc } });
    if (!entry) {
      throw new NotFoundException({
        code: "IFSC_NOT_FOUND",
        message: "This IFSC was not found in the bank directory.",
      });
    }

    return toBankDirectoryEntryView(entry);
  }

  /**
   * Internal lookup for bank/IFSC consistency checks (never throws). Returns
   * `null` both for malformed input and for an IFSC the directory doesn't
   * cover — callers must treat "not covered" as "cannot verify", not
   * "invalid", since this dataset isn't authoritative or permanently current.
   */
  async lookupIfsc(rawIfsc: string): Promise<BankDirectoryEntryView | null> {
    const ifsc = this.normalizeIfsc(rawIfsc);
    if (!IFSC_PATTERN.test(ifsc)) return null;
    const entry = await this.prisma.bankDirectoryEntry.findUnique({ where: { ifsc } });
    return entry ? toBankDirectoryEntryView(entry) : null;
  }

  private normalizeIfsc(raw: string): string {
    return raw.trim().toUpperCase();
  }
}
