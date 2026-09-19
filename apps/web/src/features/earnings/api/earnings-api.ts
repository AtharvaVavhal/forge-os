import { apiClient } from "@/lib/api/client";
import { browserMutate } from "@/lib/api/browser-mutate";
import {
  parseProjectAllocation,
  parseProjectAllocationList,
  parseTeamEarningEntryList,
  parseTeamEarningsSummary,
  parseTeamPayoutList,
  parseTeamPayoutRequest,
  parseTeamPayoutRequestList,
} from "./parse";
import { earningsPaths } from "./paths";
import type { ProjectAllocationStatus, TeamPayoutStatus } from "./types";

function requireParsed<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Unexpected ${label} payload from the API.`);
  }
  return value;
}

function newIdempotencyKey() {
  return crypto.randomUUID();
}

// ── Finance: project allocations ──────────────────────────────────────────

export async function listProjectAllocations(
  query: { page?: number; pageSize?: number; projectId?: string; status?: ProjectAllocationStatus } = {}
) {
  const payload = await apiClient.get<unknown>(earningsPaths.projectAllocations, {
    query: { page: query.page, pageSize: query.pageSize, projectId: query.projectId, status: query.status },
  });
  return requireParsed(parseProjectAllocationList(payload), "project allocation list");
}

export async function getProjectAllocation(id: string) {
  const payload = await apiClient.get<unknown>(earningsPaths.projectAllocation(id));
  return requireParsed(parseProjectAllocation(payload), "project allocation");
}

export async function createProjectAllocation(body: {
  projectId: string;
  lines?: Array<{ userId: string; amount: string; note?: string }>;
}) {
  const payload = await browserMutate<unknown>("POST", earningsPaths.projectAllocations, {
    body,
    idempotencyKey: newIdempotencyKey(),
  });
  return requireParsed(parseProjectAllocation(payload), "project allocation");
}

export async function replaceProjectAllocationLines(
  id: string,
  body: { version: number; lines: Array<{ userId: string; amount: string; note?: string }> }
) {
  const payload = await browserMutate<unknown>("PATCH", earningsPaths.projectAllocationLines(id), { body });
  return requireParsed(parseProjectAllocation(payload), "project allocation");
}

export async function approveProjectAllocation(id: string, version: number) {
  const payload = await browserMutate<unknown>("POST", earningsPaths.approveProjectAllocation(id), {
    body: { version },
    idempotencyKey: newIdempotencyKey(),
  });
  return requireParsed(parseProjectAllocation(payload), "project allocation");
}

export async function cancelProjectAllocation(id: string, version: number) {
  const payload = await browserMutate<unknown>("POST", earningsPaths.cancelProjectAllocation(id), {
    body: { version },
    idempotencyKey: newIdempotencyKey(),
  });
  return requireParsed(parseProjectAllocation(payload), "project allocation");
}

export async function adjustProjectAllocation(id: string) {
  const payload = await browserMutate<unknown>("POST", earningsPaths.adjustProjectAllocation(id), {
    body: {},
    idempotencyKey: newIdempotencyKey(),
  });
  return requireParsed(parseProjectAllocation(payload), "project allocation");
}

// ── Finance: payouts ────────────────────────────────────────────────────────

export async function listPayouts(query: { page?: number; pageSize?: number; status?: TeamPayoutStatus } = {}) {
  const payload = await apiClient.get<unknown>(earningsPaths.payouts, {
    query: { page: query.page, pageSize: query.pageSize, status: query.status },
  });
  return requireParsed(parseTeamPayoutList(payload), "payout list");
}

export async function getPayout(id: string) {
  const payload = await apiClient.get<unknown>(earningsPaths.payout(id));
  return requireParsed(parseTeamPayoutRequest(payload), "payout");
}

export async function reviewPayout(id: string, version: number) {
  const payload = await browserMutate<unknown>("POST", earningsPaths.reviewPayout(id), { body: { version } });
  return requireParsed(parseTeamPayoutRequest(payload), "payout");
}

export async function approvePayout(id: string, version: number) {
  const payload = await browserMutate<unknown>("POST", earningsPaths.approvePayout(id), { body: { version } });
  return requireParsed(parseTeamPayoutRequest(payload), "payout");
}

export async function rejectPayout(id: string, version: number, reason: string) {
  const payload = await browserMutate<unknown>("POST", earningsPaths.rejectPayout(id), { body: { version, reason } });
  return requireParsed(parseTeamPayoutRequest(payload), "payout");
}

export async function processPayout(id: string, version: number, processor?: string) {
  const payload = await browserMutate<unknown>("POST", earningsPaths.processPayout(id), {
    body: { version, processor },
  });
  return requireParsed(parseTeamPayoutRequest(payload), "payout");
}

export async function markPayoutPaid(id: string, externalReference: string) {
  const payload = await browserMutate<unknown>("POST", earningsPaths.markPayoutPaid(id), {
    body: { externalReference },
    idempotencyKey: newIdempotencyKey(),
  });
  return requireParsed(parseTeamPayoutRequest(payload), "payout");
}

export async function markPayoutFailed(id: string, version: number, reason: string) {
  const payload = await browserMutate<unknown>("POST", earningsPaths.markPayoutFailed(id), {
    body: { version, reason },
  });
  return requireParsed(parseTeamPayoutRequest(payload), "payout");
}

// ── Team member self-service ─────────────────────────────────────────────

export async function getOwnEarningsSummary() {
  const payload = await apiClient.get<unknown>(earningsPaths.teamEarnings);
  return requireParsed(parseTeamEarningsSummary(payload), "earnings summary");
}

export async function listOwnEarningAllocations(query: { page?: number; pageSize?: number } = {}) {
  const payload = await apiClient.get<unknown>(earningsPaths.teamEarningsAllocations, {
    query: { page: query.page, pageSize: query.pageSize },
  });
  return requireParsed(parseTeamEarningEntryList(payload), "earnings allocation list");
}

export async function listOwnPayouts(query: { page?: number; pageSize?: number; status?: TeamPayoutStatus } = {}) {
  const payload = await apiClient.get<unknown>(earningsPaths.teamPayouts, {
    query: { page: query.page, pageSize: query.pageSize, status: query.status },
  });
  return requireParsed(parseTeamPayoutRequestList(payload), "own payout list");
}

export async function getOwnPayout(id: string) {
  const payload = await apiClient.get<unknown>(earningsPaths.teamPayout(id));
  return requireParsed(parseTeamPayoutRequest(payload), "own payout");
}

export async function createOwnPayoutRequest(amount: string, idempotencyKey?: string) {
  const payload = await browserMutate<unknown>("POST", earningsPaths.teamPayouts, {
    body: { amount },
    idempotencyKey: idempotencyKey ?? newIdempotencyKey(),
  });
  return requireParsed(parseTeamPayoutRequest(payload), "own payout");
}
