import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { WebhooksService } from './webhooks.service';

@Injectable()
export class WebhookRetryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookRetryWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly webhooks: WebhooksService,
  ) {}

  onModuleInit() {
    if (!this.isEnabled()) {
      this.logger.log('Webhook retry worker disabled.');
      return;
    }

    const intervalMs = this.getPositiveInt('WEBHOOK_RETRY_WORKER_INTERVAL_MS', 30_000, 5_000);
    this.timer = setInterval(() => void this.processDueDeliveries(), intervalMs);
    this.timer.unref?.();

    void this.processDueDeliveries();
    this.logger.log(`Webhook retry worker enabled. intervalMs=${intervalMs}`);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private isEnabled() {
    const configured = this.config.get<string>('WEBHOOK_RETRY_WORKER_ENABLED');
    if (configured) {
      return ['1', 'true', 'yes'].includes(configured.toLowerCase());
    }

    return this.config.get<string>('APP_ENV') !== 'test';
  }

  private async processDueDeliveries() {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const limit = this.getPositiveInt('WEBHOOK_RETRY_WORKER_BATCH_SIZE', 25, 1);
      const processed = await this.webhooks.processDueDeliveriesForWorker(limit);
      if (processed.length > 0) {
        this.logger.log(`Processed ${processed.length} due webhook delivery retries.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown webhook retry error.';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(message, stack);
    } finally {
      this.running = false;
    }
  }

  private getPositiveInt(name: string, fallback: number, minimum: number) {
    const raw = this.config.get<string>(name);
    const parsed = raw ? Number.parseInt(raw, 10) : fallback;
    if (Number.isNaN(parsed) || parsed < minimum) {
      return fallback;
    }

    return parsed;
  }
}
