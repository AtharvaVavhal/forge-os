import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Response } from "express";
import { Observable, from, of } from "rxjs";
import { tap } from "rxjs/operators";
import { IDEMPOTENT_KEY } from "./idempotent.decorator";
import type { AuthenticatedRequest } from "../../modules/auth/types/authenticated-request.interface";

const IDEMPOTENCY_HEADER = "idempotency-key";
const TTL_MS = 24 * 60 * 60 * 1000; // Document 5 §2.7: "Store key -> response for 24h."

interface StoredResponse {
  status: number;
  body: unknown;
  expiresAt: number;
}

/**
 * Document 5 §2.7: `Idempotency-Key` header, **required** on the named set
 * of financial POST routes (invoice/payment/refund/credit-note/forge-fund-
 * entry creation and invoice send); "Store key -> response for 24h scoped
 * to (organization_id, user_id, route)." In-memory only — Document 6 §19
 * is explicit that none of this project's concurrency controls use Redis.
 *
 * Concurrent in-flight requests that share a key wait on the first
 * request's result rather than both mutating (defense for double-click /
 * retried clients that race before the 24h store is written).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly store = new Map<string, StoredResponse>();
  private readonly inflight = new Map<string, Promise<{ status: number; body: unknown }>>();

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isIdempotent) return next.handle();

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawKey = request.headers[IDEMPOTENCY_HEADER];
    const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: "Idempotency-Key header is required on this route.",
      });
    }
    if (!request.user) return next.handle();

    this.evictExpired();

    const cacheKey = `${request.user.organizationId}:${request.user.id}:${request.route?.path ?? request.path}:${idempotencyKey}`;
    const cached = this.store.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const response = context.switchToHttp().getResponse<Response>();
      response.status(cached.status);
      return of(cached.body);
    }

    const existingInflight = this.inflight.get(cacheKey);
    if (existingInflight) {
      return from(
        existingInflight.then((result) => {
          const response = context.switchToHttp().getResponse<Response>();
          response.status(result.status);
          return result.body;
        })
      );
    }

    const response = context.switchToHttp().getResponse<Response>();
    let resolveInflight!: (value: { status: number; body: unknown }) => void;
    let rejectInflight!: (reason: unknown) => void;
    const inflightPromise = new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      resolveInflight = resolve;
      rejectInflight = reject;
    });
    // Prevent unhandled rejection when the primary request fails and no
    // concurrent waiter is attached to this promise.
    void inflightPromise.catch(() => undefined);
    this.inflight.set(cacheKey, inflightPromise);

    return next.handle().pipe(
      tap({
        next: (body: unknown) => {
          const status = response.statusCode;
          if (status >= 200 && status < 300) {
            this.store.set(cacheKey, { status, body, expiresAt: Date.now() + TTL_MS });
          }
          resolveInflight({ status, body });
          this.inflight.delete(cacheKey);
        },
        error: (err: unknown) => {
          rejectInflight(err);
          this.inflight.delete(cacheKey);
        },
      })
    );
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, value] of this.store) {
      if (value.expiresAt <= now) this.store.delete(key);
    }
  }
}
