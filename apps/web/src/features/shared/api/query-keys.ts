export const sharedKeys = {
  activities: {
    all: ["shared", "activities"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["shared", "activities", "list", filters] as const,
  },
  notes: {
    all: ["shared", "notes"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["shared", "notes", "list", filters] as const,
  },
  documents: {
    all: ["shared", "documents"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["shared", "documents", "list", filters] as const,
  },
  notifications: {
    all: ["shared", "notifications"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["shared", "notifications", "list", filters] as const,
  },
  auditLogs: {
    all: ["shared", "audit-logs"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["shared", "audit-logs", "list", filters] as const,
  },
  search: (q: string) => ["shared", "search", q] as const,
  banks: {
    search: (q: string) => ["shared", "banks", "search", q] as const,
    ifsc: (ifsc: string) => ["shared", "banks", "ifsc", ifsc] as const,
  },
};
