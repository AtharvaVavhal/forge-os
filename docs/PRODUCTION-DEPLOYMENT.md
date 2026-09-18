# FORGE Business OS — Production Deployment Guide (F10.4)

This runbook prepares the Nest API for **staging** and later **production**.
It does **not** deploy anything. It does **not** contact production infrastructure.

Related: [`FORGE-BUSINESS-OS-DATABASE-MIGRATION.md`](./FORGE-BUSINESS-OS-DATABASE-MIGRATION.md) (F10.1 / Prisma).

---

## 1. Intended topology

```
Browser
  → https://app.forgebuilds.in   (Next.js — staff + portal route groups)
  → /api/v1/* rewritten or CORS to
  → https://api.forgebuilds.in   (Nest API, this Dockerfile)
       ↑
  TLS terminator / reverse proxy (1 hop)
       ↑
  Nest process (trust proxy hop count = 1)
       ↑
  PostgreSQL (forge_app role)
```

- **Single Next app** hosts staff UI and portal UI today. Do **not** assume a separate `portal.forgebuilds.in` deployment unless that is deliberately introduced later.
- Put the primary web origin **first** in `CORS_ORIGINS` (used for SSO / email links via `resolveWebAppOrigin`).
- Leave `COOKIE_DOMAIN` **unset** (host-only cookies) unless the cookie host must span subdomains — current architecture does not require it when the browser talks same-site via Next rewrite, or when API and app share an intentional Domain later.

### Frontend (Next.js)

Deploy **separately** from the API Docker image (no web Dockerfile by design):

```bash
# From repo root — Node 20
npm ci
# REQUIRED at build time for production:
#   NEXT_PUBLIC_API_BASE_URL=https://api.forgebuilds.in/api/v1
npm run build:web
npm run start --workspace apps/web   # or platform equivalent (Vercel/etc.)
```

- Browser always calls same-origin `/api/v1` (Next rewrite → API).
- Do not set Resend/R2/Razorpay/JWT secrets on the web app.
- Production builds fail closed if `NEXT_PUBLIC_API_BASE_URL` is missing.

---

## 2. Node version

| Mechanism | Value |
|-----------|--------|
| `.nvmrc` | `20` |
| `package.json` `engines.node` | `>=20 <23` |
| API Docker base image | `node:20-bookworm-slim` |

Use Node 20 LTS for staging/production. Do not invent dependency upgrades solely to chase newer Node majors.

---

## 3. Deployment artifact

Repository-native artifact: root **`Dockerfile`** (API only).

```bash
# From repo root — builds image; does not deploy
docker build -t forge-api:local -f Dockerfile .
```

Supported operator sequence (outside the image entrypoint):

```bash
npm ci
npx prisma generate
npm run build:api
npx prisma migrate deploy   # deliberate, separate step — never auto on container boot
node apps/api/dist/main.js
```

**Migrations are not run by `CMD`.** Destructive migrate/reset commands must never be part of production start.

---

## 4. Startup order

1. Provision secrets (never commit `.env`).
2. Database backup (production).
3. Verify DB connectivity as operator role.
4. Confirm `forge_app` role + F10.1 least-privilege strategy.
5. `npx prisma migrate deploy`
6. `npx prisma migrate status`
7. Start API (`node apps/api/dist/main.js` or container).
8. Probe `GET /api/v1/health/live` then `GET /api/v1/health/ready`.
9. Smoke: login, invitation (if email configured), document presign (if R2 configured), webhook auth fail-closed if Razorpay unset.

---

## 5. Environment matrix

| Variable | Class | Notes |
|----------|--------|--------|
| `DATABASE_URL` | **REQUIRED** | App runtime role URL (`forge_app`) |
| `SESSION_JWT_SIGNING_KEY` | **REQUIRED** | ≥32 chars; shared staff+portal signing key with different `aud` |
| `NODE_ENV` | OPTIONAL (default development) | Must be `production` in prod |
| `PORT` | OPTIONAL (4000) | |
| `CORS_ORIGINS` | OPTIONAL locally; **hardened in production** | Explicit list, no `*` |
| `COOKIE_SECURE` | OPTIONAL | Defaults true in production; `false` rejected in production |
| `COOKIE_DOMAIN` | OPTIONAL | Prefer unset (host-only) |
| `TRUST_PROXY` | OPTIONAL | Production default **1**; never `true` |
| `DOMAIN_EVENT_WORKER_ENABLED` | OPTIONAL | `"false"` disables outbox poller; off in `NODE_ENV=test` |
| `GOOGLE_OAUTH_*` (3) | FEATURE-GATED | 503 if incomplete |
| `R2_*` (4) | FEATURE-GATED | All-or-nothing; 503 docs if unset |
| `RESEND_API_KEY` + `EMAIL_FROM` | FEATURE-GATED | Both or neither; emails skipped + `emailSent:false` |
| `RAZORPAY_KEY_ID` / `KEY_SECRET` | FEATURE-GATED | Orders 503 if unset |
| `RAZORPAY_WEBHOOK_SECRET` | FEATURE-GATED | Webhook fail-closed without secret |
| `STORAGE_SIGNING_SECRET` | STALE/legacy optional | Unused with R2 SigV4 |
| `PORTAL_JWT_SIGNING_KEY` | STALE | Unused — portal uses session key + `aud=portal` |
| `STORAGE_BASE_URL` | STALE/absent | Not used |
| `SEED_DEMO` | DEVELOPMENT-ONLY | Never in production |
| `APP_DB_ROLE` | OPTIONAL | Audit revoke target name |

Never print secret values in logs, tickets, or CI output.

---

## 6. Proxy / networking

- Set `TRUST_PROXY=1` (or rely on production default) behind **one** reverse proxy.
- Rate limiting (`@nestjs/throttler`) keys on `req.ip`. Without trust proxy, all clients collapse to the proxy IP (or limits misbehave).
- Do **not** set `TRUST_PROXY=true` (trust every hop).

---

## 7. Auth / cookies / CORS / Google SSO

### Cookies

| Cookie | HttpOnly | Secure (prod) | SameSite | Path |
|--------|----------|---------------|----------|------|
| `forge_session` | yes | yes | Strict | `/` |
| `portal_session` | yes | yes | Strict | `/` |
| `forge_csrf` | **no** (double-submit) | yes | Strict | `/` |
| `forge_google_oauth_state` | yes | yes | **Lax** | `/` (5 min) |

Staff and portal remain separate cookie names / JWT audiences.

### CORS

- `credentials: true`
- Exact origins from `CORS_ORIGINS`
- Production boot rejects empty or `*`

### Google SSO

| Item | Value |
|------|--------|
| Client type | Web application (Google Cloud OAuth) |
| Redirect URI | `https://api.forgebuilds.in/api/v1/auth/google/callback` |
| Start route | `GET /api/v1/auth/google/start` |
| Authorized JS origin | Web app origin (e.g. `https://app.forgebuilds.in`) |
| Provisioning | **Existing `User` only** — no auto-provision |
| Domain | Product expects `@forgebuilds.in`; **API does not enforce `hd`** |

Configure `GOOGLE_OAUTH_REDIRECT_URI` to the exact callback URL above (or staging equivalent).

---

## 8. R2 (staging vs production)

| | Staging | Production |
|--|---------|------------|
| Bucket | Separate non-prod bucket | Dedicated prod bucket |
| Credentials | Staging R2 API token | Prod token (secret manager) |
| CORS on bucket | Allow staging web origin PUT/GET | Allow prod web origin |

Unset R2 → document ops return `503 STORAGE_NOT_CONFIGURED`. Incomplete R2 → **boot failure**.

Do not contact production R2 from local/dev agents.

---

## 9. Resend (staging vs production)

| | Staging | Production |
|--|---------|------------|
| API key | Staging/test key | Prod key |
| `EMAIL_FROM` | Verified staging sender | Verified `forgebuilds.in` sender |

Unset → invitations/password-reset still create tokens; `emailSent: false`. Incomplete pair → **boot failure**.

---

## 10. Razorpay

- Webhook: `POST /api/v1/webhooks/razorpay`
- Raw-body HMAC (`X-Razorpay-Signature`) + event idempotency (`WebhookEvent` unique)
- **Accepted risk:** refund path can call Razorpay **before** the DB transaction; concurrent distinct idempotency keys (or multi-instance in-memory idempotency) can double-submit at the gateway. Do not redesign in F10.4; monitor refunds operationally.

---

## 11. Outbox / domain events

- In-process worker OK for **single API instance** staging.
- Multi-instance: safe via `FOR UPDATE SKIP LOCKED` (multiple pollers OK).
- Disable with `DOMAIN_EVENT_WORKER_ENABLED=false` or `NODE_ENV=test`.
- Monitor `DomainEvent` rows stuck `PENDING` / `FAILED` (max 8 attempts).

No Redis introduced in F10.4.

---

## 12. Rate limiting

In-memory per process. **One instance:** correct with trust proxy. **Multiple instances:** effective limit ≈ N × configured limit; no shared counter. Accepted for this phase unless horizontal scale requires Redis later.

Same limitation for the in-memory idempotency store.

---

## 13. Health checks

| Route | Meaning |
|-------|---------|
| `GET /api/v1/health/live` | Process up (liveness) |
| `GET /api/v1/health/ready` | Process + DB ping (readiness) |
| `GET /api/v1/health` | Alias of ready |

No secrets in responses. Optional integrations (R2/Resend/Razorpay/Google) are **not** readiness gates — they feature-gate their own routes.

---

## 14. Observability — what to monitor

- `X-Request-Id` on every response
- 5xx rate / exception logs (no bodies/cookies by default)
- Audit log volume for auth and money events
- Outbox `FAILED` count
- Razorpay webhook signature failures / duplicate event_ids
- Email `emailSent: false` rate on invitations
- Document `STORAGE_*` 503s if R2 misconfigured

**Never log:** secrets, Authorization headers, raw invitation/reset tokens, DB passwords, presigned URL query strings in server logs.

---

## 15. Database migration procedure (production)

1. Backup database.
2. Verify connectivity (print host + db name only — never passwords).
3. Verify `forge_app` role strategy (F10.1).
4. Ensure strong `forge_app` credential in secret manager.
5. `npx prisma migrate deploy` (forward-only).
6. `npx prisma migrate status`.
7. Verify app `DATABASE_URL` uses `forge_app`.
8. Spot-check critical tables/indexes.
9. Start application.
10. Smoke tests.

Do **not** edit applied migration history. Do **not** run `migrate reset` in production.

---

## 16. Backup / rollback

| Concern | Guidance |
|---------|----------|
| DB backup | Required before migrate/deploy |
| App rollback | Redeploy previous image/commit |
| Migration rollback | Prisma does **not** auto-down; use forward-fix migrations |
| Secret rollback | Rotate in secret manager; expect session invalidation if JWT key changes |
| Deployment rollback | Previous container tag + prior migrate state only if DB was not advanced, else forward-fix |

---

## 17. Accepted risks (not fixed in F10.4)

- Shared JWT signing key for staff + portal (`aud` separation only)
- In-memory rate limit + idempotency under multi-instance
- Razorpay refund gateway-before-DB double-submit risk
- Soft outbox lease encoding in `last_error`
- SVG allowed as MIME; served as attachment (not sanitized)
- Google SSO has no hard `hd=@forgebuilds.in` API check
- `STORAGE_SIGNING_SECRET` legacy unused optional
