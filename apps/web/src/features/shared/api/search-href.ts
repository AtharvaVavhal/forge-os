import type { SearchHit } from "./types";

/**
 * Maps API-provided entity types onto existing workspace detail routes.
 * Types without a documented detail page (e.g. Task) stay non-navigable.
 */
export function hrefForSearchHit(hit: SearchHit): string | null {
  const type = (hit.entityType ?? "").toLowerCase().replace(/_/g, "");
  const { id } = hit;
  if (type === "company" || type === "companies") return `/crm/companies/${id}`;
  if (type === "contact" || type === "contacts") return `/crm/contacts/${id}`;
  if (type === "lead" || type === "leads") return `/crm/leads/${id}`;
  if (type === "deal" || type === "deals") return `/crm/deals/${id}`;
  if (type === "project" || type === "projects") return `/projects/${id}`;
  if (type === "proposal" || type === "proposals") return `/projects/proposals/${id}`;
  if (type === "invoice" || type === "invoices") return `/finance/invoices/${id}`;
  if (type === "payment" || type === "payments") return `/finance/payments/${id}`;
  return null;
}
