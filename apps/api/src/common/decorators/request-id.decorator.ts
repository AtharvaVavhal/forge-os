import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";

interface RequestWithId extends Request {
  id?: string;
}

/**
 * Pulls the correlation id `RequestIdInterceptor` assigned onto the request.
 * Usage in a future controller: `handler(@RequestId() requestId: string)`.
 */
export const RequestId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<RequestWithId>();
  return request.id ?? "unknown";
});
