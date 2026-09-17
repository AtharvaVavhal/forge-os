export const salesPaths = {
  proposals: "/proposals",
  proposal: (id: string) => `/proposals/${id}`,
  lineItems: (id: string) => `/proposals/${id}/line-items`,
  send: (id: string) => `/proposals/${id}/send`,
  revise: (id: string) => `/proposals/${id}/revise`,
  transition: (id: string) => `/proposals/${id}/transition`,
} as const;
