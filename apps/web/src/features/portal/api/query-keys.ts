export const portalKeys = {
  me: () => ["portal", "me"] as const,
  projects: {
    all: ["portal", "projects"] as const,
    list: (filters?: Record<string, string | number | boolean | undefined>) =>
      ["portal", "projects", "list", filters ?? {}] as const,
    detail: (id: string) => ["portal", "projects", "detail", id] as const,
    milestones: (id: string) => ["portal", "projects", "milestones", id] as const,
    handover: (id: string) => ["portal", "projects", "handover", id] as const,
  },
  proposals: {
    all: ["portal", "proposals"] as const,
    list: (filters?: Record<string, string | number | boolean | undefined>) =>
      ["portal", "proposals", "list", filters ?? {}] as const,
    detail: (id: string) => ["portal", "proposals", "detail", id] as const,
  },
  invoices: {
    all: ["portal", "invoices"] as const,
    list: (filters?: Record<string, string | number | boolean | undefined>) =>
      ["portal", "invoices", "list", filters ?? {}] as const,
    detail: (id: string) => ["portal", "invoices", "detail", id] as const,
  },
  documents: {
    all: ["portal", "documents"] as const,
    list: (filters?: Record<string, string | number | boolean | undefined>) =>
      ["portal", "documents", "list", filters ?? {}] as const,
    downloadUrl: (id: string) => ["portal", "documents", "download-url", id] as const,
  },
};
