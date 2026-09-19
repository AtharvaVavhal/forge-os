"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, type StatusTone } from "@/components/feedback/status-badge";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import { ConfirmationDialog } from "@/components/overlays/modal";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { ForbiddenState } from "@/features/auth/components/forbidden-state";
import { isForbiddenError, isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { FactList, PageHeader } from "@/features/crm/components/page-chrome";
import { formatTimestamp } from "@/features/crm/format";
import { isConflictError, isNotFoundError, queryErrorMessage } from "@/lib/api/query-error";
import { formatInr } from "@/lib/money/format-inr";
import { MoneyText } from "@/features/finance/components/money-text";
import { maskAccountNumber, maskIfsc, maskUpi } from "@/features/onboarding/lib/mask";
import {
  approvePayout,
  getPayout,
  markPayoutFailed,
  markPayoutPaid,
  processPayout,
  rejectPayout,
  reviewPayout,
} from "../api/earnings-api";
import { earningsKeys } from "../api/query-keys";
import {
  canApprovePayout,
  canMarkPayoutFailed,
  canMarkPayoutPaid,
  canProcessPayout,
  canRejectPayout,
  canReviewPayout,
  isTeamPayoutTerminal,
} from "../api/lifecycle";
import type { TeamPayoutRequest, TeamPayoutStatus } from "../api/types";

const statusTone: Record<TeamPayoutStatus, StatusTone> = {
  REQUESTED: "pending",
  UNDER_REVIEW: "info",
  APPROVED: "info",
  PROCESSING: "warning",
  PAID: "success",
  REJECTED: "danger",
  FAILED: "danger",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-steel/15 pb-6 last:border-b-0 last:pb-0">
      <h2 className="font-display text-[length:var(--text-label-size)] font-semibold uppercase tracking-[0.06em] text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SensitiveValue({ masked, full, label }: { masked: string; full: string | null | undefined; label: string }) {
  const [revealed, setRevealed] = useState(false);
  if (!full) return <span>—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono text-[0.95rem]">{revealed ? full : masked}</span>
      <button
        type="button"
        className="font-display text-[length:var(--text-helper-size)] font-semibold text-ink underline-offset-2 hover:underline"
        onClick={() => setRevealed((v) => !v)}
        aria-label={revealed ? `Hide ${label}` : `Reveal ${label}`}
      >
        {revealed ? "Hide" : "Reveal"}
      </button>
    </span>
  );
}

export function PayoutDetailPage({ id }: { id: string }) {
  return (
    <Can permission="finance.manage" fallback={<ForbiddenState />}>
      <PayoutDetailInner id={id} />
    </Can>
  );
}

function PayoutDetailInner({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | undefined>();
  const [failOpen, setFailOpen] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [failError, setFailError] = useState<string | undefined>();
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [externalReference, setExternalReference] = useState("");
  const [referenceError, setReferenceError] = useState<string | undefined>();
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmProcess, setConfirmProcess] = useState(false);

  const detail = useQuery({
    queryKey: earningsKeys.payouts.detail(id),
    queryFn: () => getPayout(id),
    staleTime: 0,
    gcTime: 0,
  });

  function onSuccess(title: string) {
    return (payout: TeamPayoutRequest) => {
      queryClient.setQueryData(earningsKeys.payouts.detail(id), payout);
      queryClient.invalidateQueries({ queryKey: earningsKeys.payouts.all });
      pushToast({ title, tone: "success" });
    };
  }

  function onError(fallbackTitle: string) {
    return (error: unknown) => {
      const title = isConflictError(error) ? "This request changed — reload and try again" : fallbackTitle;
      pushToast({ title, description: queryErrorMessage(error), tone: "danger" });
    };
  }

  const review = useMutation({
    mutationFn: () => reviewPayout(id, detail.data?.version ?? 1),
    onSuccess: onSuccess("Marked under review"),
    onError: onError("Couldn’t start review"),
  });
  const approve = useMutation({
    mutationFn: () => approvePayout(id, detail.data?.version ?? 1),
    onSuccess: (payout) => {
      onSuccess("Payout approved")(payout);
      setConfirmApprove(false);
    },
    onError: (error) => {
      setConfirmApprove(false);
      onError("Couldn’t approve")(error);
    },
  });
  const reject = useMutation({
    mutationFn: (reason: string) => rejectPayout(id, detail.data?.version ?? 1, reason),
    onSuccess: (payout) => {
      onSuccess("Payout rejected")(payout);
      setRejectOpen(false);
      setRejectReason("");
    },
    onError: onError("Couldn’t reject"),
  });
  const process = useMutation({
    mutationFn: () => processPayout(id, detail.data?.version ?? 1),
    onSuccess: (payout) => {
      onSuccess("Marked processing")(payout);
      setConfirmProcess(false);
    },
    onError: (error) => {
      setConfirmProcess(false);
      onError("Couldn’t start processing")(error);
    },
  });
  const markPaid = useMutation({
    mutationFn: (reference: string) => markPayoutPaid(id, reference),
    onSuccess: (payout) => {
      onSuccess("Marked paid")(payout);
      setMarkPaidOpen(false);
      setExternalReference("");
    },
    onError: onError("Couldn’t mark paid"),
  });
  const markFailed = useMutation({
    mutationFn: (reason: string) => markPayoutFailed(id, detail.data?.version ?? 1, reason),
    onSuccess: (payout) => {
      onSuccess("Marked failed")(payout);
      setFailOpen(false);
      setFailReason("");
    },
    onError: onError("Couldn’t mark failed"),
  });

  if (detail.isPending) return <LoadingState label="Loading payout" />;
  if (detail.isError && isUnauthorizedError(detail.error)) {
    return <ErrorState title="Session expired">{queryErrorMessage(detail.error)}</ErrorState>;
  }
  if (detail.isError && isForbiddenError(detail.error)) return <ForbiddenState />;
  if (detail.isError && isNotFoundError(detail.error)) {
    return <ErrorState title="Payout not found">This request may have been removed.</ErrorState>;
  }
  if (detail.isError) return <ErrorState>{queryErrorMessage(detail.error)}</ErrorState>;

  const payout = detail.data;
  const anyActionOpen = rejectOpen || failOpen || markPaidOpen || confirmApprove || confirmProcess;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        kicker="Finance"
        title={payout.userName}
        description={payout.userEmail}
        actions={
          <Link
            href="/finance/withdrawals"
            className="font-display text-[length:var(--text-label-size)] font-semibold text-ink underline-offset-2 hover:underline"
          >
            Back to list
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={statusTone[payout.status]}>{payout.status.replaceAll("_", " ")}</StatusBadge>
        <span className="font-mono text-[0.75rem] text-ink/50">Requested {formatTimestamp(payout.requestedAt)}</span>
      </div>

      <div className="flex max-w-3xl flex-col gap-6">
        <Section title="Request">
          <FactList
            items={[
              { label: "Amount", value: <MoneyText value={payout.amount} /> },
              { label: "Method", value: payout.payoutMethod.replaceAll("_", " ") },
              { label: "Reviewed by", value: payout.reviewedBy?.name ?? "—" },
              { label: "Reviewed at", value: formatTimestamp(payout.reviewedAt) },
              { label: "Approved by", value: payout.approvedBy?.name ?? "—" },
              { label: "Approved at", value: formatTimestamp(payout.approvedAt) },
              { label: "Processing started", value: formatTimestamp(payout.processingStartedAt) },
              { label: "Processor", value: payout.processor ?? "—" },
              { label: "Paid at", value: formatTimestamp(payout.paidAt) },
              { label: "External reference", value: payout.externalReference ?? "—" },
            ]}
          />
        </Section>

        <Section title="Payout destination (frozen at request time)">
          <FactList
            items={[
              { label: "Account holder", value: payout.destination.accountHolderName ?? "—" },
              { label: "Bank", value: payout.destination.bankName ?? "—" },
              {
                label: "Account number",
                value: (
                  <SensitiveValue
                    label="account number"
                    masked={maskAccountNumber(payout.destination.accountNumber)}
                    full={payout.destination.accountNumber}
                  />
                ),
              },
              {
                label: "IFSC",
                value: <SensitiveValue label="IFSC" masked={maskIfsc(payout.destination.ifsc)} full={payout.destination.ifsc} />,
              },
              {
                label: "UPI ID",
                value: <SensitiveValue label="UPI ID" masked={maskUpi(payout.destination.upiId)} full={payout.destination.upiId} />,
              },
            ]}
          />
        </Section>

        {payout.status === "REJECTED" && payout.rejectionReason ? (
          <Section title="Rejection reason">
            <p className="font-[family-name:var(--font-body)] text-ink/80">{payout.rejectionReason}</p>
          </Section>
        ) : null}
        {payout.status === "FAILED" && payout.failureReason ? (
          <Section title="Failure reason">
            <p className="font-[family-name:var(--font-body)] text-ink/80">{payout.failureReason}</p>
          </Section>
        ) : null}

        {isTeamPayoutTerminal(payout.status) ? (
          <p className="font-display text-[length:var(--text-helper-size)] text-ink/50">
            This request is {payout.status === "PAID" ? "paid" : "rejected"} — no further action possible.
          </p>
        ) : (
          <Section title="Actions">
            {!anyActionOpen ? (
              <div className="flex flex-wrap gap-3">
                {canReviewPayout(payout.status) ? (
                  <Button loading={review.isPending} onClick={() => review.mutate()}>
                    Start review
                  </Button>
                ) : null}
                {canApprovePayout(payout.status) ? (
                  <Button onClick={() => setConfirmApprove(true)}>Approve</Button>
                ) : null}
                {canRejectPayout(payout.status) ? (
                  <Button variant="destructive" onClick={() => setRejectOpen(true)}>
                    Reject
                  </Button>
                ) : null}
                {canProcessPayout(payout.status) ? (
                  <Button onClick={() => setConfirmProcess(true)}>
                    {payout.status === "FAILED" ? "Retry processing" : "Start processing"}
                  </Button>
                ) : null}
                {canMarkPayoutPaid(payout.status) ? (
                  <Button onClick={() => setMarkPaidOpen(true)}>Mark paid</Button>
                ) : null}
                {canMarkPayoutFailed(payout.status) ? (
                  <Button variant="destructive" onClick={() => setFailOpen(true)}>
                    Mark failed
                  </Button>
                ) : null}
              </div>
            ) : null}

            {rejectOpen ? (
              <div className="flex flex-col gap-4 rounded-[4px] border border-steel/20 p-4">
                <Field id="rejectReason" label="Rejection reason" required error={rejectError}>
                  <Textarea
                    id="rejectReason"
                    value={rejectReason}
                    onChange={(event) => {
                      setRejectReason(event.target.value);
                      setRejectError(undefined);
                    }}
                    rows={4}
                    placeholder="Explain why this request is being rejected."
                  />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="destructive"
                    loading={reject.isPending}
                    onClick={() => {
                      const reason = rejectReason.trim();
                      if (reason.length < 3) {
                        setRejectError("Enter a clear rejection reason.");
                        return;
                      }
                      reject.mutate(reason);
                    }}
                  >
                    Confirm rejection
                  </Button>
                  <Button variant="ghost" disabled={reject.isPending} onClick={() => setRejectOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {failOpen ? (
              <div className="flex flex-col gap-4 rounded-[4px] border border-steel/20 p-4">
                <Field id="failReason" label="Failure reason" required error={failError}>
                  <Textarea
                    id="failReason"
                    value={failReason}
                    onChange={(event) => {
                      setFailReason(event.target.value);
                      setFailError(undefined);
                    }}
                    rows={4}
                    placeholder="What went wrong with the transfer?"
                  />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="destructive"
                    loading={markFailed.isPending}
                    onClick={() => {
                      const reason = failReason.trim();
                      if (reason.length < 3) {
                        setFailError("Enter a clear failure reason.");
                        return;
                      }
                      markFailed.mutate(reason);
                    }}
                  >
                    Confirm failure
                  </Button>
                  <Button variant="ghost" disabled={markFailed.isPending} onClick={() => setFailOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {markPaidOpen ? (
              <div className="flex flex-col gap-4 rounded-[4px] border border-steel/20 p-4">
                <Field id="externalReference" label="External reference" required error={referenceError} hint="Bank/UPI transaction reference">
                  <Input
                    id="externalReference"
                    value={externalReference}
                    onChange={(event) => {
                      setExternalReference(event.target.value);
                      setReferenceError(undefined);
                    }}
                    placeholder="UTR123456"
                  />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Button
                    loading={markPaid.isPending}
                    onClick={() => {
                      const reference = externalReference.trim();
                      if (!reference) {
                        setReferenceError("Enter the transfer's external reference.");
                        return;
                      }
                      markPaid.mutate(reference);
                    }}
                  >
                    Confirm paid
                  </Button>
                  <Button variant="ghost" disabled={markPaid.isPending} onClick={() => setMarkPaidOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </Section>
        )}
      </div>

      <ConfirmationDialog
        open={confirmApprove}
        onClose={() => setConfirmApprove(false)}
        onConfirm={() => approve.mutate()}
        title="Approve this payout?"
        description={`Approve the ${formatInr(payout.amount)} withdrawal for ${payout.userName}?`}
        confirmLabel="Approve"
        pending={approve.isPending}
      />
      <ConfirmationDialog
        open={confirmProcess}
        onClose={() => setConfirmProcess(false)}
        onConfirm={() => process.mutate()}
        title="Start processing this payout?"
        description="Marks the request as being sent to the bank/UPI rail."
        confirmLabel="Start processing"
        pending={process.isPending}
      />
    </div>
  );
}
