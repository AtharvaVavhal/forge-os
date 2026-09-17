import type { DealStage, LeadSource, LeadStatus } from "./types";

export const crmKeys = {
  companies: {
    all: ["crm", "companies"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["crm", "companies", "list", filters] as const,
    detail: (id: string) => ["crm", "companies", "detail", id] as const,
  },
  contacts: {
    all: ["crm", "contacts"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["crm", "contacts", "list", filters] as const,
    detail: (id: string) => ["crm", "contacts", "detail", id] as const,
  },
  leads: {
    all: ["crm", "leads"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["crm", "leads", "list", filters] as const,
    detail: (id: string) => ["crm", "leads", "detail", id] as const,
  },
  deals: {
    all: ["crm", "deals"] as const,
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["crm", "deals", "list", filters] as const,
    detail: (id: string) => ["crm", "deals", "detail", id] as const,
  },
  activities: {
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["shared", "activities", "list", filters] as const,
  },
  projects: {
    list: (filters: Record<string, string | number | boolean | undefined>) =>
      ["projects", "list", filters] as const,
  },
  forgeFund: {
    entries: (filters: Record<string, string | number | boolean | undefined>) =>
      ["finance", "forge-fund", "entries", filters] as const,
    balance: ["finance", "forge-fund", "balance"] as const,
  },
};

export type LeadListFilters = {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: LeadStatus;
  source?: LeadSource;
  sort?: string;
};

export type DealListFilters = {
  page?: number;
  pageSize?: number;
  q?: string;
  stage?: DealStage;
  ownerId?: string;
  sort?: string;
};
