import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { SendEmailInput, SendEmailResult } from './email.types';

@Injectable()
export class BrevoEmailProvider {
  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return this.hasConfig('BREVO_API_KEY') && this.hasConfig('BREVO_FROM_EMAIL');
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    const senderEmail = this.config.get<string>('BREVO_FROM_EMAIL');
    const senderName = this.config.get<string>('BREVO_FROM_NAME') || 'AgentLine';

    if (!apiKey || !senderEmail) {
      throw new Error('Brevo email provider is not configured.');
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: {
          email: senderEmail,
          name: senderName,
        },
        to: [{ email: input.to }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
      }),
    });

    const body = await this.parseResponseBody(response);
    if (!response.ok) {
      throw new BrevoEmailError(response.status, body);
    }

    return {
      providerMessageId: typeof body.messageId === 'string' ? body.messageId : undefined,
    };
  }

  private hasConfig(key: string) {
    const value = this.config.get<string>(key);
    return Boolean(value && value.trim().length > 0);
  }

  private async parseResponseBody(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { message: text };
    }
  }
}

export class BrevoEmailError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super('Brevo email request failed.');
  }
}
