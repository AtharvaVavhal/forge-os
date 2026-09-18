"use client";

import { useState } from "react";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { FormActions } from "./page-chrome";
import {
  companyFormSchema,
  contactFormSchema,
  convertLeadFormSchema,
  dealFormSchema,
  emptyToUndefined,
  leadFormSchema,
  tagsFromInput,
  type CompanyFormValues,
  type ContactFormValues,
  type ConvertLeadFormValues,
  type DealFormValues,
  type LeadFormValues,
} from "../schemas/crm-forms";
import { LEAD_SOURCES, type Company, type Contact, type Deal, type Lead } from "../api/types";
import { enumLabel } from "../format";

function optional(value: string | null | undefined): string {
  return value ?? "";
}

export function CompanyFields({
  company,
  pending,
  onCancel,
  onSubmit,
}: {
  company?: Company;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: {
    name: string;
    gstin?: string;
    billingState?: string;
    billingAddress?: string;
    tags?: string[];
  }) => void;
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof CompanyFormValues, string>>>({});

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = companyFormSchema.safeParse({
          name: form.get("name"),
          gstin: form.get("gstin"),
          billingState: form.get("billingState"),
          billingAddress: form.get("billingAddress"),
          tags: form.get("tags"),
        });
        if (!parsed.success) {
          const next: Partial<Record<keyof CompanyFormValues, string>> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (typeof key === "string") next[key as keyof CompanyFormValues] = issue.message;
          }
          setErrors(next);
          return;
        }
        setErrors({});
        onSubmit({
          name: parsed.data.name,
          gstin: emptyToUndefined(parsed.data.gstin),
          billingState: emptyToUndefined(parsed.data.billingState),
          billingAddress: emptyToUndefined(parsed.data.billingAddress),
          tags: tagsFromInput(parsed.data.tags),
        });
      }}
    >
      <Field id="company-name" label="Name" required error={errors.name}>
        <Input id="company-name" name="name" defaultValue={company?.name} invalid={Boolean(errors.name)} />
      </Field>
      <Field id="company-gstin" label="GSTIN" error={errors.gstin}>
        <Input id="company-gstin" name="gstin" defaultValue={optional(company?.gstin)} />
      </Field>
      <Field id="company-state" label="Billing state" error={errors.billingState}>
        <Input id="company-state" name="billingState" defaultValue={optional(company?.billingState)} />
      </Field>
      <Field id="company-address" label="Billing address" error={errors.billingAddress}>
        <Textarea id="company-address" name="billingAddress" defaultValue={optional(company?.billingAddress)} />
      </Field>
      <Field id="company-tags" label="Tags" hint="Comma-separated." error={errors.tags}>
        <Input id="company-tags" name="tags" defaultValue={company?.tags.join(", ")} />
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel={company ? "Save" : "Create company"} />
    </form>
  );
}

export function ContactFields({
  contact,
  companies,
  pending,
  onCancel,
  onSubmit,
}: {
  contact?: Contact;
  companies: Company[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { name: string; email?: string; phone?: string; companyId?: string }) => void;
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormValues, string>>>({});

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = contactFormSchema.safeParse({
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          companyId: form.get("companyId"),
        });
        if (!parsed.success) {
          const next: Partial<Record<keyof ContactFormValues, string>> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (typeof key === "string") next[key as keyof ContactFormValues] = issue.message;
          }
          setErrors(next);
          return;
        }
        setErrors({});
        onSubmit({
          name: parsed.data.name,
          email: emptyToUndefined(parsed.data.email),
          phone: emptyToUndefined(parsed.data.phone),
          companyId: emptyToUndefined(parsed.data.companyId),
        });
      }}
    >
      <Field id="contact-name" label="Name" required error={errors.name}>
        <Input id="contact-name" name="name" defaultValue={contact?.name} invalid={Boolean(errors.name)} />
      </Field>
      <Field id="contact-email" label="Email" error={errors.email}>
        <Input id="contact-email" name="email" type="email" defaultValue={optional(contact?.email)} />
      </Field>
      <Field id="contact-phone" label="Phone" error={errors.phone}>
        <Input id="contact-phone" name="phone" defaultValue={optional(contact?.phone)} />
      </Field>
      <Field id="contact-company" label="Company" error={errors.companyId}>
        <Select id="contact-company" name="companyId" defaultValue={optional(contact?.companyId)}>
          <option value="">None</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </Select>
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel={contact ? "Save" : "Create contact"} />
    </form>
  );
}

export function LeadFields({
  lead,
  companies,
  contacts,
  pending,
  onCancel,
  onSubmit,
}: {
  lead?: Lead;
  companies: Company[];
  contacts: { id: string; name: string }[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: {
    source: LeadFormValues["source"];
    companyId?: string;
    contactId?: string;
    notes?: string;
  }) => void;
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof LeadFormValues, string>>>({});

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = leadFormSchema.safeParse({
          source: form.get("source"),
          companyId: form.get("companyId"),
          contactId: form.get("contactId"),
          notes: form.get("notes"),
        });
        if (!parsed.success) {
          const next: Partial<Record<keyof LeadFormValues, string>> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (typeof key === "string") next[key as keyof LeadFormValues] = issue.message;
          }
          setErrors(next);
          return;
        }
        setErrors({});
        onSubmit({
          source: parsed.data.source,
          companyId: emptyToUndefined(parsed.data.companyId),
          contactId: emptyToUndefined(parsed.data.contactId),
          notes: emptyToUndefined(parsed.data.notes),
        });
      }}
    >
      <Field id="lead-source" label="Source" required error={errors.source}>
        <Select id="lead-source" name="source" defaultValue={lead?.source ?? "OTHER"}>
          {LEAD_SOURCES.map((source) => (
            <option key={source} value={source}>
              {enumLabel(source)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="lead-company" label="Company" error={errors.companyId}>
        <Select id="lead-company" name="companyId" defaultValue={optional(lead?.companyId)}>
          <option value="">None</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="lead-contact" label="Contact" error={errors.contactId}>
        <Select id="lead-contact" name="contactId" defaultValue={optional(lead?.contactId)}>
          <option value="">None</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="lead-notes" label="Notes" error={errors.notes}>
        <Textarea id="lead-notes" name="notes" defaultValue={optional(lead?.notes)} />
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel={lead ? "Save" : "Create lead"} />
    </form>
  );
}

export function DealFields({
  deal,
  companies,
  contacts,
  pending,
  onCancel,
  onSubmit,
}: {
  deal?: Deal;
  companies: Company[];
  contacts: { id: string; name: string }[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: {
    title: string;
    estimatedValue: string;
    companyId?: string;
    contactId?: string;
  }) => void;
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof DealFormValues, string>>>({});

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = dealFormSchema.safeParse({
          title: form.get("title"),
          estimatedValue: form.get("estimatedValue"),
          companyId: form.get("companyId"),
          contactId: form.get("contactId"),
        });
        if (!parsed.success) {
          const next: Partial<Record<keyof DealFormValues, string>> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (typeof key === "string") next[key as keyof DealFormValues] = issue.message;
          }
          setErrors(next);
          return;
        }
        setErrors({});
        onSubmit({
          title: parsed.data.title,
          estimatedValue: parsed.data.estimatedValue,
          companyId: emptyToUndefined(parsed.data.companyId),
          contactId: emptyToUndefined(parsed.data.contactId),
        });
      }}
    >
      <Field id="deal-title" label="Title" required error={errors.title}>
        <Input id="deal-title" name="title" defaultValue={deal?.title} invalid={Boolean(errors.title)} />
      </Field>
      <Field
        id="deal-value"
        label="Estimated value"
        required
        hint="Decimal string, e.g. 12000.00"
        error={errors.estimatedValue}
      >
        <Input
          id="deal-value"
          name="estimatedValue"
          inputMode="decimal"
          defaultValue={optional(deal?.estimatedValue)}
          invalid={Boolean(errors.estimatedValue)}
        />
      </Field>
      <Field id="deal-company" label="Company" error={errors.companyId}>
        <Select id="deal-company" name="companyId" defaultValue={optional(deal?.companyId)}>
          <option value="">None</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="deal-contact" label="Contact" error={errors.contactId}>
        <Select id="deal-contact" name="contactId" defaultValue={optional(deal?.contactId)}>
          <option value="">None</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name}
            </option>
          ))}
        </Select>
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel={deal ? "Save" : "Create deal"} />
    </form>
  );
}

export function ConvertLeadFields({
  defaultTitle,
  pending,
  onCancel,
  onSubmit,
}: {
  defaultTitle?: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { title: string; estimatedValue: string }) => void;
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof ConvertLeadFormValues, string>>>({});

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = convertLeadFormSchema.safeParse({
          title: form.get("title"),
          estimatedValue: form.get("estimatedValue"),
        });
        if (!parsed.success) {
          const next: Partial<Record<keyof ConvertLeadFormValues, string>> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (typeof key === "string") next[key as keyof ConvertLeadFormValues] = issue.message;
          }
          setErrors(next);
          return;
        }
        setErrors({});
        onSubmit({
          title: parsed.data.title,
          estimatedValue: parsed.data.estimatedValue,
        });
      }}
    >
      <Field id="convert-title" label="Deal title" required error={errors.title}>
        <Input
          id="convert-title"
          name="title"
          defaultValue={defaultTitle}
          invalid={Boolean(errors.title)}
        />
      </Field>
      <Field
        id="convert-value"
        label="Estimated value"
        required
        hint="Exactly two decimal places, e.g. 12000.00"
        error={errors.estimatedValue}
      >
        <Input
          id="convert-value"
          name="estimatedValue"
          inputMode="decimal"
          placeholder="12000.00"
          invalid={Boolean(errors.estimatedValue)}
        />
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel="Confirm conversion" />
    </form>
  );
}
