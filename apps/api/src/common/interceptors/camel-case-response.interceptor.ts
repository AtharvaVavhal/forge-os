import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { toCamelCase } from "../serialization/camel-case";

/** Registered globally in main.ts / test/support/bootstrap.ts — see camel-case.ts for why. */
@Injectable()
export class CamelCaseResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data: unknown) => toCamelCase(data)));
  }
}
