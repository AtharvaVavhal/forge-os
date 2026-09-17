import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";
import { LoggingInterceptor } from "../src/common/interceptors/logging.interceptor";
import { RequestIdInterceptor } from "../src/common/interceptors/request-id.interceptor";

/**
 * Proves the Phase 0 foundation actually works end to end against a real
 * (local) database — not full feature coverage, since there are no domain
 * features yet. Requires the repo-root `.env` to point at a reachable
 * Postgres instance with the frozen migration applied.
 */
describe("App foundation (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    app.useGlobalInterceptors(new RequestIdInterceptor(), new LoggingInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/health/live reports ok without touching the database", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health/live");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("GET /api/v1/health reports database connectivity", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body.info.database.status).toBe("up");
  });

  it("an unknown route returns the frozen error envelope shape", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/this-route-does-not-exist");
    expect(response.status).toBe(404);
    expect(response.body.error).toBeDefined();
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(typeof response.body.error.requestId).toBe("string");
    expect(response.body.error.requestId.length).toBeGreaterThan(0);
  });

  it("every response carries an X-Request-Id header", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health/live");
    expect(response.headers["x-request-id"]).toBeDefined();
  });

  it("echoes a caller-supplied X-Request-Id back unchanged", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/health/live")
      .set("X-Request-Id", "test-fixed-id-123");
    expect(response.headers["x-request-id"]).toBe("test-fixed-id-123");
  });
});
