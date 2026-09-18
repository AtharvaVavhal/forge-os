export const financeKeys = {
  invoices: {
    all: ["finance", "invoices"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["finance", "invoices", "list", filters] as const,
    detail: (id: string) => ["finance", "invoices", "detail", id] as const,
  },
  payments: {
    all: ["finance", "payments"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["finance", "payments", "list", filters] as const,
    detail: (id: string) => ["finance", "payments", "detail", id] as const,
  },
  refunds: {
    all: ["finance", "refunds"] as const,
    list: ["finance", "refunds", "list"] as const,
  },
  creditNotes: {
    all: ["finance", "credit-notes"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["finance", "credit-notes", "list", filters] as const,
    detail: (id: string) => ["finance", "credit-notes", "detail", id] as const,
  },
  expenses: {
    all: ["finance", "expenses"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["finance", "expenses", "list", filters] as const,
  },
  forgeFund: {
    all: ["finance", "forge-fund"] as const,
    entries: (filters: Record<string, string | number | boolean | undefined>) =>
      ["finance", "forge-fund", "entries", filters] as const,
    detail: (id: string) => ["finance", "forge-fund", "entry", id] as const,
    balance: ["finance", "forge-fund", "balance"] as const,
  },
  taxRates: {
    all: ["finance", "tax-rates"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["finance", "tax-rates", "list", filters] as const,
  },
};
