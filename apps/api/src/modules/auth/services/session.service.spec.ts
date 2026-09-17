import { JwtService } from "@nestjs/jwt";
import { UnauthorizedException } from "@nestjs/common";
import { SessionService } from "./session.service";

const SIGNING_KEY = "unit-test-signing-key-at-least-32-characters-long";

function makeSessionService(overrides: Record<string, unknown> = {}): SessionService {
  const values: Record<string, unknown> = {
    "auth.sessionJwtSigningKey": SIGNING_KEY,
    "auth.sessionJwtTtlSeconds": 3600,
    "auth.passwordResetTokenTtlSeconds": 1800,
    "cookies.secure": false,
    "cookies.domain": undefined,
    ...overrides,
  };
  const fakeConfig = { get: (key: string) => values[key] } as never;
  return new SessionService(new JwtService({}), fakeConfig);
}

describe("SessionService", () => {
  describe("session tokens", () => {
    it("signs and verifies a round trip, preserving sub/org/role", () => {
      const service = makeSessionService();
      const { token } = service.signSession({
        userId: "user-1",
        organizationId: "org-1",
        role: "FOUNDER_ADMIN",
      });

      const payload = service.verifySession(token);
      expect(payload.sub).toBe("user-1");
      expect(payload.org).toBe("org-1");
      expect(payload.role).toBe("FOUNDER_ADMIN");
      expect(payload.aud).toBe("internal");
    });

    it("rejects a token signed with a different key", () => {
      const service = makeSessionService();
      const otherService = makeSessionService({ "auth.sessionJwtSigningKey": "a-completely-different-key-value" });
      const { token } = otherService.signSession({
        userId: "user-1",
        organizationId: "org-1",
        role: "TEAM_MEMBER",
      });

      expect(() => service.verifySession(token)).toThrow(UnauthorizedException);
    });

    it("rejects an expired token", () => {
      const service = makeSessionService({ "auth.sessionJwtTtlSeconds": -1 });
      const { token } = service.signSession({
        userId: "user-1",
        organizationId: "org-1",
        role: "TEAM_MEMBER",
      });

      expect(() => service.verifySession(token)).toThrow(UnauthorizedException);
    });

    it("rejects a well-formed but garbage token", () => {
      const service = makeSessionService();
      expect(() => service.verifySession("not.a.real.jwt")).toThrow(UnauthorizedException);
    });
  });

  describe("password reset tokens", () => {
    it("signs and verifies with the internal-password-reset audience", () => {
      const service = makeSessionService();
      const token = service.signPasswordResetToken("user-42");
      const payload = service.verifyPasswordResetToken(token);
      expect(payload.sub).toBe("user-42");
      expect(payload.aud).toBe("internal-password-reset");
    });

    it("a session token is rejected when verified as a password-reset token (audience isolation)", () => {
      const service = makeSessionService();
      const { token } = service.signSession({
        userId: "user-1",
        organizationId: "org-1",
        role: "TEAM_MEMBER",
      });

      expect(() => service.verifyPasswordResetToken(token)).toThrow(UnauthorizedException);
    });

    it("a password-reset token is rejected when verified as a session token (audience isolation)", () => {
      const service = makeSessionService();
      const resetToken = service.signPasswordResetToken("user-1");

      expect(() => service.verifySession(resetToken)).toThrow(UnauthorizedException);
    });
  });
});
