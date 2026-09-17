import type { INestApplication } from "@nestjs/common";
import { DomainEventOutboxService } from "../../src/modules/outbox/domain-event-outbox.service";

export const B8_TEST_PREFIX = "phase-b8-e2e-";

/** Drive the outbox deterministically in tests (worker is disabled under NODE_ENV=test). */
export async function drainOutbox(
  app: INestApplication,
  rounds = 3
): Promise<{ attempted: number; processed: number; failed: number }> {
  const outbox = app.get(DomainEventOutboxService);
  const totals = { attempted: 0, processed: 0, failed: 0 };
  for (let i = 0; i < rounds; i++) {
    const result = await outbox.processPending(50);
    totals.attempted += result.attempted;
    totals.processed += result.processed;
    totals.failed += result.failed;
    if (result.attempted === 0) break;
  }
  return totals;
}

export async function processOutboxEvent(app: INestApplication, eventId: string) {
  return app.get(DomainEventOutboxService).processOne(eventId);
}
