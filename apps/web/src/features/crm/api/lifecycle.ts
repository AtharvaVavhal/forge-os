import type { DealLostReason, DealStage, LeadStatus } from "./types";

export const DEAL_LINEAR_PATH = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "DISCOVERY",
  "PROPOSAL_SENT",
  "NEGOTIATION",
] as const;

export function nextLeadActions(status: LeadStatus): Array<"CONTACTED" | "QUALIFIED" | "CONVERT" | "DISQUALIFY"> {
  switch (status) {
    case "NEW":
      return ["CONTACTED", "DISQUALIFY"];
    case "CONTACTED":
      return ["QUALIFIED", "DISQUALIFY"];
    case "QUALIFIED":
      return ["CONVERT", "DISQUALIFY"];
    default:
      return [];
  }
}

export function nextDealStage(stage: DealStage): DealStage | null {
  const index = DEAL_LINEAR_PATH.indexOf(stage as (typeof DEAL_LINEAR_PATH)[number]);
  if (index === -1) return null;
  if (index === DEAL_LINEAR_PATH.length - 1) return "WON";
  return DEAL_LINEAR_PATH[index + 1] ?? null;
}

export function isTerminalDeal(stage: DealStage): boolean {
  return stage === "WON" || stage === "LOST";
}

export function dealTransitionBody(to: DealStage, lostReason?: DealLostReason) {
  if (to === "LOST") {
    return { to, lostReason };
  }
  return { to };
}

export function leadTransitionBody(to: Exclude<LeadStatus, "CONVERTED">) {
  return { to };
}
