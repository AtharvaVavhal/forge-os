import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable, tap } from "rxjs";

interface RequestWithId extends Request {
  id?: string;
}

/**
 * Structured (single-line JSON) request logging — the foundation Step 3/13
 * ask for. Only logs successful completions; `AllExceptionsFilter` owns
 * error-path logging so a failed request isn't logged twice in two
 * different shapes. No external logging provider (Sentry etc.) is wired
 * here — Phase 0 explicitly doesn't add one (see docs/IMPLEMENTATION-PHASE-0.md).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<Response>();
        this.logger.log(
          JSON.stringify({
            requestId: request.id,
            method: request.method,
            path: request.originalUrl ?? request.url,
            statusCode: response.statusCode,
            durationMs: Date.now() - start,
          })
        );
      })
    );
  }
}
