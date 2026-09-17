import type { ProposalStatus } from "./types";

export function isDraftProposal(status: ProposalStatus): boolean {
  return status === "DRAFT";
}

export function isTerminalProposal(status: ProposalStatus): boolean {
  return status === "ACCEPTED" || status === "REJECTED" || status === "EXPIRED";
}

/** Internal transition targets documented on POST /proposals/:id/transition. Accept is portal-only. */
export function nextProposalTransitions(
  status: ProposalStatus
): Array<"VIEWED" | "REJECTED" | "EXPIRED"> {
  switch (status) {
    case "SENT":
      return ["VIEWED", "REJECTED", "EXPIRED"];
    case "VIEWED":
      return ["REJECTED", "EXPIRED"];
    default:
      return [];
  }
}

export function canReviseProposal(status: ProposalStatus): boolean {
  return status !== "DRAFT";
}

export function proposalTransitionBody(to: Exclude<ProposalStatus, "DRAFT" | "SENT" | "ACCEPTED">) {
  return { to };
}
