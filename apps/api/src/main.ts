import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import type { AppConfig } from "./config/configuration";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { RequestIdInterceptor } from "./common/interceptors/request-id.interceptor";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService<AppConfig, true>);

  // --- Security headers foundation (Step 12) -------------------------------
  // Sets HSTS, X-Content-Type-Options, frame protections, etc. at safe
  // defaults. CSP is deliberately left at helmet's default (report-only
  // policy tuning is an application-specific decision Document 6 §22 marks
  // NOT CURRENTLY DEFINED — do not invent a production CSP allowlist here).
  app.use(helmet());

  // --- Cookie configuration boundary (Step 12) -----------------------------
  // Parses cookies so a future auth guard can read `forge_session` /
  // `portal_session` (Document 6 §5.1). No session/JWT validation exists
  // yet — that is Phase 1. See src/common/guards/README.md.
  app.use(cookieParser());

  // --- CORS -----------------------------------------------------------------
  // `credentials: true` because the frozen session design is httpOnly
  // cookies (Document 6 §5), which requires the browser to send credentials
  // cross-origin between app.forgebuilds.in and its API host.
  app.enableCors({
    origin: configService.get("cors.origins", { infer: true }),
    credentials: true,
  });

  // --- Frozen API base path (Document 5 §2.1) --------------------------------
  app.setGlobalPrefix(configService.get("apiPrefix", { infer: true }));

  // --- Global validation (Document 5 §2.6) -----------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    })
  );

  // --- Consistent error envelope + request-id/logging foundation -----------
  // Order matters: RequestIdInterceptor must run before LoggingInterceptor
  // so `request.id` exists by the time logging reads it.
  app.useGlobalInterceptors(new RequestIdInterceptor(), new LoggingInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // --- Graceful shutdown ------------------------------------------------------
  // Lets PrismaService.onModuleDestroy() (and any future module's own
  // cleanup) run on SIGTERM/SIGINT instead of the process dying mid-query.
  app.enableShutdownHooks();

  const port = configService.get("port", { infer: true });
  await app.listen(port);
  console.log(`FORGE Business OS API listening on port ${port} (prefix: /api/v1)`);
}

void bootstrap();
