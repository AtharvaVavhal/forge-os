# Pipes — no custom pipes yet

Phase 0 uses Nest's built-in `ValidationPipe`, registered globally in
`main.ts` with `whitelist: true`, `forbidNonWhitelisted: true`, and
`transform: true` (Document 5 §2.6). That covers every DTO-validation need
this foundation currently has.

A custom pipe (e.g. a shared `ParseMoneyPipe` enforcing Document 5 §2.6's
"money fields are decimal strings, not floats" rule at the transport
boundary) is reasonable future work once a real endpoint accepts a money
field — Phase 0 has no such endpoint yet, so no such pipe is invented here.
