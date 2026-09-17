export const teamKeys = {
  members: {
    all: ["team", "members"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["team", "members", "list", filters] as const,
  },
  workload: ["team", "workload"] as const,
};
