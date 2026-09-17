import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { AppModule } from "../../src/app.module";
import { AllExceptionsFilter } from "../../src/common/filters/all-exceptions.filter";
import { CamelCaseResponseInterceptor } from "../../src/common/interceptors/camel-case-response.interceptor";
import { LoggingInterceptor } from "../../src/common/interceptors/logging.interceptor";
import { RequestIdInterceptor } from "../../src/common/interceptors/request-id.interceptor";

/**
 * Mirrors main.ts's bootstrap exactly (minus `helmet`/CORS/shutdown hooks,
 * which aren't relevant to in-process Supertest calls) so every e2e spec
 * exercises the same pipe/filter/interceptor/cookie-parser stack the real
 * app runs — not a stripped-down test-only approximation of it.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  );
  app.useGlobalInterceptors(
    new RequestIdInterceptor(),
    new LoggingInterceptor(),
    new CamelCaseResponseInterceptor()
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

/** Extracts a named cookie's value from a Supertest response's `Set-Cookie` header. */
export function extractCookie(setCookieHeader: string[] | undefined, name: string): string | undefined {
  if (!setCookieHeader) return undefined;
  for (const raw of setCookieHeader) {
    const pair = raw.split(";")[0] ?? "";
    const [key, value] = pair.split("=");
    if (key === name) return decodeURIComponent(value ?? "");
  }
  return undefined;
}
