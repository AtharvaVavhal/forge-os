-- Applied after Prisma migration create (hand-edited step).
-- Polymorphic exactly-one-parent CHECK constraints (Doc 2 §I).

ALTER TABLE activities
  ADD CONSTRAINT activities_exactly_one_parent_chk
  CHECK (
    (
      (company_id IS NOT NULL)::int +
      (contact_id IS NOT NULL)::int +
      (deal_id IS NOT NULL)::int +
      (project_id IS NOT NULL)::int
    ) = 1
  );

ALTER TABLE notes
  ADD CONSTRAINT notes_exactly_one_parent_chk
  CHECK (
    (
      (company_id IS NOT NULL)::int +
      (contact_id IS NOT NULL)::int +
      (deal_id IS NOT NULL)::int +
      (project_id IS NOT NULL)::int
    ) = 1
  );

ALTER TABLE documents
  ADD CONSTRAINT documents_exactly_one_parent_chk
  CHECK (
    (
      (company_id IS NOT NULL)::int +
      (contact_id IS NOT NULL)::int +
      (deal_id IS NOT NULL)::int +
      (project_id IS NOT NULL)::int +
      (invoice_id IS NOT NULL)::int
    ) = 1
  );

-- Invoice cached paid_amount must never exceed invoice amount.
ALTER TABLE invoices
  ADD CONSTRAINT invoices_paid_amount_lte_amount_chk
  CHECK (paid_amount <= amount);
