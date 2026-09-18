import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { AppError } from "../errors/app-error";
import type { ApiErrorEnvelope } from "../errors/api-error-envelope";

interface RequestWithId extends Request {
  id?: string;
}

interface Resolved {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * The single place every thrown error becomes an HTTP response. Implements
 * Document 5 §2.8's frozen envelope exactly. Never leaks a stack trace,
 * secret, SQL fragment, or internal message for an unexpected (500) error —
 * Document 6 §21 is explicit that client-facing errors get a stable `code`
 * and a safe `message` only.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    const requestId =
      request.id ?? (request.headers["x-request-id"] as string | undefined) ?? randomUUID();

    const resolved = this.resolve(exception);

    this.logger.error(
      JSON.stringify({
        requestId,
        status: resolved.status,
        code: resolved.code,
        method: request.method,
        path: request.originalUrl ?? request.url,
      }),
      resolved.status >= 500 && exception instanceof Error ? exception.stack : undefined
    );

    const body: ApiErrorEnvelope = {
      error: {
        code: resolved.code,
        message: resolved.message,
        details: resolved.details,
        requestId,
      },
    };

    response.status(resolved.status).json(body);
  }

  private resolve(exception: unknown): Resolved {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === "object" && payload !== null) {
        const record = payload as Record<string, unknown>;
        // Nest's built-in ValidationPipe throws a BadRequestException whose
        // response `message` is a string[] of per-field violations — that's
        // not the frozen envelope shape, so normalize it rather than leak
        // Nest's own default response format to clients.
        const isValidationMessage = Array.isArray(record.message);

        return {
          status,
          code: typeof record.code === "string" ? record.code : this.defaultCode(status),
          message: isValidationMessage
            ? "The request failed validation."
            : typeof record.message === "string"
              ? record.message
              : exception.message,
          details: isValidationMessage
            ? { fields: record.message }
            : record.details !== undefined
              ? record.details
              : undefined,
        };
      }

      return { status, code: this.defaultCode(status), message: exception.message };
    }

    return {
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong. Please try again.",
    };
  }

  private defaultCode(status: number): string {
    switch (status) {
      case 400:
        return "BAD_REQUEST";
      case 401:
        return "UNAUTHENTICATED";
      case 403:
        return "FORBIDDEN";
      case 404:
        return "NOT_FOUND";
      case 409:
        return "CONFLICT";
      case 422:
        return "UNPROCESSABLE_ENTITY";
      case 429:
        return "RATE_LIMITED";
      default:
        return "INTERNAL_SERVER_ERROR";
    }
  }
}
