# FORGE Business OS — Authentication, RBAC & Security Specification

**Document 6** — Implementation-ready security contract for NestJS.

| Status | Frozen (specification only) |
| --- | --- |
| Depends on | Documents 1–5 |
| Implementation | **Not started** — do not implement from this task |

**Non-goals:** NestJS code, dependency installs, schema/migration/DB changes, marketing website (`/Users/atharva/Forge`), new roles/entities/IdPs/payout tables.

**Rule:** If a detail is not fixed in Documents 1–5, it is marked **`NOT CURRENTLY DEFINED`**. Do not invent production values.

---

## 1. Identity model

### 1.1 Two identity planes

| Plane | Entity | Cookie / JWT | Audience |
| --- | --- | --- | --- |
| Internal Business OS | `User` | `forge_session` | `aud: internal` |
| Client portal | `ClientUser` | `portal_session` | `aud: portal` |

They remain **separate** because (Doc 1 §5/§6):

- Different trust levels (staff vs external client).
- Different authorization models (role permissions vs company scope).
- Prevents cross-plane session confusion (a portal JWT must never validate on internal guards).
- Portal revoke is `ClientUser.active = false`, independent of staff `User.active`.

**Do not** introduce `CUSTOMER` as a `UserRole`. Portal identity is never a `User` row.

### 1.2 User (internal) lifecycle

1. Created via TEAM invitation acceptance or FOUNDER_ADMIN provisioning / SSO first login (exact provisioning UX beyond invitation + SSO: **NOT CURRENTLY DEFINED**).
2. Belongs to exactly one `organization_id` (V1 single org).
3. `role` ∈ frozen `UserRole`.
4. `active = true` required for authenticated internal access; inactive → reject session establishment and reject subsequent requests.
5. `password_hash` nullable when SSO-only (Google Workspace).
6. Soft operational disable = `active = false` (never hard-delete users — FKs are RESTRICT).
7. `last_login_at` updated on successful auth.

Email uniqueness: `unique(organization_id, email)`.

### 1.3 ClientUser (portal) lifecycle

1. Created via CLIENT invitation acceptance (or FOUNDER_ADMIN / `portal.manage` provisioning — exact admin create API beyond invitation: Document 5 inventory implies invite flow).
2. Required `company_id` (RESTRICT); optional `contact_id` (SET NULL).
3. `active` checked on **every** sensitive portal request (pay, download) and should be checked on all portal authenticated requests (Doc 1 §6).
4. Revoke portal access = `active = false` (not merely waiting for JWT expiry).
5. `password_hash` nullable if magic-link supported (Doc 2); magic-link issuance details beyond invitation: **NOT CURRENTLY DEFINED**.

Email uniqueness: `unique(organization_id, email)` on `ClientUser` (separate from `User` emails).

### 1.4 Organization relationship

- Every `User` / `ClientUser` row has non-null `organization_id`.
- Session must carry (or resolve) `organization_id` and `userId` / `clientUserId`.
- Resource queries always filter by that `organization_id` (and portal additionally by `company_id`).

---

## 2. Frozen UserRoles & permission matrix

### 2.1 Roles (only)

`FOUNDER_ADMIN` | `OPERATIONS` | `FINANCE` | `SALES` | `TEAM_MEMBER`

### 2.2 Legend

| Symbol | Meaning |
| --- | --- |
| ✓ | Allowed |
| — | Denied |
| L | Limited (query-scoped; see footnotes) |
| N/A | Operation not applicable / not exposed |

Actions: C=Create, R=Read, U=Update, D=Delete (hard), A=Archive/soft-delete, Ap=Approve, S=Send, MP=Mark paid / record payment completion paths, Rf=Refund, M=Manage (includes transitions owned by resource), E=Export CSV where Doc 1 allows.

### 2.3 Matrix

| Resource | Action | FOUNDER_ADMIN | OPERATIONS | FINANCE | SALES | TEAM_MEMBER |
| --- | --- | --- | --- | --- | --- | --- |
| Organization | R | ✓ | L¹ | L¹ | L¹ | L¹ |
| Organization | U | ✓ | — | — | — | — |
| Users | C (invite) | ✓ | — | — | — | — |
| Users | R | ✓ | L² | L² | L² | L² |
| Users | U (role/active) | ✓ | — | — | — | — |
| Users | D | N/A | N/A | N/A | N/A | N/A |
| Companies | C/R/U | ✓ | R | R | ✓ | L³ |
| Companies | A | ✓ | — | — | ✓ | — |
| Companies | E | ✓ | — | — | ✓ | — |
| Contacts | C/R/U/A | ✓ | R | R | ✓ | L³ |
| Leads | C/R/U/A/M | ✓ | R | R | ✓ | — |
| Deals | C/R/U/A/M/E | ✓ | R | R | ✓ | — |
| Proposals | C/R/U/S/M | ✓ | R | R | ✓ | — |
| Projects | C/R/U/M | ✓ | ✓ | R | R | L⁴ |
| Projects | D/A | N/A | N/A | N/A | N/A | N/A |
| Milestones | C/R/U/M | ✓ | ✓ | R | R | L⁴ |
| Tasks | C/R/U/M | ✓ | ✓ | R | R | L⁵ |
| TimeEntries | C/R/U/D | ✓ | ✓ | R | — | L⁶ |
| Invoices | C/R/U/S/M | ✓ | — | ✓ | — | — |
| Invoices | E | ✓ | — | ✓ | — | — |
| Invoices | MP | ✓ | — | ✓ | — | — |
| Invoices | D/A | N/A | N/A | N/A | N/A | N/A |
| Payments | C (manual)/R/M | ✓ | — | ✓ | — | — |
| Payments | D | N/A | N/A | N/A | N/A | N/A |
| Refunds | C(Rf)/R | ✓ | — | ✓ | — | — |
| CreditNotes | C/R | ✓ | — | ✓ | — | — |
| Expenses | C/R/U | ✓ | — | ✓ | — | — |
| ForgeFundEntries | R | ✓ | — | ✓ | — | — |
| ForgeFundEntries | C (manual CONTRIBUTION/WITHDRAWAL/ALLOCATION) | ✓ | — | ✓ | — | — |
| ForgeFundEntries | Ap (`approved_by` on create) | ✓ | — | ✓ | — | — |
| Documents | C/R/U/A | ✓ | ✓ | ✓ | ✓ | L⁴ |
| Activities | C/R | ✓ | ✓ | ✓ | ✓ | L⁴ |
| Notes | C/R/U | ✓ | ✓ | ✓ | ✓ | L⁴ |
| Notifications | R/U(read) | own | own | own | own | own |
| AuditLogs | R | ✓ | — | ✓ | — | — |
| AuditLogs | U/D | **Forbidden** (DB REVOKE) | same | same | same | same |
| MaintenanceContracts | C/R/U/M | ✓ | ✓ | ✓ | R | — |
| SupportTickets | C/R/U/M | ✓ | ✓ | R | R | L⁴ |
| ClientUsers | C(invite)/R/U(active) | ✓ | — | — | ✓⁷ | — |
| Invitations | C/R/revoke | ✓ | — | — | ✓⁷ | — |

¹ Org billing identity readable as needed for UI; no org admin.  
² Directory for assignees/owners; no role secrets.  
³ Linked to assigned projects only (Doc 5).  
⁴ Assigned project owner or task assignee scope.  
⁵ Own tasks + transition/assign limits per Doc 5.  
⁶ Create/read/delete **own** time entries.  
⁷ `portal.manage` / sales invite clients (Doc 5).

**Export:** Deals, Companies, Invoices CSV per Doc 1 §8. Tasks/Projects export not in V1.

**Mark paid:** Offline `POST /payments` and Razorpay webhook path — FINANCE / FOUNDER_ADMIN for manual; webhook is system.

**No** separate `payouts.*` permissions (frozen: Forge Fund only).

---

## 3. Organization scoping

### 3.1 Mandatory flow

```
authenticated identity
      ↓
organization_id from session (never from body)
      ↓
authorized resource query: WHERE organization_id = :orgId [AND …]
      ↓
return rows / 404 if none in scope
```

**Forbidden:** fetch by id → then compare organization.

### 3.2 Behaviors

| Case | Response |
| --- | --- |
| Missing organization context on authenticated request | `401` / `403` — treat as unauthenticated or misconfigured session |
| Invalid organization id in session | Reject session; force re-auth |
| Cross-organization UUID | `404` (no existence leak) |
| Unauthorized resource in same org | `403` or `404` per product choice — **NOT CURRENTLY DEFINED** which status; prefer `404` for IDOR resistance on portal, `403` when permission missing on known internal list item |
| Soft-archived Company/Contact/Lead/Deal | Default lists exclude `archived_at IS NOT NULL`; direct get: **NOT CURRENTLY DEFINED** whether FOUNDER_ADMIN may open archived (recommend allow with flag) |
| Soft-deleted Document | Excluded from default queries; restore path **NOT CURRENTLY DEFINED** |
| Invoice/Payment/Project | Never soft-deleted; use status machines |

Portal adds: `company_id` from `ClientUser` must match parent entity company (via `PortalScopeGuard`).

---

## 4. Authentication (internal)

### 4.1 Methods

1. **Google Workspace SSO** — only IdP (Doc 5). Start + callback endpoints.
2. **Password login** — where `password_hash` present; break-glass / non-SSO.
3. **Invitation acceptance** — creates/activates user, may set password.

### 4.2 Flows

| Flow | Behavior |
| --- | --- |
| Login (password) | Verify email+password for org; require `active`; create session; update `last_login_at`; generic failure message |
| Login (SSO) | OAuth; map Google account to User by email; SSO-only users have null password_hash |
| Logout | Invalidate session |
| Session | `GET /auth/session`, `GET /auth/me` |
| Inactive account | Deny login and deny requests if somehow session exists |
| Invitation | See §6 |

### 4.3 Account activation

- TEAM invitation acceptance creates User with role from invitation `user_role`.
- Exact “pending activation” state beyond `InvitationToken` + User create: **NOT CURRENTLY DEFINED** (no `User.status` enum in schema — use `active`).

---

## 5. Session security

### 5.1 Frozen requirements

| Requirement | Source |
| --- | --- |
| Cookie name internal `forge_session` | Doc 1 §5 |
| Cookie name portal `portal_session` | Doc 1 §5 |
| Separate JWT audiences `internal` / `portal` | Doc 1 §5 |
| httpOnly cookies | Doc 5 |
| `SameSite=Strict` | Doc 1 §5 (with CSRF) |
| Portal JWT TTL example ~24h **and** live `ClientUser.active` check | Doc 1 §6 |

### 5.2 NOT CURRENTLY DEFINED

- Exact absolute session TTL for internal users  
- Exact idle timeout  
- Exact portal TTL beyond Doc 1 example “e.g. 24h” as production constant  
- `Secure` cookie flag explicit wording (required in production HTTPS — treat as mandatory operationally; not numbered in Doc 1)  
- Cookie `Path` / `Domain` values  
- Session storage mechanism (signed JWT-only vs server-side session store / table) — **no Session table in frozen schema**  
- Concurrent session limits (allow multiple vs single)  
- Session rotation on privilege change (recommended on role change; not explicitly frozen)  
- Refresh-token design  

### 5.3 Defined behaviors

- Logout → session invalidation.  
- Password change / reset → invalidate **all** existing sessions for that user (Doc 1 §5.8).  
- Portal revoke → `ClientUser.active=false` fails subsequent sensitive (and should fail all) portal requests even if JWT unexpired.  
- Internal `User.active=false` → reject authenticated requests.

---

## 6. Invitation security

### 6.1 Frozen fields / rules (Doc 2 + Doc 1)

| Rule | Detail |
| --- | --- |
| Storage | `token_hash` only — **never** store raw token |
| Scope | `TEAM` \| `CLIENT` |
| TEAM | sets `user_role` |
| CLIENT | sets `company_id` |
| Expiry | `expires_at` checked on **every** accept attempt |
| Single-use | set `used_at` on first success; reject if already set |
| Revocation | `revoked_at` set → reject |
| Created by | `created_by` → User |

### 6.2 Flows

1. Generate high-entropy raw token → hash (algorithm **NOT CURRENTLY DEFINED**; must be one-way, e.g. SHA-256 of token or password-hash style — choose at implementation without claiming frozen algo).  
2. Persist hash + metadata; send raw token only via email link.  
3. Accept: lookup by hash; validate expiry/used/revoked; create User or ClientUser; set `used_at`.  
4. Invalid / expired / used / revoked → generic failure (no enumeration of which).  
5. Resend: **NOT CURRENTLY DEFINED** whether new token row vs rotate hash on same row; must invalidate prior unused token if rotated.  
6. Audit: invitation create, revoke, accept = Tier A (portal access grant) (Doc 1 §9).

Doc 1 example expiry “e.g. 7 days” — production default constant: **NOT CURRENTLY DEFINED** beyond requiring `expires_at`.

---

## 7. Password reset

Supported by Doc 1 §5.8 and Document 5 endpoints.

| Requirement | Status |
| --- | --- |
| Single-use token | Frozen |
| Short-lived 15–30 min | Frozen range |
| Invalidate all sessions on password change | Frozen |
| Rate-limit per email/IP | Frozen requirement; **exact limits NOT CURRENTLY DEFINED** |
| Generic responses (no account enumeration) | Frozen |
| Token hashing / storage table | **NOT CURRENTLY DEFINED** (no PasswordResetToken entity in schema — implementation may use signed token or ephemeral store without claiming a new frozen table; **do not add Prisma model in this doc**) |
| Audit | Tier A for successful reset / security-sensitive |

---

## 8. RBAC enforcement stack

```
Request
 → AuthenticationGuard (cookie/JWT + audience)
 → Identity (User | reject portal token on internal)
 → Organization context
 → RolesGuard / PermissionsGuard (User.role → permission set)
 → Resource policy (object-level / assignment scope)
 → Service (state machine + business rules)
 → Database (organization_id in WHERE; soft-delete middleware)
```

Conceptual Nest artifacts (not implemented here):

- `@InternalAuth()` / `@PortalAuth()`  
- `@RequirePermissions('finance.manage')`  
- `PortalScopeGuard` on all `/portal/*` controllers  
- Prisma middleware: inject `archived_at`/`deleted_at` null filters for soft-deletable models  

Frontend checks = UX only.

---

## 9. Portal security

### 9.1 PortalScopeGuard

**Applies to:** every `/api/v1/portal/*` authenticated route (module-level), including detail routes.

**Checks:**

1. Valid `portal_session` with `aud: portal`.  
2. `ClientUser` exists, `organization_id` matches, `active === true`.  
3. Target resource’s company scope equals `session.company_id` (via project/invoice/proposal/document parent chain).

### 9.2 Allowed mutations

- `POST .../proposals/:id/accept` (SENT/VIEWED → ACCEPTED only)  
- `POST .../invoices/:id/pay` (checkout start only)  
- Support ticket create/reply as specified  
- CSRF required on these state-changing routes  

### 9.3 Denied

- Any internal `/api/v1/*` non-portal route with portal token  
- Invoice/payment status writes  
- Forge Fund, Expenses, AuditLog, Users, internal Notes (`INTERNAL`)  
- Cross-company access → 404  

### 9.4 Revoked / expired

- Expired JWT → 401  
- `active=false` → 401/403 even if JWT valid  
- Soft-revoked access does not invalidate already-downloaded files (Doc 1 §10)

---

## 10. Portal data visibility matrix

| Resource | INTERNAL ONLY | CLIENT VISIBLE | CLIENT WRITABLE |
| --- | --- | --- | --- |
| Company | billing internals as needed | own company context implied | — |
| Contact | full | limited self/company contacts as exposed by portal APIs | — |
| Deal | ✓ pipeline | — (not a portal list resource in Doc 5) | — |
| Proposal | ✓ | own company proposals | Accept only |
| Project | ✓ | own company projects | — |
| Milestone | ✓ | visible on project | — (approval gate may be client action if exposed — Doc 1 milestone approval by contact; portal endpoint for approve **NOT CURRENTLY DEFINED** beyond internal fields) |
| Task | ✓ | — | — |
| Invoice | ✓ | own company invoices | Pay now only |
| Payment | ✓ | receipt-level via invoice/pay UX | — (no status write) |
| Expense | ✓ | — | — |
| Forge Fund | ✓ | — | — |
| Documents | by `visibility` | `CLIENT_VISIBLE` + parent scope | support attachments if specified |
| Activities | ✓ | — | — |
| Notes | `INTERNAL` default | `CLIENT_VISIBLE` only, filter-in-query | — |
| AuditLog | ✓ | — | — |
| Maintenance | ✓ | **NOT CURRENTLY DEFINED** if portal lists contracts | — |
| Support | ✓ | own tickets | create / client replies |

---

## 11. Document / file security

| Control | Frozen value / rule |
| --- | --- |
| Upload | Presigned URL to R2; not proxied through Nest body |
| Size | **25MB default**, configurable |
| MIME | Allowlist; **content-sniffing** server-side |
| Antivirus | Explicitly **not** V1 |
| Path | `org/{company_id}/{entity_type}/{entity_id}/{uuid}-{filename}` sanitized |
| Download | Short-lived signed URL only |
| Signed URL TTL | **10–15 minutes**; regenerate on page load |
| Visibility | Parent scope + `Visibility` enum |
| Soft delete | `deleted_at`; R2 retain **~90 days** before purge |
| Serve | `Content-Disposition: attachment` (non-executable) |
| Authz | Upload/download require documents permission or portal scope + active |

No conflict with Documents 1–5 on these values.

---

## 12. Webhook security (Razorpay)

```
request
 → capture raw body
 → HMAC verify (webhook secret)
 → resolve organization (V1 single org)
 → BEGIN TX
      INSERT WebhookEvent (unique source + external_event_id)
      upsert Payment
      update Invoice.paid_amount (+ status)
      conditional ForgeFundEntry CONTRIBUTION (partial unique)
 → COMMIT
 → async notifications / domain consumers
```

| Case | Behavior |
| --- | --- |
| Invalid signature | Reject **before DB**; no write |
| Duplicate `external_event_id` | Unique violation → **200** no-op |
| Replay | Same as duplicate / payment upsert idempotent |
| Malformed payload | 400; mark FAILED if event row created only after verify — prefer fail before insert |
| Unknown event type | Ack after verify; ignore or store RECEIVED without finance mutation — **exact ignore policy NOT CURRENTLY DEFINED**; must not crash |
| Processing failure | status FAILED; alert (Doc 1 observability); Razorpay retries |
| Card data | **Never store** PAN/CVV; only gateway payment ids / amounts / status |
| Reconciliation | Nightly diff; alert only; no silent heal |
| Audit | Payment/Fund changes Tier A |

---

## 13. CSRF

| Surface | Requirement |
| --- | --- |
| Portal state-changing (POST/PATCH accept, pay, etc.) | `SameSite=Strict` **and** CSRF token validation (Doc 1 §5.5) |
| Portal safe methods GET/HEAD | No CSRF token required |
| Internal app CSRF token | **NOT CURRENTLY DEFINED** as mandatory in Doc 1 (Doc 1 emphasizes portal); if internal uses cookies, SameSite=Strict still applies |
| Webhook | No CSRF (HMAC instead; no cookies) |

SameSite alone is **not** sufficient claimed protection for portal mutations.

---

## 14. Rate limiting

| Endpoint class | Requirement | Exact limits |
| --- | --- | --- |
| Auth login | Per email+IP; lockout | **NOT CURRENTLY DEFINED** |
| Portal login | Stricter; exponential lockout; no user enumeration | **NOT CURRENTLY DEFINED** |
| Invitation accept | Rate limit | **NOT CURRENTLY DEFINED** |
| Password reset | Per email/IP | **NOT CURRENTLY DEFINED** |
| Portal support ticket create | Per client per hour (Doc 1) | **NOT CURRENTLY DEFINED** numeric |
| Webhook | Protect availability; HMAC first | **NOT CURRENTLY DEFINED** |
| File upload /presign | Rate limit | **NOT CURRENTLY DEFINED** |
| Financial POSTs | Per-user token bucket (Doc 1 §13) | **NOT CURRENTLY DEFINED** |
| Global API | Per-user token bucket | **NOT CURRENTLY DEFINED** |

---

## 15. Input security

- Strict DTOs; `forbidNonWhitelisted`  
- UUID / enum / decimal-as-string money validation  
- Pagination max page size (Doc 5 example max 100)  
- String length caps: **NOT CURRENTLY DEFINED** per-field maxima beyond DB types  
- File validation: MIME sniff + size  
- Do not render untrusted HTML as active markup in internal UI without sanitization — sanitizer choice **NOT CURRENTLY DEFINED**  
- Never trust frontend validation  

---

## 16. Financial security

| Action | Who |
| --- | --- |
| Create/edit draft invoice | FINANCE, FOUNDER_ADMIN |
| Send invoice (sequence + freeze) | FINANCE, FOUNDER_ADMIN |
| Void draft / cancel | FINANCE, FOUNDER_ADMIN |
| Manual payment record | FINANCE, FOUNDER_ADMIN (`recorded_by` required) |
| Razorpay completion | System webhook only |
| Refund | FINANCE, FOUNDER_ADMIN |
| Credit note | FINANCE, FOUNDER_ADMIN |
| Expenses | FINANCE, FOUNDER_ADMIN |
| Forge Fund manual CONTRIBUTION/WITHDRAWAL/ALLOCATION | FINANCE, FOUNDER_ADMIN (`approved_by` = actor) |
| Automatic Fund CONTRIBUTION | Webhook transaction only |
| Hard-coded 60/40 | **Forbidden** |
| TeamPayout entity | **Forbidden** |
| Delete payment/invoice | **Forbidden** |
| Append-only history | Status machines + CreditNote/Refund; AuditLog |

Optimistic locking: Invoice/Payment `version` on concurrent draft edits.

---

## 17. Audit log security

### Tier A (mandatory)

Invoice/Payment/Refund/CreditNote/ForgeFundEntry changes; Deal stages; Proposal status; User role changes; portal grant/revoke; Document soft-delete; failed portal logins; Project phase/status; handover completion.

### Tier B

Milestone completion (non-gated); Task reassignment; Note visibility changes; Maintenance renewal.

### Tier C

Do not audit routine task status, search, dashboard views, minor non-financial edits.

### Immutability

- API: no update/delete endpoints.  
- DB: `REVOKE UPDATE, DELETE ON audit_logs FROM forge_app` (migration).  
- App role: SELECT + INSERT only.

Retention policy differentiation (security vs business): **NOT CURRENTLY DEFINED** numerically.

---

## 18. State machine security

For Lead, Deal, Proposal, Project, Milestone, Task, Invoice, Payment, MaintenanceContract, SupportTicket:

1. Authenticate  
2. Authorize permission  
3. Load entity **in org scope**  
4. Validate current state  
5. Validate requested transition + prerequisites (e.g. Deal WON needs ACCEPTED proposal; Project complete needs checklist)  
6. Transaction + side effects / outbox  
7. Audit / DomainEvent as required  

**Reject** generic `PATCH { status|stage|phase }` bypass routes.

---

## 19. Concurrency / race conditions

| Scenario | Mechanism |
| --- | --- |
| Invoice numbers | `SELECT … FOR UPDATE` on `InvoiceSequence` |
| Credit note numbers | `SELECT … FOR UPDATE` on `CreditNoteSequence` |
| Webhook duplicates | `WebhookEvent` unique + Payment unique |
| Forge Fund double contribution | Partial unique on automatic source |
| Invoice/Payment concurrent edit | `version` optimistic lock → 409 |
| Proposal revise | New row `(org, deal_id, version)` unique |
| Deal Won double-submit | Idempotent DomainEvent consumers by `deal_id` |

No Redis/Kafka for these controls.

---

## 20. Secrets

| Secret | Handling |
| --- | --- |
| DATABASE_URL | Env / secret manager; never commit |
| Razorpay key/secret/webhook secret | Server-only |
| R2 credentials | Server-only |
| Resend API key | Server-only |
| Google Workspace OAuth client secret | Server-only |
| Session/JWT signing keys | Server-only; rotate with invalidation plan |
| Encryption keys | **NOT CURRENTLY DEFINED** if any field-level encryption beyond TLS |

Rules: never expose to client bundles; separate env per environment; rotation procedure ownership **NOT CURRENTLY DEFINED** beyond Doc 1 “secret manager + bus factor note”.

---

## 21. Logging / error disclosure

- Request ID on every response error envelope (Doc 5).  
- Structured logs for authz failures, webhook failures, financial failures.  
- Client errors: stable `code` + safe `message`; no stacks, secrets, tokens, SQL, card data.  
- Portal login failures: generic “invalid credentials”; Tier A audit for failed portal logins.  
- Sentry (or similar) recommended in Doc 1 — vendor choice operational.

---

## 22. Security headers

Required *in principle* for HTTPS deployment. **Exact header values: NOT CURRENTLY DEFINED** in Documents 1–5.

Implementers must set (without this doc inventing CSP policy text):

- `Strict-Transport-Security` (HSTS)  
- `X-Content-Type-Options: nosniff`  
- `Referrer-Policy`  
- Frame protection (`Content-Security-Policy` frame-ancestors or `X-Frame-Options`)  
- `Permissions-Policy`  
- CSP considerations for app + portal  

Mark production CSP allowlists as an open decision.

---

## 23. Threat model

| Threat | Impact | Preventive control | Detection | Recovery |
| --- | --- | --- | --- | --- |
| Cross-org data access | Data breach | org_id in every query; UUID≠authz | Anomalous 404/403 patterns; audit | Revoke sessions; rotate secrets; review AuditLog |
| Privilege escalation | Finance abuse | Role matrix; FOUNDER_ADMIN-only role change; audit role changes | AuditLog role diffs | Revert role; force logout |
| Compromised internal account | Full org access | SSO, short sessions, rate limits | Impossible travel / failed logins | Disable User.active; invalidate sessions |
| Compromised ClientUser | Client data/pay | active flag; PortalScopeGuard; CSRF | Failed logins audit | active=false; rotate portal secrets |
| Stolen invitation | Account takeover | hash, expiry, single-use, revoke | Accept from unexpected IP | Revoke unused invites; rotate |
| Stolen session | Impersonation | httpOnly; Secure; TTL; logout | Concurrent anomaly | Invalidate sessions; password reset |
| CSRF | Unwanted accept/pay | CSRF token + SameSite Strict | Odd portal POSTs | Invalidate sessions; review actions |
| XSS | Session theft | CSP TBD; escape output; attachment disposition | CSP reports TBD | Patch; rotate sessions |
| Malicious upload | Malware host | MIME sniff; size; allowlist; no execute | Upload errors | Soft-delete; purge R2 |
| Signed URL leak | Brief unauthorized download | 10–15m TTL; regenerate | Access logs if enabled | Shorter TTL; revoke ClientUser |
| Webhook forgery | Fake payments | HMAC before DB | Signature failures | Rotate webhook secret |
| Webhook replay | Double apply | WebhookEvent unique + payment unique | Duplicate inserts | Idempotent by design |
| Duplicate payment processing | Wrong paid_amount / Fund | Uniques + txn | Reconciliation job | Manual finance fix; alert |
| Financial manipulation | Loss / GST issues | RBAC; immutability; CreditNote path; optimistic lock | AuditLog; reconciliation | Reverse via Refund/CN; audit |
| Audit tampering | Cover-up | DB REVOKE UPDATE/DELETE | Grant drift monitoring | Restore from backup; lock roles |
| ID enumeration | Info leak | UUID + scoped 404 | Probing patterns | Rate limit |
| Brute-force login | Account takeover | Rate limit + lockout | Failed login audits | Lock account; reset |
| Race (sequences) | Gapless number break | FOR UPDATE | Sequence anomalies | Halt invoicing; repair with accountant |

---

## 24. Security test matrix

| Scenario | Expected result | Property |
| --- | --- | --- |
| Login wrong password | 401 generic | Auth |
| Inactive User login | Denied | Auth |
| Portal token on `/api/v1/deals` | 401/403 | Audience isolation |
| Internal token on `/portal/*` | Denied | Audience isolation |
| TEAM_MEMBER create invoice | 403 | RBAC |
| FINANCE send invoice | 200/success | RBAC |
| GET invoice other org UUID | 404 | Org isolation |
| Portal GET other company project | 404 | Portal isolation |
| Portal PATCH invoice status | 404/405/403 | Portal write limit |
| Accept proposal CSRF missing | 403 | CSRF |
| Webhook bad HMAC | Reject, no Payment | Webhook |
| Webhook duplicate event id | 200, no double pay | Idempotency |
| Offline payment without recorded_by | 422 | Financial rules |
| paid_amount > amount insert | DB CHECK fail | Integrity |
| Activity with two parents | DB CHECK fail | Polymorphic |
| forge_app UPDATE audit_logs | Permission denied | Audit immutability |
| Upload exe MIME | Reject | File security |
| Signed URL after 20 min | Fail | URL expiry |
| Deal WON without accepted proposal | 422 | State machine |
| Invoice PATCH after SENT | 409 | State machine |
| Concurrent InvoiceSequence | Serial numbers, no dup | Concurrency |
| Double Fund CONTRIBUTION same payment | Unique fail | Concurrency |
| Invitation reused | Reject | Invitation |
| ClientUser.active=false download | Denied | Portal revoke |
| Rate limit portal login flood | 429 / lockout | Rate limit |

Exact automated harness tooling: **NOT CURRENTLY DEFINED**.

---

## 25. Incident response (small team)

| Incident | Immediate actions |
| --- | --- |
| Compromised internal account | Set `User.active=false`; invalidate sessions; rotate password/SSO; AuditLog review; notify FOUNDER_ADMIN |
| Leaked session | Invalidate all sessions for user; force re-login; rotate signing key if systemic |
| Leaked invitation | Set `revoked_at`; issue new invite if needed |
| Leaked signed URL | Wait TTL (≤15m); revoke ClientUser if abuse; regenerate policy |
| Suspicious payment | Pause payouts/allocations; reconcile Razorpay; do not silent-delete Payment; use Refund/CN |
| Webhook compromise | Rotate webhook secret; reject old sig; review WebhookEvent/Payment; alert |
| Unauthorized access | Disable actors; preserve AuditLog; restore from backup if tampering suspected |
| Audit anomaly | Snapshot DB; verify REVOKE still applied; investigate FOUNDER_ADMIN actions |

Communication: shared doc / chat (Doc 1 §16 style) — on-call roster **NOT CURRENTLY DEFINED**.

---

## 26. Open decisions (`NOT CURRENTLY DEFINED`)

1. Exact internal session absolute/idle TTLs  
2. Exact portal JWT TTL production constant (Doc 1 example 24h)  
3. Session storage mechanism (JWT-only vs server session store) — no Session table in schema  
4. Concurrent session policy  
5. Cookie Domain/Path; Secure flag wording (prod HTTPS assumed)  
6. Internal CSRF token mandate  
7. Invitation default TTL days (Doc 1 example 7)  
8. Invitation resend/rotate algorithm  
9. Invitation/password-reset token hash algorithm  
10. Password-reset token persistence mechanism (no schema entity)  
11. Exact rate-limit numbers / lockout curves  
12. Support-ticket hourly numeric limit  
13. 403 vs 404 for same-org permission miss  
14. Archived record read policy for admins  
15. Document restore / purge job schedule details beyond 90-day window  
16. Portal milestone approval endpoint exposure  
17. Portal maintenance contract visibility  
18. Magic-link login details for ClientUser  
19. Per-field string max lengths  
20. HTML sanitizer choice  
21. Exact security header / CSP values  
22. Audit log retention days (Tier A vs B)  
23. Unknown Razorpay event ignore policy detail  
24. Secret rotation runbook ownership  
25. Security test automation tooling  
26. On-call / incident comms roster  
27. Whether SALES may ever gain `finance.read` (Doc 5 default deny)  
28. TEAM_MEMBER Forge Fund visibility (Doc 5 default deny)

---

## Final verification vs Documents 1–5

| Check | Result |
| --- | --- |
| No new roles | Pass |
| No new entities / payout tables | Pass |
| No new IdP | Pass — Google Workspace only |
| Soft-delete rules | Pass — matches Doc 4 resolutions |
| Portal architecture | Pass — ClientUser + PortalScopeGuard |
| Finance / Forge Fund | Pass — no 60/40; ALLOCATION via ForgeFundEntry |
| State machines | Pass — transition enforcement |
| File/webhook values | Pass — 25MB, 10–15m URLs, 90d, HMAC |
| Contradictions | **None found** |

Documents 1–5 were **not modified** by this task.

---

## Final report

**A.** Document created: `docs/FORGE-BUSINESS-OS-AUTH-RBAC-SECURITY-SPECIFICATION.md`  
**B.** Identity model covered (User vs ClientUser)  
**C.** Role/permission matrix covered  
**D.** Portal security covered  
**E.** Financial security covered  
**F.** Webhook security covered  
**G.** Audit security covered  
**H.** Threat model covered  
**I.** Security test matrix covered  
**J.** Open decisions listed in §26  
**K.** Documents 1–5 unchanged  

**DOCUMENT 6 AUTH + RBAC + SECURITY SPECIFICATION COMPLETE — READY FOR IMPLEMENTATION**
