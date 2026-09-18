/**
 * Sets dummy Resend env vars for AppModule boot in tests.
 * The `resend` package is redirected to test/__mocks__/resend.ts via
 * moduleNameMapper — no real network calls occur.
 */
process.env.RESEND_API_KEY ??= "re_test_dummy_key_not_real";
process.env.EMAIL_FROM ??= "FORGE <test-noreply@forge.local>";
