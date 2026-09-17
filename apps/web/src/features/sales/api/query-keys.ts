export const salesKeys = {
  proposals: {
    all: ["sales", "proposals"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["sales", "proposals", "list", filters] as const,
    detail: (id: string) => ["sales", "proposals", "detail", id] as const,
  },
};
