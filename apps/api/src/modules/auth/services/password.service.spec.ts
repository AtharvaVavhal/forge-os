import { PasswordService } from "./password.service";

function makePasswordService(costFactor = 10): PasswordService {
  const fakeConfig = { get: () => costFactor } as never;
  return new PasswordService(fakeConfig);
}

describe("PasswordService", () => {
  it("hashes a password to something other than the plaintext", async () => {
    const service = makePasswordService();
    const hash = await service.hash("a-real-password-123");
    expect(hash).not.toBe("a-real-password-123");
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt hash format
  });

  it("verifies a correct password against its own hash", async () => {
    const service = makePasswordService();
    const hash = await service.hash("correct-password-123");
    await expect(service.verify("correct-password-123", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password against a real hash", async () => {
    const service = makePasswordService();
    const hash = await service.hash("correct-password-123");
    await expect(service.verify("wrong-password-123", hash)).resolves.toBe(false);
  });

  it("never stores or returns the plaintext anywhere in the hash output", async () => {
    const service = makePasswordService();
    const hash = await service.hash("super-secret-value");
    expect(hash).not.toContain("super-secret-value");
  });

  it("produces a different hash for the same password on each call (random salt)", async () => {
    const service = makePasswordService();
    const [hashA, hashB] = await Promise.all([
      service.hash("same-password-123"),
      service.hash("same-password-123"),
    ]);
    expect(hashA).not.toBe(hashB);
  });
});
