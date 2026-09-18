/**
 * Sets dummy R2 env vars for AppModule boot in tests.
 * AWS SDK modules are redirected to test/__mocks__ via moduleNameMapper —
 * no real R2 network calls occur.
 */
process.env.R2_ACCOUNT_ID ??= "test-account";
process.env.R2_ACCESS_KEY_ID ??= "test-access-key-id";
process.env.R2_SECRET_ACCESS_KEY ??= "test-secret-access-key-value";
process.env.R2_BUCKET_NAME ??= "test-bucket";
