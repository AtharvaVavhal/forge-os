import { Body, Controller, Headers, HttpCode, Post, Req, UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Public } from "../../auth/decorators/public.decorator";
import { requireRawBody, type RequestWithRawBody } from "../../../common/http/raw-body";
import { OrganizationContextService } from "../../shared/organization-context.service";
import { RazorpayService } from "../services/razorpay.service";

/**
 * `POST /api/v1/webhooks/razorpay` — Document 5 §2.1/§9.2, Document 6
 * §12. `@Public()` (HMAC is the auth mechanism, not a session — no
 * cookies, no CSRF token exists for a server-to-server webhook call);
 * still passes through the global `ThrottlerGuard` (Document 6 §12:
 * "Protect availability" — no bespoke numeric limit invented, matching
 * every other "NOT CURRENTLY DEFINED" rate limit in this codebase).
 */
@Controller("webhooks")
export class WebhooksController {
  constructor(
    private readonly razorpay: RazorpayService,
    private readonly organizationContext: OrganizationContextService
  ) {}

  @Public()
  @HttpCode(200)
  @Post("razorpay")
  async handle(
    @Req() request: RequestWithRawBody,
    @Headers("x-razorpay-signature") signature: string | undefined,
    @Headers("x-razorpay-event-id") eventIdHeader: string | undefined,
    @Body() payload: Record<string, unknown>
  ): Promise<{ received: true }> {
    // Step 1 (mandatory order, Document 5 §9.2): verify before any DB write.
    const rawBody = requireRawBody(request);
    if (!this.razorpay.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException({ code: "INVALID_WEBHOOK_SIGNATURE", message: "Invalid webhook signature." });
    }

    // Step 2: resolve organization_id — single-org V1, same resolver AuthService uses.
    const organizationId = await this.organizationContext.resolveSingleOrganizationId();

    const eventType = typeof payload.event === "string" ? payload.event : "unknown";
    // Razorpay sends a distinct `X-Razorpay-Event-Id` per delivery — the
    // idempotency key `WebhookEvent.external_event_id` dedupes on (see
    // docs/IMPLEMENTATION-PHASE-B5.md for why this header, not a body
    // field, was chosen). Falls back to a raw-body hash only if the
    // header is ever absent, so a delivery can never bypass dedup entirely.
    const eventId = eventIdHeader ?? hashRawBody(rawBody);

    await this.razorpay.handleWebhook(organizationId, eventId, eventType, payload);

    return { received: true };
  }
}

/** Only reached if Razorpay ever omits its own event-id header — a deterministic fallback so the *same* delivery still dedupes. */
function hashRawBody(rawBody: Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
