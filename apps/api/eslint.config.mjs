// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Phase 0 foundation code intentionally touches Express's loosely-typed
      // Request/Response objects (headers, cookies) in a few narrow spots —
      // warn, don't block, until domain modules make the real DTO surface.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
    },
  },
  {
    // `INestApplication#getHttpServer()` returns `any` by design (it's a
    // thin wrapper over whichever HTTP adapter is active) — every
    // NestJS + Supertest e2e test passes that `any` into `request(...)`,
    // so these two rules are downgraded for test files only, not project-wide.
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
    },
  }
);
