import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DomainEventOutboxService } from "./domain-event-outbox.service";

const POLL_INTERVAL_MS = 2_000;

/**
 * In-process outbox poller (Document 5 §14). Disabled under NODE_ENV=test
 * so E2E drives `DomainEventOutboxService.processPending()` deterministically.
 * Set DOMAIN_EVENT_WORKER_ENABLED=false to disable in any environment.
 */
@Injectable()
export class DomainEventWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DomainEventWorkerService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(private readonly outbox: DomainEventOutboxService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") {
      this.logger.log("DomainEvent worker disabled in test (call processPending explicitly)");
      return;
    }
    if (process.env.DOMAIN_EVENT_WORKER_ENABLED === "false") {
      this.logger.log("DomainEvent worker disabled via DOMAIN_EVENT_WORKER_ENABLED=false");
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
    // Unref so the timer doesn't keep the process alive alone in some runtimes;
    // Nest process stay-alive is owned by the HTTP server.
    if (typeof this.timer.unref === "function") {
      this.timer.unref();
    }
    this.logger.log(`DomainEvent worker started (interval ${POLL_INTERVAL_MS}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.outbox.processPending(25);
    } catch (error) {
      this.logger.error(
        "DomainEvent worker tick failed",
        error instanceof Error ? error.stack : String(error)
      );
    } finally {
      this.ticking = false;
    }
  }
}
