import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiException } from '../../common/errors/api.exception';

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  customer: string | null;
  subscription?: string | null;
}

export interface StripePortalSession {
  id: string;
  url: string;
  customer: string;
}

export interface StripeCustomer {
  id: string;
}

export interface StripeMeterEvent {
  identifier: string;
  event_name: string;
  created?: number;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  livemode?: boolean;
  data: {
    object: Record<string, unknown>;
  };
}

export type StripeMode = 'test' | 'live';

@Injectable()
export class StripeClientService {
  constructor(private readonly config: ConfigService) {}

  getMode(): StripeMode {
    return this.config.get<string>('STRIPE_MODE', 'test') === 'live' ? 'live' : 'test';
  }

  getConfigurationStatus() {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY') ?? '';
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
    const mode = this.getMode();

    return {
      mode,
      secretKeyConfigured: secretKey.length > 0,
      secretKeyMatchesMode: this.secretKeyMatchesMode(secretKey, mode),
      webhookSecretConfigured: webhookSecret.length > 0,
      webhookToleranceSeconds: this.config.get<number>('STRIPE_WEBHOOK_TOLERANCE_SECONDS', 300),
      usageMeterEventNameConfigured: this.isUsageMeteringConfigured(),
    };
  }

  isUsageMeteringConfigured() {
    const eventName = this.config.get<string>('STRIPE_USAGE_METER_EVENT_NAME') ?? '';
    return eventName.trim().length > 0;
  }

  async createCustomer(input: { workspaceId: string; name: string }) {
    return this.request<StripeCustomer>('POST', '/v1/customers', {
      name: input.name,
      metadata: {
        workspaceId: input.workspaceId,
      },
    });
  }

  async createCheckoutSession(input: {
    workspaceId: string;
    customerId: string;
    amountCents: number;
    successUrl: string;
    cancelUrl: string;
  }) {
    return this.request<StripeCheckoutSession>('POST', '/v1/checkout/sessions', {
      mode: 'payment',
      customer: input.customerId,
      client_reference_id: input.workspaceId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: {
        workspaceId: input.workspaceId,
        amountCents: String(input.amountCents),
        purpose: 'prepaid_credits',
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: input.amountCents,
            product_data: {
              name: this.config.get<string>(
                'STRIPE_CREDIT_PRODUCT_NAME',
                'AgentLine prepaid credits',
              ),
            },
          },
        },
      ],
    });
  }

  async createSubscriptionCheckoutSession(input: {
    workspaceId: string;
    customerId: string;
    planKey: string;
    priceId: string;
    trialDays: number;
    successUrl: string;
    cancelUrl: string;
  }) {
    return this.request<StripeCheckoutSession>('POST', '/v1/checkout/sessions', {
      mode: 'subscription',
      customer: input.customerId,
      client_reference_id: input.workspaceId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      subscription_data: {
        trial_period_days: input.trialDays,
        metadata: {
          workspaceId: input.workspaceId,
          planKey: input.planKey,
          billingMode: 'subscription_usage',
        },
      },
      metadata: {
        workspaceId: input.workspaceId,
        planKey: input.planKey,
        purpose: 'subscription',
      },
      line_items: [
        {
          quantity: 1,
          price: input.priceId,
        },
      ],
    });
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }) {
    return this.request<StripePortalSession>('POST', '/v1/billing_portal/sessions', {
      customer: input.customerId,
      return_url: input.returnUrl,
    });
  }

  async createUsageMeterEvent(input: {
    identifier: string;
    customerId: string;
    value: number;
    usageEventId: string;
    workspaceId: string;
    projectId: string;
    resourceType: string;
    resourceId: string;
    channel: string;
    timestamp: Date;
  }) {
    const eventName = this.config.get<string>('STRIPE_USAGE_METER_EVENT_NAME');
    if (!eventName) {
      throw new ApiException(
        'provider_error',
        'Stripe usage meter event name is not configured.',
        500,
      );
    }

    return this.request<StripeMeterEvent>('POST', '/v1/billing/meter_events', {
      event_name: eventName,
      identifier: input.identifier,
      timestamp: Math.floor(input.timestamp.getTime() / 1000),
      payload: {
        stripe_customer_id: input.customerId,
        value: input.value,
        usage_event_id: input.usageEventId,
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        resource_type: input.resourceType,
        resource_id: input.resourceId,
        channel: input.channel,
      },
    });
  }

  constructWebhookEvent(rawBody: Buffer, signature: string | undefined) {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret) {
      throw new ApiException('provider_error', 'Stripe webhook secret is not configured.', 500);
    }

    if (!signature) {
      throw new ApiException('unauthorized', 'Missing Stripe signature.', 401);
    }

    const timestamp = this.extractSignaturePart(signature, 't');
    const expectedSignature = this.extractSignaturePart(signature, 'v1');

    if (!timestamp || !expectedSignature) {
      throw new ApiException('unauthorized', 'Invalid Stripe signature header.', 401);
    }

    const parsedTimestamp = Number.parseInt(timestamp, 10);
    const toleranceSeconds = this.config.get<number>('STRIPE_WEBHOOK_TOLERANCE_SECONDS', 300);
    const currentTimestamp = Math.floor(Date.now() / 1000);

    if (
      Number.isNaN(parsedTimestamp) ||
      Math.abs(currentTimestamp - parsedTimestamp) > toleranceSeconds
    ) {
      throw new ApiException(
        'unauthorized',
        'Stripe signature timestamp is outside tolerance.',
        401,
      );
    }

    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
    const computed = createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');
    const computedBuffer = Buffer.from(computed, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (
      computedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(computedBuffer, expectedBuffer)
    ) {
      throw new ApiException('unauthorized', 'Stripe signature verification failed.', 401);
    }

    const event = JSON.parse(rawBody.toString('utf8')) as StripeWebhookEvent;
    this.assertWebhookMode(event);

    return event;
  }

  private async request<T>(
    method: 'POST',
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');

    if (!secretKey) {
      throw new ApiException('provider_error', 'Stripe secret key is not configured.', 500);
    }
    this.assertSecretKeyMode(secretKey);

    const response = await fetch(`https://api.stripe.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: this.encodeForm(body),
    });

    const payload = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      throw new ApiException('provider_error', 'Stripe API request failed.', 502, {
        status: response.status,
        error: payload.error,
      });
    }

    return payload as T;
  }

  private encodeForm(value: Record<string, unknown>) {
    const params = new URLSearchParams();
    this.appendFormValue(params, '', value);
    return params;
  }

  private appendFormValue(params: URLSearchParams, key: string, value: unknown) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => this.appendFormValue(params, `${key}[${index}]`, item));
      return;
    }

    if (value && typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value)) {
        const nextKey = key ? `${key}[${childKey}]` : childKey;
        this.appendFormValue(params, nextKey, childValue);
      }
      return;
    }

    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }

  private extractSignaturePart(signature: string, key: string) {
    return signature
      .split(',')
      .map((part) => part.split('='))
      .find(([partKey]) => partKey === key)?.[1];
  }

  private assertSecretKeyMode(secretKey: string) {
    const mode = this.getMode();

    if (!this.secretKeyMatchesMode(secretKey, mode)) {
      throw new ApiException(
        'provider_error',
        `Stripe secret key does not match STRIPE_MODE=${mode}.`,
        500,
      );
    }
  }

  private assertWebhookMode(event: StripeWebhookEvent) {
    if (typeof event.livemode !== 'boolean') {
      return;
    }

    const mode = this.getMode();
    const expectedLiveMode = mode === 'live';

    if (event.livemode !== expectedLiveMode) {
      throw new ApiException(
        'unauthorized',
        `Stripe webhook event mode does not match STRIPE_MODE=${mode}.`,
        401,
      );
    }
  }

  private secretKeyMatchesMode(secretKey: string, mode: StripeMode) {
    if (!secretKey) {
      return false;
    }

    return mode === 'live'
      ? secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_')
      : secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_');
  }
}
