import type { ConfigService } from '@nestjs/config';

import { WebhookRetryWorker } from './webhook-retry.worker';
import type { WebhooksService } from './webhooks.service';

function createWorker(
  config: Record<string, string | undefined>,
  webhooks?: Partial<WebhooksService>,
) {
  const configService = {
    get: jest.fn((key: string) => config[key]),
  } as unknown as ConfigService;
  const webhooksService = {
    processDueDeliveriesForWorker: jest.fn().mockResolvedValue([]),
    ...webhooks,
  } as unknown as WebhooksService;

  return {
    worker: new WebhookRetryWorker(configService, webhooksService),
    configService,
    webhooksService,
  };
}

describe('WebhookRetryWorker', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does not run in test unless explicitly enabled', () => {
    const { worker, webhooksService } = createWorker({ APP_ENV: 'test' });

    worker.onModuleInit();

    expect(webhooksService.processDueDeliveriesForWorker).not.toHaveBeenCalled();
  });

  it('processes due deliveries when enabled', async () => {
    jest.useFakeTimers();
    const { worker, webhooksService } = createWorker({
      APP_ENV: 'local',
      WEBHOOK_RETRY_WORKER_ENABLED: 'true',
      WEBHOOK_RETRY_WORKER_INTERVAL_MS: '5000',
      WEBHOOK_RETRY_WORKER_BATCH_SIZE: '7',
    });

    worker.onModuleInit();
    await Promise.resolve();

    expect(webhooksService.processDueDeliveriesForWorker).toHaveBeenCalledWith(7);

    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(webhooksService.processDueDeliveriesForWorker).toHaveBeenCalledTimes(2);
    worker.onModuleDestroy();
  });

  it('does not overlap slow retry passes', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    const slowRun = new Promise<[]>((resolve) => {
      release = () => resolve([]);
    });
    const { worker, webhooksService } = createWorker(
      {
        APP_ENV: 'local',
        WEBHOOK_RETRY_WORKER_ENABLED: 'true',
        WEBHOOK_RETRY_WORKER_INTERVAL_MS: '5000',
      },
      {
        processDueDeliveriesForWorker: jest.fn().mockReturnValue(slowRun),
      },
    );

    worker.onModuleInit();
    await Promise.resolve();
    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(webhooksService.processDueDeliveriesForWorker).toHaveBeenCalledTimes(1);

    release();
    await slowRun;
    worker.onModuleDestroy();
  });
});
