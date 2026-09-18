export const financeKycPaths = {
  list: "/finance/kyc",
  detail: (id: string) => `/finance/kyc/${id}`,
  review: (id: string) => `/finance/kyc/${id}/review`,
  documentDownload: (kycId: string, documentId: string) =>
    `/finance/kyc/${kycId}/documents/${documentId}/download-url`,
} as const;
