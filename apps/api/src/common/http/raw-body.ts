import { InternalServerErrorException } from "@nestjs/common";
import type { Request } from "express";

/**
 * The Razorpay webhook (Document 5 §9.2 / Document 6 §12) must verify an
 * HMAC signature against the **raw** request body — the exact bytes
 * Razorpay signed, before any JSON parsing. Nest's default body parser
 * (enabled automatically by `NestFactory.create`) parses and discards the
 * raw buffer. This `verify` callback, passed to `express.json({ verify })`
 * in main.ts (with Nest's own automatic body parser disabled via
 * `bodyParser: false` so it isn't registered twice), stashes the raw
 * bytes on the request for every request — a global, harmless side
 * effect (just holding a buffer reference) that only the webhook route
 * actually reads.
 */
export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

export function rawBodySaver(req: RequestWithRawBody, _res: unknown, buf: Buffer): void {
  if (buf?.length) {
    req.rawBody = buf;
  }
}

/** Throws (never silently proceeds with an empty/missing body) if the raw body wasn't captured — see rawBodySaver above. */
export function requireRawBody(request: RequestWithRawBody): Buffer {
  if (!request.rawBody) {
    // Only reachable if main.ts's body-parser wiring is ever changed
    // without updating this — a real misconfiguration, not a client error.
    throw new InternalServerErrorException("Raw request body was not captured.");
  }
  return request.rawBody;
}
