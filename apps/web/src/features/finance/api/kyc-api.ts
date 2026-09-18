import { apiClient } from "@/lib/api/client";
import { browserMutate } from "@/lib/api/browser-mutate";
import { financeKycPaths } from "./kyc-paths";
import {
  parseDownloadUrl,
  parseFinanceKycDetail,
  parseFinanceKycList,
} from "./kyc-parse";
import type { FinanceKycDetail, FinanceKycListResult, KycReviewStatus } from "./kyc-types";

function requireParsed<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Unexpected ${label} payload from the API.`);
  }
  return value;
}

export async function listFinanceKyc(query: {
  page?: number;
  pageSize?: number;
  status?: KycReviewStatus;
} = {}): Promise<FinanceKycListResult> {
  const payload = await apiClient.get<unknown>(financeKycPaths.list, {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
    },
  });
  return requireParsed(parseFinanceKycList(payload), "finance KYC list");
}

export async function getFinanceKyc(id: string): Promise<FinanceKycDetail> {
  const payload = await apiClient.get<unknown>(financeKycPaths.detail(id));
  return requireParsed(parseFinanceKycDetail(payload), "finance KYC detail");
}

export async function reviewFinanceKyc(
  id: string,
  body: { action: "APPROVE" } | { action: "REJECT"; rejectionReason: string }
): Promise<FinanceKycDetail> {
  const payload = await browserMutate<unknown>("POST", financeKycPaths.review(id), { body });
  return requireParsed(parseFinanceKycDetail(payload), "finance KYC review");
}

export async function getFinanceKycDocumentDownloadUrl(
  kycId: string,
  documentId: string
): Promise<{ downloadUrl: string; expiresAt: string }> {
  const payload = await apiClient.get<unknown>(
    financeKycPaths.documentDownload(kycId, documentId)
  );
  return requireParsed(parseDownloadUrl(payload), "KYC document download URL");
}
