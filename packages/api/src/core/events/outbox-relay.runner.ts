import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { ConfigService } from '../config/config.service';

import { OutboxRelay } from './outbox-relay.service';

// Drives the outbox relay on an interval inside the API process — the only
// process where the in-process EventBus has consumers registered, so the
// documented "worker invokes the relay" intent would otherwise need an internal
// endpoint. Safe to run repeatedly: consumers dedupe on eventId, and the
// overlap guard keeps ticks from stacking when one runs long.
//
// OUTBOX_RELAY_INTERVAL_MS=0 disables it; tests are disabled via NODE_ENV=test.
@Injectable()
export class OutboxRelayRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayRunner.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly relay: OutboxRelay,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.config.get('OUTBOX_RELAY_INTERVAL_MS');
    if (intervalMs <= 0 || this.config.isTest) {
      this.logger.log('Outbox relay disabled');
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    // Never hold the process open just for the relay.
    this.timer.unref();
    this.logger.log(`Outbox relay every ${intervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const processed = await this.relay.relayPendingBatch();
      if (processed > 0) {
        this.logger.log(`Delivered ${processed} outbox message(s)`);
      }
    } catch (error) {
      this.logger.error(
        'Outbox relay tick failed',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
