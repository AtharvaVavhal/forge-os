"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, type StatusTone } from "@/components/feedback/status-badge";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { ForbiddenState } from "@/features/auth/components/forbidden-state";
import { isForbiddenError, isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { FactList, PageHeader } from "@/features/crm/components/page-chrome";
import { formatDate, formatTimestamp } from "@/features/crm/format";
import { isConflictError, isNotFoundError, queryErrorMessage } from "@/lib/api/query-error";
import {
  getFinanceKyc,
  getFinanceKycDocumentDownloadUrl,
  reviewFinanceKyc,
} from "../api/kyc-api";
import { financeKeys } from "../api/query-keys";
import type { FinanceKycDetail } from "../api/kyc-types";
import { maskAccountNumber, maskIdNumber, maskIfsc, maskPan, maskUpi } from "../lib/kyc-mask";

const toneFor = (status: string): StatusTone => {
  if (status === "UNDER_REVIEW") return "info";
  if (status === "VERIFIED") return "success";
  if (status === "REJECTED") return "danger";
  return "neutral";
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

function SensitiveValue({
  masked,
  full,
  label,
}: {
  masked: string;
  full: string | null | undefined;
  label: string;
}) {
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

export function KycReviewDetailPage({ id }: { id: string }) {
  return (
    <Can permission="finance.manage" fallback={<ForbiddenState />}>
      <KycReviewDetailInner id={id} />
    </Can>
  );
}

function KycReviewDetailInner({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);

  const detail = useQuery({
    queryKey: financeKeys.kyc.detail(id),
    queryFn: () => getFinanceKyc(id),
    staleTime: 0,
    gcTime: 0,
  });

  const review = useMutation({
    mutationFn: (body: { action: "APPROVE" } | { action: "REJECT"; rejectionReason: string }) =>
      reviewFinanceKyc(id, body),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: financeKeys.kyc.all });
      pushToast({
        title: data.status === "VERIFIED" ? "KYC approved" : "KYC rejected",
        tone: data.status === "VERIFIED" ? "success" : "danger",
      });
      setRejectOpen(false);
      setConfirmApprove(false);
      setRejectionReason("");
      router.refresh();
    },
    onError: (error) => {
      const title = isConflictError(error)
        ? "Already reviewed"
        : "Couldn’t submit review";
      pushToast({ title, description: queryErrorMessage(error), tone: "danger" });
    },
  });

  const download = useMutation({
    mutationFn: (documentId: string) => getFinanceKycDocumentDownloadUrl(id, documentId),
    onSuccess: (result) => {
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    },
    onError: (error) => {
      pushToast({
        title: "Couldn’t open document",
        description: queryErrorMessage(error),
        tone: "danger",
      });
    },
  });

  if (detail.isPending) return <LoadingState label="Loading KYC review" />;
  if (detail.isError && isUnauthorizedError(detail.error)) {
    return <ErrorState title="Session expired">{queryErrorMessage(detail.error)}</ErrorState>;
  }
  if (detail.isError && isForbiddenError(detail.error)) return <ForbiddenState />;
  if (detail.isError && isNotFoundError(detail.error)) {
    return <ErrorState title="KYC profile not found">This record may have been removed.</ErrorState>;
  }
  if (detail.isError) return <ErrorState>{queryErrorMessage(detail.error)}</ErrorState>;

  const data = detail.data as FinanceKycDetail;
  const reviewable = data.status === "UNDER_REVIEW";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Finance"
        title="KYC Review"
        description={`${data.member.name} · ${data.member.email}`}
        actions={
          <Link
            href="/finance/kyc"
            className="font-display text-[length:var(--text-label-size)] font-semibold text-ink underline-offset-2 hover:underline"
          >
            Back to list
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={toneFor(data.status)}>{data.status.replaceAll("_", " ")}</StatusBadge>
        {data.submittedAt ? (
          <span className="font-mono text-[0.75rem] text-ink/50">
            Submitted {formatTimestamp(data.submittedAt)}
          </span>
        ) : null}
      </div>

      <div className="flex max-w-3xl flex-col gap-6">
        <Section title="Personal">
          <FactList
            items={[
              { label: "Legal name", value: data.legalName ?? "—" },
              { label: "Date of birth", value: data.dateOfBirth ? formatDate(data.dateOfBirth) : "—" },
              { label: "Mobile", value: data.mobile ?? "—" },
              {
                label: "Address",
                value:
                  [
                    data.addressLine1,
                    data.addressLine2,
                    data.city,
                    data.state,
                    data.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—",
              },
            ]}
          />
        </Section>

        <Section title="Identity">
          <FactList
            items={[
              {
                label: "PAN",
                value: (
                  <SensitiveValue label="PAN" masked={maskPan(data.pan)} full={data.pan} />
                ),
              },
              {
                label: "Government ID type",
                value: data.governmentIdType?.replaceAll("_", " ") ?? "—",
              },
              {
                label: "Government ID number",
                value: (
                  <SensitiveValue
                    label="government ID"
                    masked={maskIdNumber(data.governmentIdNumber)}
                    full={data.governmentIdNumber}
                  />
                ),
              },
            ]}
          />
        </Section>

        <Section title="Documents">
          <ul className="flex flex-col gap-3">
            {data.documents.length === 0 ? (
              <li className="text-ink/60">No documents uploaded.</li>
            ) : (
              data.documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-steel/20 px-3 py-3"
                >
                  <div>
                    <p className="font-display text-[length:var(--text-label-size)] font-semibold text-ink">
                      {doc.documentType === "PAN_CARD" ? "PAN card" : "Government ID"}
                    </p>
                    <p className="font-[family-name:var(--font-body)] text-[0.9rem] text-ink/70">
                      {doc.filename}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={download.isPending}
                    onClick={() => download.mutate(doc.id)}
                  >
                    View
                  </Button>
                </li>
              ))
            )}
          </ul>
        </Section>

        <Section title="Payout profile">
          {!data.payout.configured ? (
            <p className="text-ink/60">No payout profile configured.</p>
          ) : (
            <div className="flex flex-col gap-6">
              <FactList
                items={[
                  { label: "Account holder", value: data.payout.accountHolderName ?? "—" },
                  { label: "Bank", value: data.payout.bankName ?? "—" },
                  {
                    label: "Account",
                    value: (
                      <SensitiveValue
                        label="account number"
                        masked={maskAccountNumber(data.payout.accountNumber)}
                        full={data.payout.accountNumber}
                      />
                    ),
                  },
                  { label: "IFSC", value: data.payout.ifsc ? maskIfsc(data.payout.ifsc) : "—" },
                ]}
              />
              <FactList
                items={[
                  {
                    label: "UPI ID",
                    value: (
                      <SensitiveValue
                        label="UPI ID"
                        masked={maskUpi(data.payout.upiId)}
                        full={data.payout.upiId}
                      />
                    ),
                  },
                  {
                    label: "UPI QR",
                    value: data.payout.upiQrUploaded ? "Uploaded" : "Missing",
                  },
                ]}
              />
            </div>
          )}
        </Section>

        {data.status === "REJECTED" && data.rejectionReason ? (
          <Section title="Rejection reason">
            <p className="font-[family-name:var(--font-body)] text-ink/80">{data.rejectionReason}</p>
          </Section>
        ) : null}

        {reviewable ? (
          <Section title="Review">
            {!confirmApprove && !rejectOpen ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  variant="dark"
                  onClick={() => setConfirmApprove(true)}
                >
                  Approve KYC
                </Button>
                <Button type="button" variant="destructive" onClick={() => setRejectOpen(true)}>
                  Reject KYC
                </Button>
              </div>
            ) : null}

            {confirmApprove ? (
              <div className="flex flex-col gap-3 rounded-[4px] border border-steel/20 p-4">
                <p className="font-[family-name:var(--font-body)] text-ink/80">
                  Approve KYC for {data.member.name}? This marks the profile as verified.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    loading={review.isPending}
                    variant="dark"
                    onClick={() => review.mutate({ action: "APPROVE" })}
                  >
                    Confirm approval
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={review.isPending}
                    onClick={() => setConfirmApprove(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {rejectOpen ? (
              <div className="flex flex-col gap-4 rounded-[4px] border border-steel/20 p-4">
                <Field id="rejectionReason" label="Rejection reason" required error={rejectError ?? undefined}>
                  <Textarea
                    id="rejectionReason"
                    value={rejectionReason}
                    onChange={(event) => {
                      setRejectionReason(event.target.value);
                      setRejectError(null);
                    }}
                    rows={4}
                    placeholder="Explain what the member needs to correct."
                  />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="destructive"
                    loading={review.isPending}
                    onClick={() => {
                      const reason = rejectionReason.trim();
                      if (reason.length < 3) {
                        setRejectError("Enter a clear rejection reason.");
                        return;
                      }
                      review.mutate({ action: "REJECT", rejectionReason: reason });
                    }}
                  >
                    Confirm rejection
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={review.isPending}
                    onClick={() => {
                      setRejectOpen(false);
                      setRejectError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </Section>
        ) : (
          <p className="font-display text-[length:var(--text-helper-size)] text-ink/50">
            This profile is not awaiting review.
          </p>
        )}
      </div>
    </div>
  );
}
