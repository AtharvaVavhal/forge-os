# FORGE Business OS — Database Specification (Frozen Architecture v1)

Target: NestJS + PostgreSQL + Prisma. This document is the source of truth for schema implementation. No new product features. No redesign. Two underspecified gaps resolved per the note at delivery time (Role → enum, not table; CreditNote given line items) — everything else below implements the frozen architecture as reviewed.

All monetary fields use `Decimal @db.Decimal(12, 2)` — **never Float, never Int-as-paise unless stated**. `Decimal(12,2)` supports up to 999,999,999,999.99, more than sufficient headroom.

All primary keys: `Uuid @default(dbgenerated("gen_random_uuid()")) @db.Uuid` — DB-generated, not client-generated, so concurrent writers never collide and the DB is authoritative.

All entities carry `organization_id Uuid` (non-nullable, defaulted to the single seeded org) per the frozen future-scale decision — omitted from the per-entity tables below for brevity, but present on every table and included in the Prisma schema.

---

## Enum Definitions

```
UserRole          FOUNDER_ADMIN | OPERATIONS | FINANCE | SALES | TEAM_MEMBER
LeadStatus        NEW | CONTACTED | QUALIFIED | CONVERTED | DISQUALIFIED
LeadSource        REFERRAL | INBOUND_FORM | COLD_OUTREACH | LINKEDIN | PAST_CLIENT | EVENT | OTHER
DealStage         NEW | CONTACTED | QUALIFIED | DISCOVERY | PROPOSAL_SENT | NEGOTIATION | WON | LOST
DealLostReason    PRICE | TIMING | CHOSE_COMPETITOR | NO_BUDGET | GHOSTED | NOT_A_FIT | OTHER
ProposalStatus    DRAFT | SENT | VIEWED | ACCEPTED | REJECTED | EXPIRED
ProjectStatus     ACTIVE | ON_HOLD | AT_RISK | COMPLETED | CANCELLED
ProjectPhase      PLANNING | DESIGN | DEVELOPMENT | QA | CLIENT_REVIEW | DEPLOYMENT | HANDOVER | COMPLETED
MilestoneStatus   PENDING | IN_PROGRESS | AWAITING_APPROVAL | COMPLETED
TaskStatus        TODO | IN_PROGRESS | IN_REVIEW | DONE
TaskPriority      LOW | MEDIUM | HIGH | URGENT
InvoiceStatus     DRAFT | SENT | PARTIALLY_PAID | PAID | OVERDUE | VOID | CANCELLED
PaymentStatus     PENDING | COMPLETED | FAILED | REVERSED
PaymentMethod     RAZORPAY | CASH | BANK_TRANSFER | CHEQUE
RefundStatus      PENDING | COMPLETED | FAILED
CreditNoteReason  SCOPE_REDUCTION | PRICING_ERROR | CANCELLATION | GOODWILL | OTHER
ForgeFundEntryType CONTRIBUTION | WITHDRAWAL | ALLOCATION
MaintenanceStatus ACTIVE | EXPIRED | RENEWED | CANCELLED
TicketStatus      OPEN | IN_PROGRESS | WAITING_ON_CLIENT | RESOLVED | CLOSED | REOPENED
DocumentCategory  PROPOSAL | CONTRACT | INVOICE | RECEIPT | HANDOVER | REQUIREMENT | CLIENT_ASSET | INTERNAL
Visibility        INTERNAL | CLIENT_VISIBLE
TaxTreatment      CGST_SGST | IGST | EXEMPT
ActorType         USER | CLIENT_USER | SYSTEM
RecipientType      USER | CLIENT_USER
NotificationChannel IN_APP | EMAIL
InvitationScope   TEAM | CLIENT
WebhookSource     RAZORPAY
WebhookStatus     RECEIVED | PROCESSED | FAILED
DomainEventStatus PENDING | PROCESSED | FAILED

```

---

## Entity Reference

Each table: field / type / null? / default / notes. `organization_id`, `created_at`, `updated_at` omitted from every table below (present on all, standard shape: `organization_id Uuid NOT NULL`, `created_at timestamptz default now()`, `updated_at timestamptz auto-updated`).

### Platform / Shared

**Organization**

| **FieldTypeNullDefaultNotes** |        |     |     |                                                                              |
| ----------------------------- | ------ | --- | --- | ---------------------------------------------------------------------------- |
| id                            | Uuid   | No  | gen | PK                                                                           |
| name                          | String | No  | —   |                                                                              |
| gstin                         | String | Yes | —   | nullable — not all orgs GST-registered in theory, Forge itself will have one |
| billing\_state                | String | No  | —   | required — drives CGST/SGST vs IGST branch                                   |
| billing\_address              | String | No  | —   |                                                                              |

**User**

| **FieldTypeNullDefaultNotes** |             |     |      |                                 |
| ----------------------------- | ----------- | --- | ---- | ------------------------------- |
| id                            | Uuid        | No  | gen  | PK                              |
| email                         | String      | No  | —    | unique(organization\_id, email) |
| name                          | String      | No  | —    |                                 |
| role                          | UserRole    | No  | —    |                                 |
| password\_hash                | String      | Yes | —    | nullable if SSO-only            |
| active                        | Boolean     | No  | true |                                 |
| last\_login\_at               | Timestamptz | Yes | —    |                                 |

**ClientUser** (portal identity — architecturally separate from User, §5/§6 of red team)

| **FieldTypeNullDefaultNotes** |             |     |      |                                  |
| ----------------------------- | ----------- | --- | ---- | -------------------------------- |
| id                            | Uuid        | No  | gen  | PK                               |
| company\_id                   | Uuid        | No  | —    | FK → Company, RESTRICT           |
| contact\_id                   | Uuid        | Yes | —    | FK → Contact, SET NULL           |
| email                         | String      | No  | —    | unique(organization\_id, email)  |
| password\_hash                | String      | Yes | —    | nullable, magic-link supported   |
| active                        | Boolean     | No  | true | checked per-request, §6 red team |
| last\_login\_at               | Timestamptz | Yes | —    |                                  |

**InvitationToken**

| **FieldTypeNullDefaultNotes** |                 |     |     |                                      |
| ----------------------------- | --------------- | --- | --- | ------------------------------------ |
| id                            | Uuid            | No  | gen | PK                                   |
| token\_hash                   | String          | No  | —   | unique — store hash, never raw token |
| scope                         | InvitationScope | No  | —   | TEAM or CLIENT                       |
| email                         | String          | No  | —   |                                      |
| user\_role                    | UserRole        | Yes | —   | set if scope=TEAM                    |
| company\_id                   | Uuid            | Yes | —   | FK → Company, set if scope=CLIENT    |
| expires\_at                   | Timestamptz     | No  | —   |                                      |
| used\_at                      | Timestamptz     | Yes | —   | single-use                           |
| revoked\_at                   | Timestamptz     | Yes | —   |                                      |
| created\_by                   | Uuid            | No  | —   | FK → User                            |

**TaxRate**

| **FieldTypeNullDefaultNotes** |              |     |     |                             |
| ----------------------------- | ------------ | --- | --- | --------------------------- |
| id                            | Uuid         | No  | gen | PK                          |
| hsn\_sac\_code                | String       | No  | —   |                             |
| description                   | String       | No  | —   |                             |
| cgst\_rate                    | Decimal(5,2) | No  | —   |                             |
| sgst\_rate                    | Decimal(5,2) | No  | —   |                             |
| igst\_rate                    | Decimal(5,2) | No  | —   |                             |
| effective\_from               | Date         | No  | —   |                             |
| effective\_to                 | Date         | Yes | —   | nullable = currently active |

**InvoiceSequence** (atomic FY-scoped numbering, §19)

| **FieldTypeNullDefaultNotes** |        |    |     |                             |
| ----------------------------- | ------ | -- | --- | --------------------------- |
| id                            | Uuid   | No | gen | PK                          |
| financial\_year               | String | No | —   | e.g. "2025-26"              |
| last\_number                  | Int    | No | 0   | incremented transactionally |

`unique(organization_id, financial_year)` — one counter row per org per FY, updated via `SELECT ... FOR UPDATE` inside the invoice-creation transaction.

**Activity** (polymorphic)

| **FieldTypeNullDefaultNotes** |             |     |       |                                          |
| ----------------------------- | ----------- | --- | ----- | ---------------------------------------- |
| id                            | Uuid        | No  | gen   | PK                                       |
| type                          | String      | No  | —     | call / email / meeting / note-logged etc |
| summary                       | String      | No  | —     |                                          |
| occurred\_at                  | Timestamptz | No  | now() |                                          |
| company\_id                   | Uuid        | Yes | —     | exactly one of these 4 set               |
| contact\_id                   | Uuid        | Yes | —     |                                          |
| deal\_id                      | Uuid        | Yes | —     |                                          |
| project\_id                   | Uuid        | Yes | —     |                                          |
| created\_by                   | Uuid        | No  | —     | FK → User                                |

CHECK: exactly one of `company_id, contact_id, deal_id, project_id` non-null.

**Note** (polymorphic)

| **FieldTypeNullDefaultNotes**                      |            |     |          |                               |
| -------------------------------------------------- | ---------- | --- | -------- | ----------------------------- |
| id                                                 | Uuid       | No  | gen      | PK                            |
| body                                               | Text       | No  | —        |                               |
| visibility                                         | Visibility | No  | INTERNAL |                               |
| company\_id / contact\_id / deal\_id / project\_id | Uuid       | Yes | —        | exactly one set, same pattern |
| created\_by                                        | Uuid       | No  | —        | FK → User                     |

**Document** (polymorphic)

| **FieldTypeNullDefaultNotes**                                    |                  |     |          |                                 |
| ---------------------------------------------------------------- | ---------------- | --- | -------- | ------------------------------- |
| id                                                               | Uuid             | No  | gen      | PK                              |
| filename                                                         | String           | No  | —        |                                 |
| storage\_key                                                     | String           | No  | —        | R2 object key                   |
| mime\_type                                                       | String           | No  | —        |                                 |
| size\_bytes                                                      | Int              | No  | —        |                                 |
| category                                                         | DocumentCategory | No  | —        |                                 |
| visibility                                                       | Visibility       | No  | INTERNAL |                                 |
| company\_id / contact\_id / deal\_id / project\_id / invoice\_id | Uuid             | Yes | —        | exactly one set                 |
| uploaded\_by                                                     | Uuid             | No  | —        | FK → User                       |
| deleted\_at                                                      | Timestamptz      | Yes | —        | soft delete, retained in R2 90d |

**Notification**

| **FieldTypeNullDefaultNotes** |                     |     |     |                                                                   |
| ----------------------------- | ------------------- | --- | --- | ----------------------------------------------------------------- |
| id                            | Uuid                | No  | gen | PK                                                                |
| recipient\_type               | RecipientType       | No  | —   |                                                                   |
| recipient\_id                 | Uuid                | No  | —   | polymorphic-ish by type, not a DB FK (two possible target tables) |
| type                          | String              | No  | —   | matches DomainEvent-derived notification type                     |
| channel                       | NotificationChannel | No  | —   |                                                                   |
| payload                       | Json                | No  | —   |                                                                   |
| read\_at                      | Timestamptz         | Yes | —   |                                                                   |

**AuditLog** (immutable — see §I, DB-level no UPDATE/DELETE grant)

| **FieldTypeNullDefaultNotes** |             |     |       |                                     |
| ----------------------------- | ----------- | --- | ----- | ----------------------------------- |
| id                            | Uuid        | No  | gen   | PK                                  |
| actor\_type                   | ActorType   | No  | —     |                                     |
| actor\_id                     | Uuid        | Yes | —     | null if SYSTEM                      |
| action                        | String      | No  | —     | e.g. "deal.stage\_changed"          |
| entity\_type                  | String      | No  | —     |                                     |
| entity\_id                    | Uuid        | No  | —     |                                     |
| before                        | Json        | Yes | —     |                                     |
| after                         | Json        | Yes | —     |                                     |
| ip\_address                   | String      | Yes | —     | only for security-sensitive actions |
| created\_at                   | Timestamptz | No  | now() |                                     |

No `updated_at` — this table is never updated.

**WebhookEvent**

| **FieldTypeNullDefaultNotes** |               |     |          |                                     |
| ----------------------------- | ------------- | --- | -------- | ----------------------------------- |
| id                            | Uuid          | No  | gen      | PK                                  |
| source                        | WebhookSource | No  | —        |                                     |
| external\_event\_id           | String        | No  | —        | unique(source, external\_event\_id) |
| event\_type                   | String        | No  | —        |                                     |
| payload                       | Json          | No  | —        | raw payload, for replay/debugging   |
| status                        | WebhookStatus | No  | RECEIVED |                                     |
| processed\_at                 | Timestamptz   | Yes | —        |                                     |
| error                         | Text          | Yes | —        |                                     |

**DomainEvent** (transactional outbox, §3 red team)

| **FieldTypeNullDefaultNotes** |                   |     |         |                                   |
| ----------------------------- | ----------------- | --- | ------- | --------------------------------- |
| id                            | Uuid              | No  | gen     | PK                                |
| type                          | String            | No  | —       | e.g. "DealWon", "PaymentReceived" |
| aggregate\_type               | String            | No  | —       | e.g. "Deal"                       |
| aggregate\_id                 | Uuid              | No  | —       |                                   |
| payload                       | Json              | No  | —       |                                   |
| status                        | DomainEventStatus | No  | PENDING |                                   |
| attempts                      | Int               | No  | 0       |                                   |
| last\_error                   | Text              | Yes | —       |                                   |
| processed\_at                 | Timestamptz       | Yes | —       |                                   |

Index: `(status, created_at)` — worker polls `WHERE status = 'PENDING' ORDER BY created_at`.

### CRM

**Company**

| **FieldTypeNullDefaultNotes** |             |     |     |                                                     |
| ----------------------------- | ----------- | --- | --- | --------------------------------------------------- |
| id                            | Uuid        | No  | gen | PK                                                  |
| name                          | String      | No  | —   |                                                     |
| gstin                         | String      | Yes | —   |                                                     |
| billing\_state                | String      | Yes | —   | required at invoice time, not company-creation time |
| billing\_address              | String      | Yes | —   |                                                     |
| tags                          | String[]    | No  | []  |                                                     |
| archived\_at                  | Timestamptz | Yes | —   | soft delete                                         |

**Contact**

| **FieldTypeNullDefaultNotes** |             |     |     |                                                        |
| ----------------------------- | ----------- | --- | --- | ------------------------------------------------------ |
| id                            | Uuid        | No  | gen | PK                                                     |
| company\_id                   | Uuid        | Yes | —   | FK → Company, RESTRICT                                 |
| name                          | String      | No  | —   |                                                        |
| email                         | String      | Yes | —   | unique(organization\_id, company\_id, email) where set |
| phone                         | String      | Yes | —   |                                                        |
| archived\_at                  | Timestamptz | Yes | —   |                                                        |

**Lead**

| **FieldTypeNullDefaultNotes** |             |     |       |                             |
| ----------------------------- | ----------- | --- | ----- | --------------------------- |
| id                            | Uuid        | No  | gen   | PK                          |
| contact\_id                   | Uuid        | Yes | —     | FK → Contact                |
| company\_id                   | Uuid        | Yes | —     | FK → Company                |
| status                        | LeadStatus  | No  | NEW   |                             |
| source                        | LeadSource  | No  | OTHER |                             |
| notes                         | Text        | Yes | —     |                             |
| converted\_to\_deal\_id       | Uuid        | Yes | —     | FK → Deal, set on CONVERTED |
| archived\_at                  | Timestamptz | Yes | —     |                             |

**Deal**

| **FieldTypeNullDefaultNotes** |                |     |     |                                                                                                                              |
| ----------------------------- | -------------- | --- | --- | ---------------------------------------------------------------------------------------------------------------------------- |
| id                            | Uuid           | No  | gen | PK                                                                                                                           |
| title                         | String         | No  | —   |                                                                                                                              |
| company\_id                   | Uuid           | Yes | —   | FK → Company, RESTRICT                                                                                                       |
| contact\_id                   | Uuid           | Yes | —   | FK → Contact, RESTRICT                                                                                                       |
| stage                         | DealStage      | No  | NEW |                                                                                                                              |
| estimated\_value              | Decimal(12,2)  | No  | —   |                                                                                                                              |
| owner\_id                     | Uuid           | No  | —   | FK → User                                                                                                                    |
| lost\_reason                  | DealLostReason | Yes | —   | required by app logic when stage=LOST (not a DB CHECK — enum default can't conditionally require, enforced in service layer) |
| next\_follow\_up\_at          | Timestamptz    | Yes | —   |                                                                                                                              |
| reopened\_from\_deal\_id      | Uuid           | Yes | —   | self-FK, §2 red team                                                                                                         |
| archived\_at                  | Timestamptz    | Yes | —   | never actually used — Won/Lost deals stay visible, this exists for the rare true-mistake case                                |

### Sales

**Proposal** (immutable per version — §1/§2 red team)

| **FieldTypeNullDefaultNotes** |                |     |       |                           |
| ----------------------------- | -------------- | --- | ----- | ------------------------- |
| id                            | Uuid           | No  | gen   | PK                        |
| deal\_id                      | Uuid           | No  | —     | FK → Deal, RESTRICT       |
| version                       | Int            | No  | —     | unique(deal\_id, version) |
| status                        | ProposalStatus | No  | DRAFT |                           |
| terms                         | Text           | Yes | —     |                           |
| sent\_at                      | Timestamptz    | Yes | —     |                           |
| viewed\_at                    | Timestamptz    | Yes | —     |                           |
| accepted\_at                  | Timestamptz    | Yes | —     |                           |
| rejected\_at                  | Timestamptz    | Yes | —     |                           |
| expires\_at                   | Timestamptz    | Yes | —     |                           |
| created\_by                   | Uuid           | No  | —     | FK → User                 |

No `updated_at`-driven edits post-Sent — enforced at service layer (immutability is a business rule, not something Postgres can express beyond "don't grant UPDATE on frozen columns," which is unnecessary ceremony at this team size — service-layer enforcement is sufficient here, unlike AuditLog where the risk profile justifies the DB-level lock).

**ProposalLineItem**

| **FieldTypeNullDefaultNotes** |               |     |     |                                                         |
| ----------------------------- | ------------- | --- | --- | ------------------------------------------------------- |
| id                            | Uuid          | No  | gen | PK                                                      |
| proposal\_id                  | Uuid          | No  | —   | FK → Proposal, CASCADE (child has no independent value) |
| description                   | String        | No  | —   |                                                         |
| quantity                      | Decimal(10,2) | No  | 1   |                                                         |
| unit\_price                   | Decimal(12,2) | No  | —   |                                                         |
| tax\_rate\_id                 | Uuid          | Yes | —   | FK → TaxRate                                            |
| sort\_order                   | Int           | No  | 0   |                                                         |

### Projects

**Project**

| **FieldTypeNullDefaultNotes** |               |     |          |                                                             |
| ----------------------------- | ------------- | --- | -------- | ----------------------------------------------------------- |
| id                            | Uuid          | No  | gen      | PK                                                          |
| name                          | String        | No  | —        |                                                             |
| deal\_id                      | Uuid          | Yes | —        | FK → Deal, RESTRICT — nullable (internal/pro-bono projects) |
| accepted\_proposal\_id        | Uuid          | Yes | —        | FK → Proposal, immutable after set                          |
| company\_id                   | Uuid          | No  | —        | FK → Company, RESTRICT                                      |
| status                        | ProjectStatus | No  | ACTIVE   |                                                             |
| phase                         | ProjectPhase  | No  | PLANNING |                                                             |
| owner\_id                     | Uuid          | No  | —        | FK → User                                                   |
| deadline                      | Date          | Yes | —        |                                                             |
| handover\_checklist           | Json          | No  | `[]`     | JSONB — array of `{item, done, done_at, done_by}`           |
| completed\_at                 | Timestamptz   | Yes | —        |                                                             |

**Milestone**

| **FieldTypeNullDefaultNotes** |                 |     |         |                       |
| ----------------------------- | --------------- | --- | ------- | --------------------- |
| id                            | Uuid            | No  | gen     | PK                    |
| project\_id                   | Uuid            | No  | —       | FK → Project, CASCADE |
| name                          | String          | No  | —       |                       |
| status                        | MilestoneStatus | No  | PENDING |                       |
| requires\_client\_approval    | Boolean         | No  | false   |                       |
| approved\_at                  | Timestamptz     | Yes | —       |                       |
| approved\_by\_contact\_id     | Uuid            | Yes | —       | FK → Contact          |
| due\_date                     | Date            | Yes | —       |                       |
| sort\_order                   | Int             | No  | 0       |                       |

**Task**

| **FieldTypeNullDefaultNotes** |              |     |        |                                             |
| ----------------------------- | ------------ | --- | ------ | ------------------------------------------- |
| id                            | Uuid         | No  | gen    | PK                                          |
| project\_id                   | Uuid         | No  | —      | FK → Project, CASCADE                       |
| milestone\_id                 | Uuid         | Yes | —      | FK → Milestone, SET NULL                    |
| title                         | String       | No  | —      |                                             |
| status                        | TaskStatus   | No  | TODO   |                                             |
| priority                      | TaskPriority | No  | MEDIUM |                                             |
| assignee\_id                  | Uuid         | Yes | —      | FK → User                                   |
| due\_date                     | Date         | Yes | —      |                                             |
| blocked\_by\_task\_id         | Uuid         | Yes | —      | self-FK, simple single-blocker not full DAG |

**TimeEntry**

| **FieldTypeNullDefaultNotes** |      |    |     |                    |
| ----------------------------- | ---- | -- | --- | ------------------ |
| id                            | Uuid | No | gen | PK                 |
| task\_id                      | Uuid | No | —   | FK → Task, CASCADE |
| user\_id                      | Uuid | No | —   | FK → User          |
| minutes                       | Int  | No | —   |                    |
| logged\_at                    | Date | No | —   |                    |

### Finance

**Invoice**

| **FieldTypeNullDefaultNotes** |               |     |       |                                                                                                                        |
| ----------------------------- | ------------- | --- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| id                            | Uuid          | No  | gen   | PK                                                                                                                     |
| invoice\_number               | String        | No  | —     | unique(organization\_id, financial\_year, invoice\_number) — generated via InvoiceSequence                             |
| financial\_year               | String        | No  | —     |                                                                                                                        |
| project\_id                   | Uuid          | Yes | —     | FK → Project, RESTRICT                                                                                                 |
| maintenance\_contract\_id     | Uuid          | Yes | —     | FK → MaintenanceContract, RESTRICT                                                                                     |
| company\_id                   | Uuid          | No  | —     | FK → Company, RESTRICT — denormalized even though derivable via project, because retainer invoices may have no project |
| status                        | InvoiceStatus | No  | DRAFT |                                                                                                                        |
| tax\_treatment                | TaxTreatment  | No  | —     | computed at creation from org/company billing state, then frozen                                                       |
| bill\_to\_snapshot            | Json          | No  | —     | company name/GSTIN/address at time of send — frozen (§1 red team)                                                      |
| amount                        | Decimal(12,2) | No  | —     | sum of line items, computed at finalize                                                                                |
| paid\_amount                  | Decimal(12,2) | No  | 0     | **cached**, updated transactionally on Payment (§1/§4 red team)                                                        |
| due\_date                     | Date          | Yes | —     |                                                                                                                        |
| sent\_at                      | Timestamptz   | Yes | —     |                                                                                                                        |
| cancelled\_at                 | Timestamptz   | Yes | —     |                                                                                                                        |
| cancellation\_reason          | Text          | Yes | —     |                                                                                                                        |
| version                       | Int           | No  | 1     | optimistic lock                                                                                                        |

CHECK: `paid_amount <= amount` (app-enforced too, but a DB CHECK is cheap insurance here since it's a pure numeric invariant, unlike the polymorphic exactly-one-FK case which needs the CHECK for a different reason).

**InvoiceLineItem** (immutable snapshot — §1/§F red team, the most important correction in the whole review)

| **FieldTypeNullDefaultNotes** |               |    |     |                                                       |
| ----------------------------- | ------------- | -- | --- | ----------------------------------------------------- |
| id                            | Uuid          | No | gen | PK                                                    |
| invoice\_id                   | Uuid          | No | —   | FK → Invoice, CASCADE                                 |
| description                   | String        | No | —   | copied value, not FK to ProposalLineItem              |
| hsn\_sac\_code                | String        | No | —   | copied value from TaxRate at creation time            |
| quantity                      | Decimal(10,2) | No | —   |                                                       |
| unit\_price                   | Decimal(12,2) | No | —   |                                                       |
| cgst\_rate                    | Decimal(5,2)  | No | 0   | copied value                                          |
| sgst\_rate                    | Decimal(5,2)  | No | 0   | copied value                                          |
| igst\_rate                    | Decimal(5,2)  | No | 0   | copied value                                          |
| line\_total                   | Decimal(12,2) | No | —   | computed at creation, stored (not recomputed on read) |
| sort\_order                   | Int           | No | 0   |                                                       |

No FK to `ProposalLineItem` or `TaxRate` on this table by design — every value is copied at Invoice-finalize time. This is the immutability guarantee: nothing upstream changing can alter a sent invoice.

**Payment**

| **FieldTypeNullDefaultNotes** |               |     |         |                                                            |
| ----------------------------- | ------------- | --- | ------- | ---------------------------------------------------------- |
| id                            | Uuid          | No  | gen     | PK                                                         |
| invoice\_id                   | Uuid          | No  | —       | FK → Invoice, RESTRICT                                     |
| amount                        | Decimal(12,2) | No  | —       |                                                            |
| method                        | PaymentMethod | No  | —       |                                                            |
| status                        | PaymentStatus | No  | PENDING |                                                            |
| razorpay\_payment\_id         | String        | Yes | —       | unique — null for offline methods                          |
| razorpay\_order\_id           | String        | Yes | —       |                                                            |
| reference\_note               | String        | Yes | —       | bank ref / UPI ref / cheque no, for offline                |
| recorded\_by                  | Uuid          | Yes | —       | FK → User, required (app-enforced) when method != RAZORPAY |
| paid\_at                      | Timestamptz   | Yes | —       |                                                            |
| version                       | Int           | No  | 1       | optimistic lock                                            |

**Refund**

| **FieldTypeNullDefaultNotes** |               |     |         |                        |
| ----------------------------- | ------------- | --- | ------- | ---------------------- |
| id                            | Uuid          | No  | gen     | PK                     |
| payment\_id                   | Uuid          | No  | —       | FK → Payment, RESTRICT |
| amount                        | Decimal(12,2) | No  | —       |                        |
| reason                        | Text          | No  | —       |                        |
| status                        | RefundStatus  | No  | PENDING |                        |
| razorpay\_refund\_id          | String        | Yes | —       | unique                 |
| approved\_by                  | Uuid          | No  | —       | FK → User              |

**CreditNote** (GST correction document — distinct from Refund, §4 red team; gap-filled shape per note above)

| **FieldTypeNullDefaultNotes** |                  |    |       |                                                                                                                      |
| ----------------------------- | ---------------- | -- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| id                            | Uuid             | No | gen   | PK                                                                                                                   |
| credit\_note\_number          | String           | No | —     | unique(organization\_id, financial\_year, credit\_note\_number) — same sequence pattern as Invoice, separate counter |
| financial\_year               | String           | No | —     |                                                                                                                      |
| invoice\_id                   | Uuid             | No | —     | FK → Invoice, RESTRICT                                                                                               |
| reason                        | CreditNoteReason | No | —     |                                                                                                                      |
| amount                        | Decimal(12,2)    | No | —     | may be 0 for pure-documentation corrections with no money movement                                                   |
| issued\_at                    | Timestamptz      | No | now() |                                                                                                                      |
| approved\_by                  | Uuid             | No | —     | FK → User                                                                                                            |

**CreditNoteLineItem**

| **FieldTypeNullDefaultNotes**     |               |     |     |                                                                                |
| --------------------------------- | ------------- | --- | --- | ------------------------------------------------------------------------------ |
| id                                | Uuid          | No  | gen | PK                                                                             |
| credit\_note\_id                  | Uuid          | No  | —   | FK → CreditNote, CASCADE                                                       |
| original\_invoice\_line\_item\_id | Uuid          | Yes | —   | FK → InvoiceLineItem, RESTRICT — reference only, for traceability, not mutated |
| description                       | String        | No  | —   |                                                                                |
| amount                            | Decimal(12,2) | No  | —   |                                                                                |

**Expense**

| **FieldTypeNullDefaultNotes** |               |     |     |                                                                       |
| ----------------------------- | ------------- | --- | --- | --------------------------------------------------------------------- |
| id                            | Uuid          | No  | gen | PK                                                                    |
| project\_id                   | Uuid          | Yes | —   | FK → Project, RESTRICT — nullable, org-level expenses exist           |
| description                   | String        | No  | —   |                                                                       |
| amount                        | Decimal(12,2) | No  | —   |                                                                       |
| category                      | String        | No  | —   | free text, not enum — not worth a controlled vocabulary at this scale |
| incurred\_at                  | Date          | No  | —   |                                                                       |
| recorded\_by                  | Uuid          | No  | —   | FK → User                                                             |

**ForgeFundEntry** (append-only ledger — §5/§F red team)

| **FieldTypeNullDefaultNotes** |                    |     |     |                                                               |
| ----------------------------- | ------------------ | --- | --- | ------------------------------------------------------------- |
| id                            | Uuid               | No  | gen | PK                                                            |
| type                          | ForgeFundEntryType | No  | —   |                                                               |
| amount                        | Decimal(12,2)      | No  | —   | positive for CONTRIBUTION, negative for WITHDRAWAL/ALLOCATION |
| source\_type                  | String             | Yes | —   | e.g. "payment"                                                |
| source\_id                    | Uuid               | Yes | —   | e.g. payment\_id                                              |
| reason                        | Text               | No  | —   |                                                               |
| approved\_by                  | Uuid               | No  | —   | FK → User                                                     |

`unique(organization_id, source_type, source_id, type) WHERE source_id IS NOT NULL` — prevents automatic double-contribution from the same payment; manual entries (`source_id = null`) are unconstrained by this index since partial unique indexes exclude NULLs naturally.

**MaintenanceContract**

| **FieldTypeNullDefaultNotes** |                   |     |        |                        |
| ----------------------------- | ----------------- | --- | ------ | ---------------------- |
| id                            | Uuid              | No  | gen    | PK                     |
| project\_id                   | Uuid              | No  | —      | FK → Project, RESTRICT |
| status                        | MaintenanceStatus | No  | ACTIVE |                        |
| monthly\_fee                  | Decimal(12,2)     | No  | —      |                        |
| starts\_at                    | Date              | No  | —      |                        |
| ends\_at                      | Date              | No  | —      |                        |
| renewed\_from\_contract\_id   | Uuid              | Yes | —      | self-FK, history chain |
| cancelled\_at                 | Timestamptz       | Yes | —      |                        |
| cancellation\_reason          | Text              | Yes | —      |                        |

**SupportTicket**

| **FieldTypeNullDefaultNotes** |              |     |      |                                               |
| ----------------------------- | ------------ | --- | ---- | --------------------------------------------- |
| id                            | Uuid         | No  | gen  | PK                                            |
| maintenance\_contract\_id     | Uuid         | Yes | —    | FK → MaintenanceContract, RESTRICT            |
| project\_id                   | Uuid         | No  | —    | FK → Project, RESTRICT                        |
| raised\_by\_client\_user\_id  | Uuid         | No  | —    | FK → ClientUser                               |
| subject                       | String       | No  | —    |                                               |
| status                        | TicketStatus | No  | OPEN |                                               |
| resolved\_at                  | Timestamptz  | Yes | —    |                                               |
| reopen\_deadline              | Timestamptz  | Yes | —    | set on resolved\_at + 7d, blocks reopen after |

---

## 12. Delete Behavior

| **RelationshipBehaviorWhy**                              |            |                                                                                                                 |
| -------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| Invoice/Payment/Deal/Project → Company/Contact           | `RESTRICT` | financial/historical, §1 red team — never allow a Company hygiene action to cascade into money records          |
| InvoiceLineItem, CreditNoteLineItem → Invoice/CreditNote | `CASCADE`  | pure child rows, no independent value, only ever deleted alongside a still-Draft parent                         |
| ProposalLineItem → Proposal                              | `CASCADE`  | same reasoning                                                                                                  |
| Milestone, Task → Project                                | `CASCADE`  | project deletion (soft, rare) takes its own children                                                            |
| TimeEntry → Task                                         | `CASCADE`  |                                                                                                                 |
| Refund → Payment                                         | `RESTRICT` | Payment must survive independently                                                                              |
| Everything → User (owner/assignee/created\_by)           | `RESTRICT` | never let a user hard-delete take business records with it — deactivate the User (`active=false`), don't delete |

## 13. Soft-Delete Behavior

Soft delete (`archived_at` / `deleted_at`) on: Company, Contact, Lead, Deal, Document. NOT on Invoice/Payment/CreditNote/Refund — these are never deleted in any form (Void/Cancelled status covers the "this shouldn't count" case while preserving the record, per §2 red team state machines). Enforced via a Prisma middleware injecting `WHERE deleted_at IS NULL` (or `archived_at IS NULL`) on all default finds for the soft-deletable models — not per-query discipline.

## 14. Audit Requirements

Tier A (mandatory, before/after JSON): Invoice/Payment/Refund/CreditNote/ForgeFundEntry state changes, Deal stage changes, Proposal status changes, User role changes, ClientUser active-flag changes, Document deletion, Project phase/status changes. Tier B (logged, lighter): Milestone completion, Task reassignment, Note visibility changes, MaintenanceContract renewal. Tier C (not audited): routine Task status progression, comment edits, dashboard views.

AuditLog table: `REVOKE UPDATE, DELETE ON audit_log FROM app_user;` in the migration — this is a raw SQL grant statement, not expressible in Prisma's schema DSL, added as a manual migration step (§C).

## 15. Transaction Boundaries

Single DB transaction (never spans external I/O):

- Deal → Won: update Deal.stage + create Project + insert DomainEvent('DealWon') row, commit together.
- Payment webhook: insert WebhookEvent (idempotency gate) + upsert Payment + update Invoice.paid\_amount + conditionally insert ForgeFundEntry, all in one transaction.
- Invoice finalize (Draft → Sent): claim next InvoiceSequence number (`SELECT ... FOR UPDATE`) + freeze InvoiceLineItem snapshots + set Invoice.status=SENT, one transaction.

Outside any transaction, as async jobs consuming DomainEvent/WebhookEvent rows: template application, email sending, notification dispatch, portal invitation generation.

## 16. Snapshot Fields

`Invoice.bill_to_snapshot` (Json — company name/GSTIN/address frozen at send time), `InvoiceLineItem.*` (all tax and pricing fields copied, no live FK to ProposalLineItem/TaxRate). `Proposal` versions themselves are the snapshot mechanism for what was sold (new row per version, never mutated post-Sent).

## 17. JSONB Fields

`Project.handover_checklist` (array of checklist items — small, fixed shape, not independently queried), `AuditLog.before`/`after` (arbitrary entity diffs), `Notification.payload`, `DomainEvent.payload`, `WebhookEvent.payload` (raw external payloads for replay/debugging). No JSONB used for anything that should be a real column (custom fields explicitly rejected, §20 red team).

## 18. Organization Scoping

`organization_id Uuid NOT NULL` on every table, defaulted to the single seeded Organization row. Every unique constraint that would otherwise be global is scoped by it (`unique(organization_id, ...)`) so no future migration has to change constraint shape to add a second org — only add enforcement middleware.

## 19. Financial-Year Invoice Numbering

`InvoiceSequence(organization_id, financial_year, last_number)`, `unique(organization_id, financial_year)`. Invoice finalize transaction: `SELECT last_number FROM invoice_sequence WHERE organization_id=$1 AND financial_year=$2 FOR UPDATE`, increment, use as `invoice_number`. Row-level lock serializes concurrent invoice creation within the same org+FY — acceptable contention at 5-person scale (this is not a hot path). CreditNote uses an identical, separate counter (not sharing the Invoice sequence — they're legally distinct document series).

## 20. Razorpay Webhook Idempotency

1. Verify HMAC signature against raw request body before touching the DB.
2. Insert into `WebhookEvent` with `unique(source, external_event_id)` — constraint violation means duplicate delivery, return 200 immediately, no further processing.
3. Inside the same transaction as the WebhookEvent insert: upsert `Payment` keyed on `razorpay_payment_id` (also unique) — so even a webhook with a new `external_event_id` but a payment ID already recorded is a safe no-op on the Payment row itself, belt-and-suspenders against Razorpay's own retry semantics.
4. `ForgeFundEntry` insert guarded by the partial unique index in §ForgeFundEntry above, keyed on the payment id.

---

## A. ERD (Mermaid)

employshashashassourced\_fromhasinvolved\_inconverts\_tohascontainsaccepted\_intobecomeshashasgateslogsbilled\_viaextends\_intohasbillscontainsreceivescorrected\_bycontainsreversed\_bycontributes\_toattachesattachesattachesattachesattachesattachesperformsraisesOrganizationUserCompanyContactClientUserLeadDealProposalProposalLineItemProjectMilestoneTaskTimeEntryInvoiceMaintenanceContractSupportTicketInvoiceLineItemPaymentCreditNoteCreditNoteLineItemRefundForgeFundEntryDocumentActivityAuditLog

*(Note/Notification/WebhookEvent/DomainEvent/InvitationToken/TaxRate/InvoiceSequence omitted from the diagram for readability — all fully specified above and in the Prisma schema.)*

---

## B. Prisma Schema

See the accompanying `schema.prisma` file — full, complete schema implementing every entity, enum, constraint, and index specified above.

---

## C. Migration Order

1. Enums (all, no dependencies)
2. `Organization` (root of every FK chain)
3. `TaxRate`, `InvoiceSequence` (no dependencies beyond Organization)
4. `User` (depends on Organization)
5. `Company` (depends on Organization)
6. `Contact`, `ClientUser` (depend on Company)
7. `Lead` (depends on Contact, Company)
8. `Deal` (depends on Company, Contact, User; self-FK `reopened_from_deal_id` added after table exists)
9. `Proposal`, `ProposalLineItem` (depend on Deal, TaxRate)
10. `Project` (depends on Deal, Proposal, Company, User) — note `Lead.converted_to_deal_id` and `Deal.reopened_from_deal_id` self/forward references added as a second migration step (ALTER TABLE ADD CONSTRAINT) since Deal must exist before Project can exist, but Lead→Deal is a forward reference created before Deal — standard "create tables, then add cross-referencing FKs" two-pass approach.
11. `Milestone`, `Task`, `TimeEntry` (depend on Project, User)
12. `Invoice`, `InvoiceLineItem` (depend on Project, Company, InvoiceSequence, TaxRate)
13. `Payment`, `Refund` (depend on Invoice, User)
14. `CreditNote`, `CreditNoteLineItem` (depend on Invoice, InvoiceLineItem)
15. `Expense`, `ForgeFundEntry` (depend on Project, Payment, User)
16. `MaintenanceContract`, `SupportTicket` (depend on Project, ClientUser)
17. `Activity`, `Note`, `Document` (depend on all polymorphic targets — created last since they reference nearly everything)
18. `Notification`, `AuditLog`, `WebhookEvent`, `DomainEvent`, `InvitationToken` (independent platform tables, order among themselves doesn't matter)
19. Manual SQL migration: `REVOKE UPDATE, DELETE ON audit_log FROM <app_role>;`
20. Manual SQL migration: CHECK constraints for polymorphic exactly-one-FK on Activity/Note/Document (Prisma doesn't express multi-column CHECK constraints natively — added via `prisma migrate dev --create-only` then hand-edited SQL, or a `db/migrations/*.sql` raw step).

## D. Seed Strategy

Seed script populates, in this order:

1. One `Organization` row (Forge itself — name, GSTIN, billing state).
2. `InvoiceSequence` row for the current financial year, `last_number=0`.
3. `TaxRate` rows for your actual service HSN/SAC codes (verify exact codes with your accountant before seeding — do not guess these into production).
4. Five `User` rows, one per team member, roles as specified in the org profile.
5. **No fake Company/Deal/Invoice data seeded into anything resembling a production database** — seed script should support a `--demo` flag that adds sample CRM data only for local/staging environments, never run against prod. This matters because your finance tables have real compliance weight — seeded fake invoices in a real FY sequence would corrupt the gapless-numbering requirement (§19) if ever run against production by mistake.
6. Local/demo only: a handful of Companies/Contacts/Deals across different pipeline stages for UI development.

## E. Index Rationale

| **IndexWhy**                                                                                                           |                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `(organization_id, email)` unique on User/ClientUser                                                                   | scoped identity uniqueness, login lookup                                                                          |
| `Deal.stage`, `Project.status`, `Invoice.status`                                                                       | every dashboard/list-view filter hits these — the single most common WHERE clause per table                       |
| `Task(assignee_id, status)` composite                                                                                  | "my open tasks" is the single most-run query in daily use, per UX red team §7                                     |
| `(entity_fk, created_at desc)` on Activity/Note/Document per parent type                                               | powers the unified timeline query, the highest-frequency read in the system                                       |
| GIN full-text index on Company.name, Contact.name/email, Deal.title, Project.name, Invoice.invoice\_number, Task.title | backs global search (§10 red team), sufficient at stated volume without Elasticsearch                             |
| `WebhookEvent(source, external_event_id)` unique                                                                       | idempotency gate, must be an index not just app logic — this is the actual mechanism, not documentation of intent |
| `DomainEvent(status, created_at)`                                                                                      | worker polling query                                                                                              |
| `ForgeFundEntry` partial unique on `(organization_id, source_type, source_id, type) WHERE source_id IS NOT NULL`       | double-contribution prevention                                                                                    |
| `Invoice(organization_id, financial_year, invoice_number)` unique                                                      | legal numbering requirement                                                                                       |

## F. Constraint Rationale

- **`RESTRICT`**** not ****`CASCADE`**** on financial/historical FKs**: a Company archival action must never silently delete Invoices — this was the single largest data-loss risk identified in the red team.
- **`InvoiceLineItem`**** has no FK to ****`ProposalLineItem`****/****`TaxRate`**: this is deliberate, not an oversight — the whole point is that nothing upstream can retroactively alter a sent invoice. Every value is a copy.
- **CHECK exactly-one-FK on polymorphic tables**: without this, application bugs can create orphaned or ambiguously-attached rows; the DB is the only place this can be guaranteed absolutely, since app-layer discipline is exactly what failed to catch bugs in the v1/red-team process itself.
- **`unique(deal_id, version)`**** on Proposal**: makes "two Proposal rows claiming the same version for the same deal" structurally impossible, which is what guarantees `accepted_proposal_id` always points at an unambiguous, specific document.
- **`version`**** optimistic lock on Invoice/Payment only**: these are the two tables where a concurrent-edit race has real financial consequence; adding it everywhere would be unnecessary ceremony the red team explicitly warned against (§20, product simplicity test).

## G. Transaction Requirements

Summarized from §15 above — restated as implementation checklist:

-  Deal-Won handler wraps Deal update + Project creation + DomainEvent insert in one `prisma.$transaction`.
-  Webhook handler wraps WebhookEvent insert + Payment upsert + Invoice.paid\_amount update + conditional ForgeFundEntry insert in one `prisma.$transaction`, with the WebhookEvent insert first so a duplicate delivery fails fast on the unique constraint before any other write is attempted.
-  Invoice finalize wraps InvoiceSequence row lock + InvoiceLineItem creation + Invoice status update in one `prisma.$transaction`.
-  No transaction ever calls out to Razorpay, Resend, or R2 mid-transaction — those calls happen either before the transaction (to gather data) or after commit (to act on committed state), never interleaved.

## H. Database Invariants the Application MUST Enforce

(not expressible as SQL constraints, must be service-layer logic)

- `Deal.lost_reason` required when `stage = LOST`.
- `Deal.stage` cannot move to `WON` unless an `Proposal` with `status = ACCEPTED` exists for that deal.
- `Proposal` fields immutable once `status != DRAFT` (edits create a new version row instead).
- `Invoice` line items immutable once `status != DRAFT`.
- `Project.status` cannot become `COMPLETED` unless every item in `handover_checklist` has `done: true`.
- `Milestone` with `requires_client_approval = true` blocks the gating `Project.phase` transition (`Client Review → Deployment`) until `approved_at` is set.
- `Payment.recorded_by` required when `method != RAZORPAY`.
- `ClientUser.active` checked on every portal request for sensitive actions (document download, payment initiation), not just at session issuance.
- Razorpay webhook signature verified before any DB write is attempted.

## I. Database Invariants PostgreSQL Itself MUST Enforce

(real constraints, not just app-layer intent)

- All PKs, FKs, and the `RESTRICT`/`CASCADE` behaviors specified per-entity above.
- `unique(organization_id, financial_year, invoice_number)`, `unique(source, external_event_id)` on WebhookEvent, `unique(razorpay_payment_id)` on Payment, `unique(deal_id, version)` on Proposal, partial unique on ForgeFundEntry.
- CHECK: exactly-one-parent-FK on Activity, Note, Document.
- CHECK: `Invoice.paid_amount <= Invoice.amount`.
- `NOT NULL` on every field marked required above — Postgres, not just DTO validation, is the actual guarantee against malformed rows reaching storage (a bug bypassing a NestJS DTO should still be caught here).
- `REVOKE UPDATE, DELETE` on `audit_log` at the database role level.
- Decimal/Numeric column types on every monetary field — Postgres itself refuses to silently coerce a float into these columns in a lossy way, which is the actual enforcement mechanism behind "no floating point for money," not just a code-review rule.