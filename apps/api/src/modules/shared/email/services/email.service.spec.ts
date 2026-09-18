import { EmailService } from "./email.service";
import {
  mockSentEmails,
  queueMockResendError,
  queueMockResendThrow,
  resetMockResend,
} from "../../../../../test/__mocks__/resend";

function makeEmailService(config: { apiKey?: string; from?: string }): EmailService {
  const configured = Boolean(config.apiKey && config.from);
  const fakeConfig = {
    get: (key: string) => {
      if (key === "email") {
        return { apiKey: config.apiKey, from: config.from, configured };
      }
      return undefined;
    },
  } as never;
  return new EmailService(fakeConfig);
}

describe("EmailService", () => {
  beforeEach(() => {
    resetMockResend();
  });

  it("reports itself as unconfigured when RESEND_API_KEY/EMAIL_FROM are unset", () => {
    const service = makeEmailService({});
    expect(service.configured).toBe(false);
  });

  it("reports itself as configured when both are set", () => {
    const service = makeEmailService({ apiKey: "re_test_key", from: "FORGE <noreply@forge.local>" });
    expect(service.configured).toBe(true);
  });

  it("does not attempt to send and reports not_configured when unconfigured", async () => {
    const service = makeEmailService({});
    const result = await service.send({
      to: "someone@example.com",
      subject: "Test subject",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(result).toEqual({ sent: false, reason: "not_configured" });
    expect(mockSentEmails).toHaveLength(0);
  });

  it("sends via Resend and reports sent:true on success", async () => {
    const service = makeEmailService({ apiKey: "re_test_key", from: "FORGE <noreply@forge.local>" });
    const result = await service.send({
      to: "recipient@example.com",
      subject: "Test subject",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(result).toEqual({ sent: true });
    expect(mockSentEmails).toHaveLength(1);
    expect(mockSentEmails[0]).toMatchObject({
      from: "FORGE <noreply@forge.local>",
      to: "recipient@example.com",
      subject: "Test subject",
    });
  });

  it("reports provider_error and never throws when Resend returns an API error", async () => {
    queueMockResendError({ message: "Invalid from address", name: "invalid_from_address" });
    const service = makeEmailService({ apiKey: "re_test_key", from: "FORGE <noreply@forge.local>" });
    const result = await service.send({
      to: "recipient@example.com",
      subject: "Test subject",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(result).toEqual({ sent: false, reason: "provider_error" });
  });

  it("reports provider_error and never throws when the network call itself throws", async () => {
    queueMockResendThrow(new Error("fetch failed: ECONNRESET"));
    const service = makeEmailService({ apiKey: "re_test_key", from: "FORGE <noreply@forge.local>" });
    const result = await service.send({
      to: "recipient@example.com",
      subject: "Test subject",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(result).toEqual({ sent: false, reason: "provider_error" });
  });

  it("never includes the Resend API key in a send result, success or failure", async () => {
    const apiKey = "re_super_secret_key_value_do_not_leak";
    const service = makeEmailService({ apiKey, from: "FORGE <noreply@forge.local>" });

    const success = await service.send({
      to: "recipient@example.com",
      subject: "Test subject",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(JSON.stringify(success)).not.toContain(apiKey);

    queueMockResendError({ message: "boom", name: "internal_server_error" });
    const failure = await service.send({
      to: "recipient@example.com",
      subject: "Test subject",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(JSON.stringify(failure)).not.toContain(apiKey);
  });
});
