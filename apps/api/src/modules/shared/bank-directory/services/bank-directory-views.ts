import type { BankDirectoryEntry } from "@prisma/client";

/** One result row of GET /banks/search — a distinct bank, not a branch. */
export interface BankSearchHit {
  id: string;
  bankName: string;
  bankCode: string;
}

/** GET /banks/ifsc/:ifsc — safe, non-sensitive directory metadata only. */
export interface BankDirectoryEntryView {
  ifsc: string;
  bankName: string;
  bankCode: string;
  branchName: string;
  address: string;
  city: string;
  district: string | null;
  state: string;
}

/** `id` is the bank code itself — the stable identifier for a grouped bank result. */
export function toBankSearchHit(group: { bank_name: string; bank_code: string }): BankSearchHit {
  return {
    id: group.bank_code,
    bankName: group.bank_name,
    bankCode: group.bank_code,
  };
}

export function toBankDirectoryEntryView(entry: BankDirectoryEntry): BankDirectoryEntryView {
  return {
    ifsc: entry.ifsc,
    bankName: entry.bank_name,
    bankCode: entry.bank_code,
    branchName: entry.branch_name,
    address: entry.address,
    city: entry.city,
    district: entry.district,
    state: entry.state,
  };
}
