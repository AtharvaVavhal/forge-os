export const earningsKeys = {
  projectAllocations: {
    all: ["earnings", "project-allocations"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["earnings", "project-allocations", "list", filters] as const,
    detail: (id: string) => ["earnings", "project-allocations", "detail", id] as const,
  },
  payouts: {
    all: ["earnings", "payouts"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["earnings", "payouts", "list", filters] as const,
    detail: (id: string) => ["earnings", "payouts", "detail", id] as const,
  },
  team: {
    summary: ["earnings", "team", "summary"] as const,
    allocations: (filters: Record<string, string | number | boolean | undefined>) =>
      ["earnings", "team", "allocations", filters] as const,
    payouts: {
      all: ["earnings", "team", "payouts"] as const,
      list: (filters: Record<string, string | number | boolean | undefined>) =>
        ["earnings", "team", "payouts", "list", filters] as const,
      detail: (id: string) => ["earnings", "team", "payouts", "detail", id] as const,
    },
  },
};
