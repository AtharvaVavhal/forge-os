# FORGE Business OS — Implementation Phase 0: Repository + Runtime Foundation

**Status:** Complete. Verified end to end (typecheck, lint, build, unit tests, e2e tests against a real local database, and live smoke-tested dev servers for both apps).

**Scope:** the production-grade repository foundation for the NestJS backend and Next.js frontend — bootstrap, configuration, Prisma wiring, error handling, health checks, security-header/cookie/CORS/CSRF boundaries, the data-fetching layer, the typed API client boundary, design tokens, and testing/lint/build tooling. **No domain modules or feature pages are implemented** — see [What Phase 0 does NOT implement](#what-phase-0-does-not-implement).

**Source of truth used:** `docs/FORGE Business OS — Database Specification (Frozen Architecture v1).md`, `docs/FORGE Business OS — Red Team Review.md`, `docs/FORGE-BUSINESS-OS-BACKEND-API-SPECIFICATION.md` (Document 5), `docs/FORGE-BUSINESS-OS-AUTH-RBAC-SECURITY-SPECIFICATION.md` (Document 6), `docs/FORGE-BUSINESS-OS-DATABASE-MIGRATION.md` (Document 4). The `prisma/` directory (schema, migrations, seed, custom SQL) was **not modified** by this phase — it was inspected, wired into NestJS, and left exactly as delivered.

---

## Final repository structure

```
forge-business-os/
├── .env / .env.example          Repo-root env (DB + apps/api) — unchanged location
├── .gitignore                   Extended: .next/, out/, coverage/, .env.*.local
├── package.json                 Now an npm workspaces root (apps/*, packages/*)
├── package-lock.json
├── tsconfig.json                Unchanged — still scopes prisma/seed.ts only
├── prisma/                      UNCHANGED — schema, migrations, seed, sql/
├── docs/                        Documents 1–6 + this file
│
├── apps/
│   ├── api/                     NestJS backend foundation
│   │   ├── src/
│   │   │   ├── main.ts               Bootstrap: helmet, cookie-parser, CORS,
│   │   │   │                         global prefix, ValidationPipe, error
│   │   │   │                         filter, request-id/logging interceptors,
│   │   │   │                         graceful shutdown
│   │   │   ├── app.module.ts
│   │   │   ├── config/                ConfigModule wiring + class-validator
│   │   │   │                         env validation
│   │   │   ├── common/
│   │   │   │   ├── errors/            AppError + local error-envelope type
│   │   │   │   ├── filters/           AllExceptionsFilter (frozen envelope)
│   │   │   │   ├── interceptors/      RequestIdInterceptor, LoggingInterceptor
│   │   │   │   ├── decorators/        @RequestId()
│   │   │   │   ├── guards/            README only — Phase 1
│   │   │   │   └── pipes/             README only — global ValidationPipe covers Phase 0
│   │   │   ├── database/              PrismaService + PrismaModule (@Global)
│   │   │   ├── health/                HealthController (/live, /ready, /)
│   │   │   └── modules/               README only — auth/crm/sales/projects/
│   │   │                             finance/team/portal/shared land in Phase 1+
│   │   └── test/                      app.e2e-spec.ts (real DB), jest-e2e.json
│   │
│   └── web/                     Next.js frontend foundation (App Router)
│       ├── src/
│       │   ├── app/
│       │   │   ├── (auth)/            Public route group — /login placeholder
│       │   │   ├── (workspace)/       Protected route group — /dashboard
│       │   │   │                     placeholder, no auth guard yet (Phase 1)
│       │   │   ├── layout.tsx         Fonts (marketing-matched weights),
│       │   │   │                     Providers
│       │   │   ├── globals.css        Document 2 §24 design tokens
│       │   │   ├── loading.tsx / error.tsx / global-error.tsx / not-found.tsx
│       │   │   └── page.tsx           Redirects to /dashboard
│       │   ├── lib/api/client.ts      Instantiates @forge/api-client
│       │   └── providers.tsx          TanStack QueryClientProvider
│       └── .env.example
│
└── packages/
    ├── config/                  @forge/config — shared TS strictness baseline
    ├── types/                   @forge/types — error envelope, pagination,
    │                            UserRole mirror (frontend-facing only)
    └── api-client/              @forge/api-client — generic typed fetch
                                 boundary, zero entity-specific DTOs
```

---

## Commands

Run from the repo root (npm workspaces):

| Command | Does |
| --- | --- |
| `npm install` | Installs all workspaces |
| `npm run dev:api` | `nest start --watch` — API on `:4000` |
| `npm run dev:web` | `next dev` — web on `:3000` |
| `npm run build` | Builds both apps (`build:api` then `build:web`) |
| `npm run lint` | Lints both apps |
| `npm run typecheck` | Typechecks both apps |
| `npm run test` | Runs `apps/api`'s unit tests |
| `npm run prisma:*`, `db:seed`, `db:setup` | Unchanged — still operate on the root `prisma/` directory |

Per-app, from `apps/api` or `apps/web` directly (or `--workspace apps/api` / `--workspace apps/web` from the root): `build`, `start`, `start:dev`, `start:debug`, `lint`, `typecheck`, `test`, `test:watch`, `test:cov`, `test:e2e` (api only).

---

## Environment variables

Canonical list lives in `.env.example` (repo root) and `apps/web/.env.example`. Summary:

| Variable | Where | Status |
| --- | --- | --- |
| `DATABASE_URL`, `APP_DB_ROLE` | root `.env` | Pre-existing, unchanged |
| `NODE_ENV`, `PORT`, `CORS_ORIGINS` | root `.env` | **New in Phase 0** — read by `apps/api` |
| `NEXT_PUBLIC_API_BASE_URL` | `apps/web/.env.example` | **New in Phase 0** — browser-exposed |
| Session/JWT signing keys, Google Workspace OAuth, Razorpay, R2, Resend | root `.env.example` (commented) | **NOT CURRENTLY DEFINED** — documented per Document 6 §20 so the full secret surface is visible ahead of time, but **no Phase 0 code reads any of them**. Do not fill in real values until the module that needs them exists. |

`apps/api` has no `.env` of its own — `ConfigModule.forRoot` reads the repo-root `.env` (`envFilePath: [".env", "../../.env"]`), so `DATABASE_URL`/`APP_DB_ROLE` have exactly one source of truth, used by both the Prisma CLI and the API.

Environment separation is via `NODE_ENV`, not three physical files — every environment (dev/test/prod) uses the same variable names; only the values and how they're supplied differ (local `.env`, CI secrets, platform secret manager).

---

## Local development workflow

```bash
cd /Users/atharva/forge-business-os

# 1. Install dependencies (all workspaces)
npm install

# 2. Environment setup — DATABASE_URL etc. already present in .env from
#    Document 4's setup; add PORT/CORS_ORIGINS if starting fresh (see
#    .env.example). apps/web needs its own apps/web/.env.example copied
#    to apps/web/.env.local only if overriding the localhost:4000 default.

# 3. Database setup — unchanged from Document 4, already applied locally:
npx prisma migrate deploy   # or `npm run prisma:migrate:deploy`
npm run db:seed

# 4. Prisma client generation (re-run after any dependency reinstall)
npm run prisma:generate

# 5. Start the API (terminal 1)
npm run dev:api              # http://localhost:4000/api/v1/health

# 6. Start the web app (terminal 2)
npm run dev:web              # http://localhost:3000

# 7. Run tests
npm run test:api                                   # unit
cd apps/api && npx jest --config ./test/jest-e2e.json   # e2e (needs a live DB)

# 8. Lint / typecheck
npm run lint
npm run typecheck

# 9. Production builds
npm run build                # builds apps/api (tsc via `nest build`) then apps/web (next build)
npm run start --workspace apps/api   # node dist/main.js
npm run start --workspace apps/web   # next start
```

No Docker was introduced — the existing local PostgreSQL setup from Document 4 (Homebrew Postgres 18, already running, already migrated and seeded) is a valid, working local workflow, and Step 11 explicitly says not to add Docker "merely for the sake of Docker" when one already exists.

---

## Architecture decisions

### Monorepo shape
The existing repository had `prisma/` at the root with no application code — not a monorepo yet, but not something to restructure destructively either. `apps/*` and `packages/*` were added via npm workspaces **without moving `prisma/`** — it stays exactly where the Prisma CLI, Document 4's setup guide, and the existing root scripts (`prisma:generate`, `db:seed`, etc.) already expect it. `apps/api` reads the same root `.env` rather than duplicating `DATABASE_URL`.

### Why `packages/config`, `packages/types`, `packages/api-client` — and nothing else
Each has an immediate, exercised purpose (Step 2's "only where they have an immediate purpose"):
- **`@forge/config`** — one shared TypeScript strictness baseline (`strict`, `noUncheckedIndexedAccess`, etc.) both apps extend, so the two apps' compiler strictness can't silently drift. Module system / framework-specific options (CommonJS vs. ESNext+bundler, JSX) stay in each app's own `tsconfig.json`, since those genuinely differ per framework.
- **`@forge/types`** — the error envelope, pagination envelope, and a hand-maintained `UserRole` mirror (Document 5 §2.4/§2.8, Document 6 §2.1). Consumed by `apps/web` and `@forge/api-client`.
- **`@forge/api-client`** — the generic, entity-agnostic fetch boundary Step 7 asked for (base URL, credentials, request-id, idempotency-key header support, error-envelope parsing). **Contains zero entity-specific request/response DTOs**, per the explicit instruction not to invent them ahead of real endpoints.

No `packages/ui` was created — Step 14 explicitly scopes Phase 0 to *tokens*, not components; a components package would be premature until Phase 2 actually builds primitives against those tokens.

### Why `apps/api` does not import `@forge/types`
Next.js's `transpilePackages` cleanly compiles workspace TypeScript packages on the fly; NestJS's `tsc`-based build does not have an equivalent for symlinked workspace packages without extra tooling (project references or a bundler) that would add real complexity for one small shared type file. `apps/api/src/common/errors/api-error-envelope.ts` is a **local, hand-kept mirror** of the same shape `@forge/types` exports — both trace to Document 5 §2.8, and a comment in each file says so. This is a pragmatic boundary, not an oversight: `@forge/types` is genuinely a frontend-facing contract package (describing what a client should expect), and the backend is the thing defining that contract in the first place.

### NestJS 11, not 12 — and why the CLI came back
`@nestjs/*@12` ships as pure ESM (`"type": "module"`). A CommonJS-built API (the only mode compatible with this repo's other tooling choices — Jest via `ts-jest`, which itself doesn't support TypeScript 7 yet) cannot `require()` those packages; attempting it fails at both test-time and real runtime with `Must use import to load ES Module`. `@nestjs/schematics@12` also hard-requires `typescript >= 6.0.0`, which no current *stable* TypeScript release satisfies except 7.x (there is no stable 6.x — the registry jumps from 5.x straight to 7.x), and `ts-jest@29.4.12`'s own peer range explicitly excludes TypeScript 7 (`>=4.3 <7`). Chasing this chain (Nest 12 → TS 7 → a still-compatible ts-jest) was a real rabbit hole with no clean end at the moment.

**Resolution:** pin the whole `@nestjs/*` family to `^11.0.0` (a fully current, actively-maintained major, not a legacy one) — confirmed CommonJS, confirmed TypeScript-5.9.2-compatible (`@nestjs/schematics@11` peers on `typescript >= 4.8.2`). This kept TypeScript at `5.9.2`, matching the existing root's proven pin for `prisma/seed.ts`, and avoided a real ESM migration (explicit-`.js`-extension imports, Jest ESM configuration, etc.) that has nothing to do with Phase 0's actual goal.

One consequence: `@nestjs/config` doesn't publish a matching CommonJS `11.x` — its own versioning jumped from `4.0.4` straight to `12.0.0` (also ESM). `4.0.4` is the last CJS release and explicitly peers on `@nestjs/common: '^10.0.0 || ^11.0.0'` — so `apps/api` pins `@nestjs/config` to exactly `4.0.4`, not a caret range, to make this deliberate choice explicit rather than letting a future `npm update` silently pull in the ESM `12.x` line and reintroduce the same failure.

**A second consequence, caught and deliberately not "fixed":** `npm audit` flags a `multer` DoS advisory bundled inside `@nestjs/platform-express@<=12.0.1` (i.e. our pinned `11.x`), and a `deepmerge-ts` DoS advisory in a transitive dependency of the `prisma` CLI itself. `npm audit fix --force` would resolve both — by upgrading `@nestjs/platform-express` to the ESM `12.0.3` (reopening the exact problem just solved) and downgrading `prisma` to `6.12.0` (touching the frozen database tooling, which this phase was explicitly told not to do). **Neither fix was applied.** Both are dev/build-time or currently-dormant-at-runtime concerns: `multer` is Express's multipart body parser, and Document 6 §11 already specifies file uploads go **directly to R2 via presigned URLs, never proxied through Nest's body** — so multer's vulnerable code path is expected to stay unexercised even once a Documents module exists, but that expectation should be re-verified when that module is actually built, not just assumed forever.

### Why `tsx` was tried and then dropped for `apps/api`
`tsx` (esbuild-based) was the first choice for `start:dev`, chosen because it's already a proven dependency in this exact repo (`prisma/seed.ts`). It was **live-tested, found broken, and reverted** — esbuild does not implement TypeScript's `emitDecoratorMetadata` output, which both NestJS's constructor-based dependency injection and `class-transformer`'s `enableImplicitConversion` rely on to know a property's or parameter's type at runtime. The failure was concrete and reproducible: environment validation for `PORT=4000` (a string from `process.env`) failed with "PORT must be an integer number" because the numeric conversion never happened — `Reflect.getMetadata('design:type', ...)` had nothing to read. Standard `@nestjs/cli`/`@nestjs/schematics@11` (confirmed TypeScript-5.9.2-compatible, see above) replaced it, using `tsc`-based compilation end to end, and the same scenario was re-tested live and works correctly.

### Terminus's own `PrismaHealthIndicator`
A hand-rolled Prisma health indicator was written first (extending `HealthIndicator`, throwing `HealthCheckError`), then **replaced** once typechecking surfaced that `@nestjs/terminus@11`'s actual exports don't include either of those — the package now ships its own official `PrismaHealthIndicator` with a `pingCheck(key, prismaClient, options)` method built on a newer `HealthIndicatorService` session API. Using the maintained, official indicator instead of a hand-rolled one is strictly better once it's confirmed to exist and work (verified live against the real database: `GET /api/v1/health/ready` → `{"database":{"status":"up"}}`).

### Error envelope, request-id, logging
`AllExceptionsFilter` implements Document 5 §2.8's envelope exactly (`{ error: { code, message, details, requestId } }`), normalizing Nest's own default `ValidationPipe` response shape (a `string[]` of messages) into it rather than leaking Nest's format to clients. `RequestIdInterceptor` runs first in the global interceptor chain so every later interceptor and the exception filter can rely on `request.id`; it reuses an inbound `X-Request-Id` header if present (so a caller or upstream proxy's correlation id survives) or mints one via `crypto.randomUUID()`. `LoggingInterceptor` logs one structured JSON line per successful request; `AllExceptionsFilter` owns error-path logging so failures aren't logged twice in two different shapes. No external logging/observability provider (Sentry etc.) was added — Step 13 says not to unless already configured, and none is.

### Security foundation (Step 12) — what exists and what explicitly doesn't
- `helmet()` — real, verified live (HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options`, etc. all present on responses). CSP is left at helmet's safe default; Document 6 §22 marks a production CSP allowlist as **NOT CURRENTLY DEFINED**, so none was invented.
- `cookie-parser()` — real, registered, so a future auth guard can read `forge_session`/`portal_session` (Document 6 §5.1). No session/JWT validation exists — that's Phase 1.
- CORS — real, verified live (`Access-Control-Allow-Origin`/`-Credentials` correctly returned for `http://localhost:3000`), origin list driven by `CORS_ORIGINS`.
- **CSRF is not implemented.** Document 6 §13 ties CSRF specifically to state-changing *portal* routes, none of which exist yet, and explicitly marks the internal-app CSRF mandate as **NOT CURRENTLY DEFINED**. Nothing here fakes a CSRF guard.
- **No auth/RBAC guards exist.** `src/common/guards/README.md` documents exactly what Document 6 §8 specifies will live there (`@InternalAuth()`, `@PortalAuth()`, `PortalScopeGuard`, `RolesGuard`) and states plainly: **AUTH/RBAC IMPLEMENTATION COMES IN PHASE 1.**

### Data layer (Step 6) — approvals used exactly as scoped
- **TanStack Query** — approved and installed (`@tanstack/react-query`), wired as the single `QueryClientProvider` in `apps/web/src/providers.tsx`. No queries exist yet (no domain modules) — this is the provider/plumbing only.
- **Zod** — approved and installed (`zod`) as a dependency, ready for Phase 2 form schemas. Not yet used anywhere (no forms exist).
- **No Redux/Zustand/MobX** — not installed, not needed; Doc B3 §9's five state categories (server/URL/local UI/form/session) each already have a home without a global store.

### Design tokens (Step 14)
`apps/web/src/app/globals.css` implements Document 2 §24's inventory (colors including the four new semantic pairs, motion durations/easings, elevation, spacing, typography scale, z-index) as CSS custom properties, bridged into Tailwind v4 utility classes via `@theme inline` — the same mechanism the marketing site's `globals.css` already proves works, applied to this app's own token values. **Radius was deliberately not redeclared** — Document 2 §6 uses exactly Tailwind's default `rounded-lg`/`rounded-xl`/`rounded-2xl`/`rounded-full`, and inventing custom radius tokens would be the "random radius value" Document 2 explicitly prohibits. **Fonts are loaded at the exact same weights as the marketing site** (Archivo 600/700/800, Source Serif 4 400, IBM Plex Mono 400/500) — the Archivo 400/500 addition Document B3 §27 flagged as needing Forge approval was **not** silently applied here; Phase 0 documents the gap rather than resolving it unilaterally.

---

## Packages added, and why

| Package | Where | Why |
| --- | --- | --- |
| `@nestjs/{common,core,config,platform-express,terminus}` | apps/api | Runtime framework — see NestJS 11 decision above |
| `@nestjs/{cli,schematics,testing}` (dev) | apps/api | Standard build/dev-server tooling and e2e testing harness |
| `class-validator`, `class-transformer` | apps/api | Document 5 §2.6's explicit validation approach; also used for env validation (§Config) |
| `helmet` | apps/api | Security headers foundation (Step 12) |
| `cookie-parser` | apps/api | Cookie configuration boundary (Step 12) — parsing only, no session logic |
| `reflect-metadata` | apps/api | Required by Nest's decorator-based DI and by `class-transformer` |
| `jest`, `ts-jest`, `supertest`, `ts-node` (dev) | apps/api | Unit + e2e testing foundation (Step 9) |
| `eslint`, `typescript-eslint`, `@eslint/js` (dev) | apps/api | Lint foundation (Step 10) |
| `next`, `react`, `react-dom` | apps/web | Frontend framework, App Router |
| `@tanstack/react-query` | apps/web | **PROPOSED → APPROVED in Step 6** — server-state layer |
| `zod` | apps/web | **PROPOSED → APPROVED in Step 6** — frontend validation |
| `tailwindcss`, `@tailwindcss/postcss` | apps/web | Utility-class layer the design tokens bridge into, matching the marketing site's proven Tailwind v4 setup |
| `eslint`, `eslint-config-next` (dev) | apps/web | Lint foundation, matching the marketing site's convention |

Nothing was installed silently — every library named above either traces to an explicit Phase 0 instruction (helmet/cookie-parser/class-validator per Step 12, jest/supertest per Step 9) or to an explicit approval in this same task (TanStack Query, Zod, Step 6). No global state library, no Redis/Kafka/Elasticsearch, no new auth provider, no new role, no `TeamPayout`/`Integration`/`Template`/`SavedView` entity — none were introduced, per the frozen-rules list.

---

## Known open decisions

Carried forward, not silently resolved:

1. **Archivo 400/500 font weights** — still unresolved (Document B3 §27). `globals.css`'s typography scale is defined, but the marketing-matched font *load* only covers 600/700/800.
2. **Semantic hue approval** (success/danger/warning/info) — computed and wired into tokens, still awaiting an explicit design sign-off per Document 2 §3/B3 §27.
3. **z-index scale** — defined in `globals.css`, never formally approved by Forge (net-new in Document 2 §24).
4. **⌘K command-palette convention** — no command palette exists yet in Phase 0; the keybinding question itself remains open per Document B3 §27/§18.
5. **Table select-all semantics, toast auto-dismiss duration, icon library** — unaffected by Phase 0, still open (no tables/toasts/icons exist yet).
6. **Internal-app CSRF mandate** — Document 6 §13/§26 marks this **NOT CURRENTLY DEFINED**; not implemented.
7. **Session/JWT design specifics** (TTLs, storage mechanism, cookie `Domain`/`Path`, concurrent-session policy) — all listed as **NOT CURRENTLY DEFINED** in Document 6 §5.2/§26; nothing in Phase 0 assumes an answer, because no session code exists yet.
8. **`npm audit`: `multer` (via pinned NestJS 11) and `deepmerge-ts` (via the `prisma` CLI)** — both traced, both deliberately left unpatched this phase (see NestJS 11 decision above); worth revisiting when (a) a Documents module is actually built and can confirm multer's code path stays unused, and (b) a TypeScript-7-compatible `ts-jest` exists, unblocking a clean move to `@nestjs/*@12`.
9. **`npm`'s new `install-scripts` allowlist gate** — several packages' install scripts (Prisma's own postinstall included) print an "not yet covered by allowScripts" warning on install. They appear to run successfully regardless (the generated Prisma Client works), but CI reproducibility would benefit from an explicit `npm install-scripts approve <pkg>` pass — not done here since no CI pipeline exists yet to make that concrete.
10. **Two-application recommendation** (`app.forgebuilds.in` vs. a separate `portal.forgebuilds.in` codebase) — Document B3 §1's recommendation, still just a recommendation; Phase 0 only builds the internal-OS app.

---

## What Phase 0 does NOT implement

- Any domain module: **auth, crm, sales, projects, finance, team, portal, shared** (all eight reserved via `apps/api/src/modules/README.md`, matching Document 5 §1's module boundaries exactly).
- Any authentication or authorization — no guards, no session validation, no RBAC. Every route in this API is currently reachable without a session, which is expected: there is nothing behind it yet.
- Any dashboard, CRM, finance, or project *pages* — `apps/web`'s `(workspace)/dashboard/page.tsx` is a placeholder proving the shell renders, not a feature.
- Any component beyond the token/provider foundation — no `Button`, `Table`, `Modal`, etc. (Document 2's component library is Phase 2 work).
- CSRF protection, rate limiting, invitation/password-reset flows, Razorpay/R2/Resend/Google-OAuth integration — all explicitly Phase 1+ per Document 6.
- A Client Portal application (`portal.forgebuilds.in`) — out of scope for this phase per the task brief, which scopes Phase 0 to the internal Business OS.

---

## Final report

**A. Repository structure:** an npm-workspaces monorepo (`apps/api`, `apps/web`, `packages/config|types|api-client`) added around the pre-existing `prisma/` root, which was preserved in place, unmoved, unmodified.

**B. Backend foundation:** NestJS 11 app — bootstrap, config module with class-validator-backed env validation, global `ValidationPipe`, `AllExceptionsFilter` implementing Document 5's frozen error envelope, request-id + structured-logging interceptors, helmet + cookie-parser + CORS, graceful shutdown, `/api/v1/health/{live,ready,}` (backed by Terminus's official Prisma indicator). Verified live against the real local database.

**C. Frontend foundation:** Next.js 16 App Router app — `(auth)`/`(workspace)` route groups (proven live: `/login` 200, `/dashboard` 200, unknown route 404 via `not-found.tsx`), root/segment `loading`/`error`/`global-error`/`not-found` boundaries, design tokens wired into Tailwind v4, TanStack Query provider, typed API client wired to `apps/api`.

**D. Prisma integration:** `PrismaService`/`PrismaModule` with proper `onModuleInit`/`onModuleDestroy` lifecycle tied to `app.enableShutdownHooks()`. Schema/migrations untouched (`git diff --stat prisma/` is empty). `@prisma/client` version confirmed unchanged (`6.19.3`, identical before and after this phase's `npm install`).

**E. TanStack Query:** approved per this task's Step 6 and installed in `apps/web`.

**F. Zod:** approved per this task's Step 6 and installed in `apps/web`.

**G. API client boundary:** `@forge/api-client` — centralized base URL, `credentials: "include"`, `X-Request-Id` + optional `Idempotency-Key` headers, typed error-envelope parsing into `ApiClientError`/`ApiNetworkError`. Zero entity-specific DTOs.

**H. Environment setup:** root `.env.example` extended (NODE_ENV/PORT/CORS_ORIGINS documented and wired; Phase-1 secrets documented as NOT CURRENTLY DEFINED and left unwired); `apps/web/.env.example` added for `NEXT_PUBLIC_API_BASE_URL`.

**I. Testing foundation:** Jest unit tests (`env.validation.spec.ts`, 5 passing) and a Supertest e2e suite (`app.e2e-spec.ts`, 5 passing against the real local database) for `apps/api`; lint/typecheck configured for `apps/web` with no test runner added yet (no components exist to test).

**J. Security foundation:** helmet, cookie-parser, CORS all real and live-verified; CSRF and all auth/RBAC guards explicitly documented as not implemented (Phase 1), per Document 6.

**K. Health/observability:** `/api/v1/health/live` (liveness) and `/api/v1/health/ready` (liveness + real Postgres connectivity) both live-verified; structured JSON request logging; no external observability provider added.

**L. Design token foundation:** Document 2 §24's full inventory implemented as CSS custom properties + Tailwind v4 bridge; no components built.

**M. Documentation:** this file.

**N. Commands verified:** `install`, `prisma:generate`, `typecheck` (both apps), `build` (both apps), `lint` (both apps, 0 errors), `test` (api, 5/5), `test:e2e` (api, 5/5 against real DB), `dev:api` and `dev:web` (both live-smoke-tested with real HTTP requests, then cleanly stopped).

**O. Files changed:** see `git diff`/`git status` in the forge-business-os repository — `package.json`, `package-lock.json`, `.gitignore`, `.env.example` modified; `apps/`, `packages/`, `docs/IMPLEMENTATION-PHASE-0.md` added. `prisma/` untouched.

**P. Open decisions:** see [Known open decisions](#known-open-decisions) above — 10 items, none silently resolved.

**Q. Confirmation — Prisma schema/migrations NOT modified:** confirmed (`git diff --stat prisma/` empty; `@prisma/client` version unchanged at `6.19.3` before and after `npm install`; no `prisma migrate`/`prisma db push`/`prisma migrate reset` command was ever run).

**R. Confirmation — marketing repo NOT modified:** confirmed (`git status` in `/Users/atharva/Forge` is identical before and after this task — only the same pre-existing, pre-Phase-0 changes remain).

---

**IMPLEMENTATION PHASE 0 COMPLETE — READY FOR AUTH + RBAC IMPLEMENTATION**
