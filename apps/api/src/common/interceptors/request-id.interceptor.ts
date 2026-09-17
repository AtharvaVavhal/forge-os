import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import type { Observable } from "rxjs";

interface RequestWithId extends Request {
  id?: string;
}

/**
 * Assigns a correlation id to every request — reused from an inbound
 * `X-Request-Id` header if the caller (or an upstream proxy) already set
 * one, otherwise minted fresh. Runs first in the global interceptor chain
 * (registered before `LoggingInterceptor` in main.ts) so every later
 * interceptor, filter, and the response itself can rely on `request.id`
 * being set. Echoed back as a response header so a client can correlate
 * its own logs with the server's.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<Response>();

    const incoming = request.headers["x-request-id"];
    const id = typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();

    request.id = id;
    response.setHeader("X-Request-Id", id);

    return next.handle();
  }
}
