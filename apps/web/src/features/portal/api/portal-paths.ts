/**
 * Documented portal API paths (Document 5 §11).
 *
 * All portal routes are company-scoped by the backend via PortalScopeGuard.
 * Base prefix `/api/v1` is supplied by the API client baseUrl.
 */
export const portalPaths = {
  auth: {
    login: "/portal/auth/login",
    logout: "/portal/auth/logout",
  },
  me: "/portal/me",
  projects: "/portal/projects",
  project: (id: string) => `/portal/projects/${id}`,
  projectMilestones: (id: string) => `/portal/projects/${id}/milestones`,
  projectHandover: (id: string) => `/portal/projects/${id}/handover`,
  proposals: "/portal/proposals",
  proposal: (id: string) => `/portal/proposals/${id}`,
  acceptProposal: (id: string) => `/portal/proposals/${id}/accept`,
  invoices: "/portal/invoices",
  invoice: (id: string) => `/portal/invoices/${id}`,
  documents: "/portal/documents",
  documentDownloadUrl: (id: string) => `/portal/documents/${id}/download-url`,
} as const;
