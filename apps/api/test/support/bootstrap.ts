import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { json, urlencoded } from "express";
import { AppModule } from "../../src/app.module";
import { AllExceptionsFilter } from "../../src/common/filters/all-exceptions.filter";
import { CamelCaseResponseInterceptor } from "../../src/common/interceptors/camel-case-response.interceptor";
import { LoggingInterceptor } from "../../src/common/interceptors/logging.interceptor";
import { RequestIdInterceptor } from "../../src/common/interceptors/request-id.interceptor";
import { rawBodySaver } from "../../src/common/http/raw-body";

/**
 * Mirrors main.ts's bootstrap exactly (minus `helmet`/CORS/shutdown hooks,
 * which aren't relevant to in-process Supertest calls) so every e2e spec
 * exercises the same pipe/filter/interceptor/cookie-parser stack the real
 * app runs — not a stripped-down test-only approximation of it. That
 * includes the raw-body-capturing body parser (B5's Razorpay webhook
 * needs the exact raw bytes to verify against — see main.ts and
 * common/http/raw-body.ts) — `bodyParser: false` here for the same reason
 * it's set in main.ts: Nest's own automatic parser has no `verify` hook.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication({ bodyParser: false });
  app.use(json({ verify: rawBodySaver }));
  app.use(urlencoded({ extended: true, verify: rawBodySaver }));
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
