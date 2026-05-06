import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiException } from '../../common/errors/api.exception';

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  customer: string | null;
}

export interface StripePortalSession {
  id: string;
  url: string;
  customer: string;
}

export interface StripeCustomer {
  id: string;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

@Injectable()
export class StripeClientService {
  constructor(private readonly config: ConfigService) {}

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
              name: 'AgentLine prepaid credits',
            },
          },
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

    return JSON.parse(rawBody.toString('utf8')) as StripeWebhookEvent;
  }

  private async request<T>(method: 'POST', path: string, body: Record<string, unknown>): Promise<T> {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');

    if (!secretKey) {
      throw new ApiException('provider_error', 'Stripe secret key is not configured.', 500);
    }

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
}
