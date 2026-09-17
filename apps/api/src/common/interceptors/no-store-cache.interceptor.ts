import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Response } from "express";
import { Observable } from "rxjs";

/**
 * B9 M7: prevent shared caches from retaining session / identity JSON.
 * Applied to auth and portal identity GET endpoints.
 */
@Injectable()
export class NoStoreCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader("Cache-Control", "no-store");
    return next.handle();
  }
}
