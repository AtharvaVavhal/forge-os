/**
 * Local mirror of the error envelope Document 5 §2.8 freezes. Deliberately
 * NOT imported from `@forge/types` — see docs/IMPLEMENTATION-PHASE-0.md for
 * why apps/api avoids cross-workspace-package TypeScript resolution for its
 * build (Nest's `tsc`-based build doesn't transpile through symlinked
 * workspace packages the way Next.js's `transpilePackages` does). Both
 * shapes describe the same frozen contract; if they ever disagree, Document
 * 5 is the source of truth for both.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId: string;
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}
