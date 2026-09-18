"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { BankCombobox } from "@/components/forms/bank-combobox";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/data-display/data-states";
import { EmptyState } from "@/components/data-display/empty-state";
import { FactList, FormActions } from "@/features/crm/components/page-chrome";
import { useToast } from "@/components/overlays/toast";
import { isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { queryErrorMessage } from "@/lib/api/query-error";
import { lookupIfsc } from "@/features/shared/api/bank-directory-api";
import { sharedKeys } from "@/features/shared/api/query-keys";
import { getOwnPayoutProfile, upsertPayoutProfile } from "@/features/onboarding/api/kyc-api";
import { payoutFormSchema } from "@/features/onboarding/schemas/forms";
import type { PayoutProfile, UpsertPayoutBody } from "@/features/onboarding/api/types";
import { maskAccountNumber, maskIfsc, maskUpi } from "@/features/onboarding/lib/mask";
import { teamKeys } from "../api/query-keys";

const IFSC_FORMAT = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const IFSC_LOOKUP_DEBOUNCE_MS = 400;

/** Masked by default; the viewer opts in per-field to see the raw value. */
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

/** Live IFSC resolution + bank/IFSC mismatch metadata, mirrors the onboarding payout step. */
function IfscResolution({
  ifsc,
  bankName,
  onUseBank,
}: {
  ifsc: string;
  bankName: string;
  onUseBank: (bankName: string) => void;
}) {
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(
      () => setDebounced(ifsc.trim().toUpperCase()),
      IFSC_LOOKUP_DEBOUNCE_MS
    );
    return () => window.clearTimeout(handle);
  }, [ifsc]);

  const formatValid = IFSC_FORMAT.test(debounced);
  const query = useQuery({
    queryKey: sharedKeys.banks.ifsc(debounced),
    queryFn: () => lookupIfsc(debounced),
    enabled: formatValid,
  });

  if (!formatValid) return null;

  if (query.isFetching) {
    return (
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.06em] text-ink/45" role="status">
        Checking IFSC…
      </p>
    );
  }

  if (query.isError) {
    return (
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.06em] text-ink/45">
        Couldn’t verify this IFSC right now.
      </p>
    );
  }

  const resolved = query.data ?? null;

  if (!resolved) {
    return (
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.06em] text-ink/45">
        Not found in our bank directory — you can still continue if it’s correct.
      </p>
    );
  }

  const mismatched =
    bankName.trim().length > 0 &&
    bankName.trim().toUpperCase() !== resolved.bankName.trim().toUpperCase();

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[0.7rem] uppercase tracking-[0.06em] text-ink/55">
        <dt>✓ Bank</dt>
        <dd className="normal-case tracking-normal text-ink/70">{resolved.bankName}</dd>
        <dt>✓ Branch</dt>
        <dd className="normal-case tracking-normal text-ink/70">{resolved.branchName}</dd>
        <dt>✓ City</dt>
        <dd className="normal-case tracking-normal text-ink/70">{resolved.city}</dd>
        <dt>✓ State</dt>
        <dd className="normal-case tracking-normal text-ink/70">{resolved.state}</dd>
      </dl>
      {mismatched ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-[4px] border border-danger-deep/30 bg-danger-deep/5 px-3 py-2"
          role="alert"
        >
          <p className="font-display text-[length:var(--text-error-size)] text-danger-deep">
            This IFSC belongs to {resolved.bankName}.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => onUseBank(resolved.bankName)}>
            Use {resolved.bankName}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Post-onboarding self-service payout management for TEAM_MEMBER, reachable
 * from Settings → Profile. Reuses the same PUT /team/payout-profile contract,
 * validation schema, and BankCombobox/IFSC lookup as the onboarding payout
 * step — both bank transfer and UPI fields are required together (there is
 * no either/or method toggle in the current contract).
 */
export function PayoutSettingsPanel() {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bankName, setBankName] = useState("");
  const [ifsc, setIfsc] = useState("");

  const profileQuery = useQuery({
    queryKey: teamKeys.payoutProfile,
    queryFn: getOwnPayoutProfile,
  });

  const save = useMutation({
    mutationFn: (body: UpsertPayoutBody) => upsertPayoutProfile(body),
    onSuccess: (data) => {
      queryClient.setQueryData(teamKeys.payoutProfile, data);
      pushToast({ title: "Payout details saved", tone: "success" });
      setEditing(false);
      setErrors({});
    },
    onError: (error) => {
      pushToast({
        title: "Couldn’t save payout details",
        description: queryErrorMessage(error),
        tone: "danger",
      });
    },
  });

  function beginEdit(profile: PayoutProfile) {
    setBankName(profile.bankName ?? "");
    setIfsc(profile.ifsc ?? "");
    setErrors({});
    setEditing(true);
  }

  if (profileQuery.isPending) {
    return (
      <Card>
        <CardHeader kicker="Settings" title="Payout details" />
        <LoadingState label="Loading payout details" />
      </Card>
    );
  }

  if (profileQuery.isError) {
    if (isUnauthorizedError(profileQuery.error)) {
      return <ErrorState title="Session expired">{queryErrorMessage(profileQuery.error)}</ErrorState>;
    }
    return <ErrorState>{queryErrorMessage(profileQuery.error)}</ErrorState>;
  }

  const profile = profileQuery.data as PayoutProfile;

  if (!editing) {
    return (
      <Card>
        <CardHeader
          kicker="Settings"
          title="Payout details"
          description="Forge uses these details when sending your payouts."
          action={
            profile.configured ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => beginEdit(profile)}>
                Edit
              </Button>
            ) : undefined
          }
        />
        {!profile.configured ? (
          <EmptyState
            kicker="Not configured"
            title="No payout details on file"
            description="Add your bank and UPI details so Forge can pay you."
            action={
              <Button type="button" variant="secondary" size="sm" onClick={() => beginEdit(profile)}>
                Add payout details
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-6">
            <FactList
              items={[
                { label: "Account holder", value: profile.accountHolderName ?? "—" },
                { label: "Bank", value: profile.bankName ?? "—" },
                {
                  label: "Account number",
                  value: (
                    <SensitiveValue
                      label="account number"
                      masked={maskAccountNumber(profile.accountNumber)}
                      full={profile.accountNumber}
                    />
                  ),
                },
                {
                  label: "IFSC",
                  value: (
                    <SensitiveValue label="IFSC" masked={maskIfsc(profile.ifsc)} full={profile.ifsc} />
                  ),
                },
              ]}
            />
            <FactList
              items={[
                {
                  label: "UPI ID",
                  value: (
                    <SensitiveValue label="UPI ID" masked={maskUpi(profile.upiId)} full={profile.upiId} />
                  ),
                },
                { label: "UPI QR", value: profile.upiQr.uploaded ? "Uploaded" : "Not uploaded" },
              ]}
            />
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        kicker="Settings"
        title={profile.configured ? "Edit payout details" : "Add payout details"}
        description="Forge uses these details when sending your payouts."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const parsed = payoutFormSchema.safeParse({
            accountHolderName: form.get("accountHolderName"),
            bankName: form.get("bankName"),
            accountNumber: form.get("accountNumber"),
            ifsc: form.get("ifsc"),
            upiId: form.get("upiId"),
          });
          if (!parsed.success) {
            const next: Record<string, string> = {};
            for (const issue of parsed.error.issues) {
              const key = issue.path[0];
              if (typeof key === "string") next[key] = issue.message;
            }
            setErrors(next);
            return;
          }
          setErrors({});
          save.mutate(parsed.data);
        }}
      >
        <div className="flex flex-col gap-4 border-b border-steel/15 pb-6">
          <h3 className="font-display text-[length:var(--text-label-size)] font-semibold uppercase tracking-[0.08em] text-ink">
            Bank transfer
          </h3>
          <Field
            id="accountHolderName"
            label="Account holder name"
            required
            error={errors.accountHolderName}
          >
            <Input
              id="accountHolderName"
              name="accountHolderName"
              autoComplete="name"
              defaultValue={profile.accountHolderName ?? ""}
              invalid={Boolean(errors.accountHolderName)}
            />
          </Field>
          <Field id="bankName" label="Bank name" required error={errors.bankName}>
            <BankCombobox
              id="bankName"
              name="bankName"
              value={bankName}
              onChange={setBankName}
              invalid={Boolean(errors.bankName)}
            />
          </Field>
          <Field id="accountNumber" label="Account number" required error={errors.accountNumber}>
            <Input
              id="accountNumber"
              name="accountNumber"
              autoComplete="off"
              inputMode="numeric"
              defaultValue={profile.accountNumber ?? ""}
              invalid={Boolean(errors.accountNumber)}
            />
          </Field>
          <Field id="ifsc" label="IFSC" required error={errors.ifsc}>
            <Input
              id="ifsc"
              name="ifsc"
              autoComplete="off"
              spellCheck={false}
              className="uppercase"
              value={ifsc}
              onChange={(event) => setIfsc(event.target.value.toUpperCase())}
              onBlur={() => setIfsc((current) => current.trim())}
              invalid={Boolean(errors.ifsc)}
            />
          </Field>
          <IfscResolution ifsc={ifsc} bankName={bankName} onUseBank={setBankName} />
        </div>

        <div className="flex flex-col gap-4 pt-4">
          <h3 className="font-display text-[length:var(--text-label-size)] font-semibold uppercase tracking-[0.08em] text-ink">
            UPI
          </h3>
          <Field id="upiId" label="UPI ID" required error={errors.upiId}>
            <Input
              id="upiId"
              name="upiId"
              autoComplete="off"
              placeholder="name@bank"
              defaultValue={profile.upiId ?? ""}
              invalid={Boolean(errors.upiId)}
            />
          </Field>
        </div>

        <FormActions
          onCancel={() => {
            setEditing(false);
            setErrors({});
            setBankName(profile.bankName ?? "");
            setIfsc(profile.ifsc ?? "");
          }}
          pending={save.isPending}
          submitLabel="Save payout details"
        />
      </form>
    </Card>
  );
}
