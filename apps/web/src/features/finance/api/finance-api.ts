import { apiClient } from "@/lib/api/client";
import { browserMutate } from "@/lib/api/browser-mutate";
import {
  parseCreditNote,
  parseCreditNoteList,
  parseExpense,
  parseExpenseList,
  parseForgeFundBalance,
  parseForgeFundEntry,
  parseForgeFundEntryList,
  parseInvoice,
  parseInvoiceList,
  parsePayment,
  parsePaymentList,
  parseRefund,
  parseRefundList,
  parseTaxRate,
  parseTaxRateList,
} from "./parse";
import { financePaths } from "./paths";
import type { CreditNoteReason, ForgeFundEntryType, OfflinePaymentMethod } from "./types";

function requireParsed<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Unexpected ${label} payload from the API.`);
  }
  return value;
}

function newIdempotencyKey() {
  return crypto.randomUUID();
}

export async function listInvoices(query: { page?: number; pageSize?: number; sort?: string } = {}) {
  const payload = await apiClient.get<unknown>(financePaths.invoices, {
    query: { page: query.page, pageSize: query.pageSize, sort: query.sort },
  });
  return requireParsed(parseInvoiceList(payload), "invoice list");
}

export async function getInvoice(id: string) {
  const payload = await apiClient.get<unknown>(financePaths.invoice(id));
  return requireParsed(parseInvoice(payload), "invoice");
}

export async function createInvoice(body: { companyId: string; projectId?: string; dueDate?: string }) {
  const payload = await browserMutate<unknown>("POST", financePaths.invoices, {
    body,
    idempotencyKey: newIdempotencyKey(),
  });
  return requireParsed(parseInvoice(payload), "invoice");
}

export async function createInvoiceFromProposal(proposalId: string) {
  const payload = await browserMutate<unknown>("POST", financePaths.invoiceFromProposal, {
    body: { proposalId },
    idempotencyKey: newIdempotencyKey(),
  });
  return requireParsed(parseInvoice(payload), "invoice");
}

export async function updateInvoice(
  id: string,
  body: { dueDate?: string; version: number }
) {
  const payload = await browserMutate<unknown>("PATCH", financePaths.invoice(id), { body });
  return requireParsed(parseInvoice(payload), "invoice");
}

export async function replaceInvoiceLineItems(
  id: string,
  lines: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    hsnSacCode: string;
    sortOrder: number;
  }>
) {
  const payload = await browserMutate<unknown>("PUT", financePaths.invoiceLineItems(id), {
    body: { lines },
  });
  return requireParsed(parseInvoice(payload), "invoice");
}

export async function sendInvoice(id: string) {
  const payload = await browserMutate<unknown>("POST", financePaths.sendInvoice(id), {
    body: {},
    idempotencyKey: newIdempotencyKey(),
  });
  return requireParsed(parseInvoice(payload), "invoice");
}

export async function voidInvoice(id: string) {
  const payload = await browserMutate<unknown>("POST", financePaths.voidInvoice(id), { body: {} });
  return requireParsed(parseInvoice(payload), "invoice");
}

export async function cancelInvoice(id: string, reason: string) {
  const payload = await browserMutate<unknown>("POST", financePaths.cancelInvoice(id), {
    body: { reason },
  });
  return requireParsed(parseInvoice(payload), "invoice");
}

export async function remindInvoice(id: string) {
  await browserMutate<unknown>("POST", financePaths.remindInvoice(id), { body: {} });
}

export async function listPayments(query: { page?: number; pageSize?: number; sort?: string } = {}) {
  const payload = await apiClient.get<unknown>(financePaths.payments, {
    query: { page: query.page, pageSize: query.pageSize, sort: query.sort },
  });
  return requireParsed(parsePaymentList(payload), "payment list");
}

export async function getPayment(id: string) {
  const payload = await apiClient.get<unknown>(financePaths.payment(id));
  return requireParsed(parsePayment(payload), "payment");
}

export async function createPayment(body: {
  invoiceId: string;
  amount: string;
  method: OfflinePaymentMethod;
  recordedBy: string;
  referenceNote?: string;
  paidAt?: string;
}) {
  const payload = await browserMutate<unknown>("POST", financePaths.payments, {
    body,
    idempotencyKey: newIdempotencyKey(),
  });
  return requireParsed(parsePayment(payload), "payment");
}

export async function listRefunds() {
  const payload = await apiClient.get<unknown>(financePaths.refunds);
  return requireParsed(parseRefundList(payload), "refund list");
}

export async function createRefund(body: { paymentId: string; amount: string; reason: string }) {
  const payload = await browserMutate<unknown>("POST", financePaths.refunds, {
    body,
    idempotencyKey: newIdempotencyKey(),
  });
  return requireParsed(parseRefund(payload), "refund");
}

export async function listCreditNotes(query: { page?: number; pageSize?: number; sort?: string } = {}) {
  const payload = await apiClient.get<unknown>(financePaths.creditNotes, {
    query: { page: query.page, pageSize: query.pageSize, sort: query.sort },
  });
  return requireParsed(parseCreditNoteList(payload), "credit note list");
}

export async function getCreditNote(id: string) {
  const payload = await apiClient.get<unknown>(financePaths.creditNote(id));
  return requireParsed(parseCreditNote(payload), "credit note");
}

export async function createCreditNote(body: {
  invoiceId: string;
  reason: CreditNoteReason;
  amount: string;
}) {
  const payload = await browserMutate<unknown>("POST", financePaths.creditNotes, {
    body,
    idempotencyKey: newIdempotencyKey(),
  });
  return requireParsed(parseCreditNote(payload), "credit note");
}

export async function listExpenses(query: { page?: number; pageSize?: number; sort?: string } = {}) {
  const payload = await apiClient.get<unknown>(financePaths.expenses, {
    query: { page: query.page, pageSize: query.pageSize, sort: query.sort },
  });
  return requireParsed(parseExpenseList(payload), "expense list");
}

export async function createExpense(body: {
  description: string;
  amount: string;
  category: string;
  incurredAt: string;
  recordedBy: string;
  projectId?: string;
}) {
  const payload = await browserMutate<unknown>("POST", financePaths.expenses, {
    body,
    idempotencyKey: newIdempotencyKey(),
  });
  return requireParsed(parseExpense(payload), "expense");
}

export async function updateExpense(
  id: string,
  body: Partial<{
    description: string;
    amount: string;
    category: string;
    incurredAt: string;
    projectId: string | null;
  }>
) {
  const payload = await browserMutate<unknown>("PATCH", financePaths.expense(id), { body });
  return requireParsed(parseExpense(payload), "expense");
}

export async function listForgeFundEntries(query: { page?: number; pageSize?: number; sort?: string } = {}) {
  const payload = await apiClient.get<unknown>(financePaths.forgeFundEntries, {
    query: { page: query.page, pageSize: query.pageSize, sort: query.sort },
  });
  return requireParsed(parseForgeFundEntryList(payload), "forge fund list");
}

export async function getForgeFundEntry(id: string) {
  const payload = await apiClient.get<unknown>(financePaths.forgeFundEntry(id));
  return requireParsed(parseForgeFundEntry(payload), "forge fund entry");
}

export async function getForgeFundBalance() {
  const payload = await apiClient.get<unknown>(financePaths.forgeFundBalance);
  return parseForgeFundBalance(payload);
}

export async function createForgeFundEntry(body: {
  type: ForgeFundEntryType;
  amount: string;
  reason: string;
  sourceType: null;
  sourceId: null;
}) {
  const payload = await browserMutate<unknown>("POST", financePaths.forgeFundEntries, {
    body,
    idempotencyKey: newIdempotencyKey(),
  });
  return requireParsed(parseForgeFundEntry(payload), "forge fund entry");
}

export async function listTaxRates(query: { page?: number; pageSize?: number; sort?: string } = {}) {
  const payload = await apiClient.get<unknown>(financePaths.taxRates, {
    query: { page: query.page, pageSize: query.pageSize, sort: query.sort },
  });
  return requireParsed(parseTaxRateList(payload), "tax rate list");
}

export async function createTaxRate(body: {
  hsnSacCode: string;
  description: string;
  cgstRate: string;
  sgstRate: string;
  igstRate: string;
  effectiveFrom: string;
  effectiveTo?: string;
}) {
  const payload = await browserMutate<unknown>("POST", financePaths.taxRates, { body });
  return requireParsed(parseTaxRate(payload), "tax rate");
}

export async function updateTaxRate(
  id: string,
  body: Partial<{
    description: string;
    cgstRate: string;
    sgstRate: string;
    igstRate: string;
    effectiveTo: string;
  }>
) {
  const payload = await browserMutate<unknown>("PATCH", financePaths.taxRate(id), { body });
  return requireParsed(parseTaxRate(payload), "tax rate");
}
