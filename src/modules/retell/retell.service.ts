import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiException } from '../../common/errors/api.exception';
import type { BusinessService } from '../business/business-profile.service';
import {
  buildBeginMessage,
  buildSalonAgentPrompt,
} from '../business/salon-agent-prompt.builder';

interface BusinessProfileForAgent {
  businessName: string;
  ownerName: string;
  businessType: string;
  openTime: string;
  closeTime: string;
  languages: string[];
  services: unknown;
  address?: string | null;
  googleMapsUrl?: string | null;
  ownerPhone: string;
}

export interface RetellCreatedAgent {
  agentId: string;
  llmId: string;
}

export interface RetellCreateCallInput {
  fromNumber: string;
  toNumber: string;
  agentId: string;
  metadata?: Record<string, string>;
}

export interface RetellCreatedCall {
  callId: string;
  status: string;
}

@Injectable()
export class RetellService {
  private readonly baseUrl = 'https://api.retellai.com';

  constructor(private readonly config: ConfigService) {}

  async createAgentForBusiness(
    profile: BusinessProfileForAgent & { id: string },
    webhookUrl: string,
  ): Promise<RetellCreatedAgent> {
    const prompt = buildSalonAgentPrompt(profile);
    const beginMessage = buildBeginMessage(profile);
    const services = profile.services as BusinessService[];
    const serviceNames = services.map((s) => s.name).join(', ');

    const llmId = await this.createLlm(prompt, serviceNames, webhookUrl);

    const result = await this.request<{ agent_id: string }>('POST', '/create-agent', {
      agent_name: `${profile.businessName} AI Receptionist`,
      response_engine: { type: 'retell-llm', llm_id: llmId },
      language: this.resolveLanguage(profile.languages),
      begin_message: beginMessage,
      voice_id: '11labs-Samad',
      metadata: { businessProfileId: profile.id },
    });

    return { agentId: result.agent_id, llmId };
  }

  async updateAgentPrompt(llmId: string, profile: BusinessProfileForAgent): Promise<void> {
    const prompt = buildSalonAgentPrompt(profile);
    await this.request('PATCH', `/update-retell-llm/${llmId}`, { general_prompt: prompt });
  }

  async updateAgentFull(llmId: string, profile: BusinessProfileForAgent & { id: string }, webhookUrl: string): Promise<void> {
    const prompt = buildSalonAgentPrompt(profile);
    const services = profile.services as BusinessService[];
    const serviceNames = services.map((s) => s.name).join(', ');
    const body = await this.buildLlmBody(prompt, serviceNames, webhookUrl);
    await this.request('PATCH', `/update-retell-llm/${llmId}`, body);
  }

  private async buildLlmBody(generalPrompt: string, serviceNames: string, webhookUrl: string) {
    // Same as createLlm body — extracted for reuse in updates
    const body = { general_prompt: generalPrompt, general_tools: [] as unknown[] };
    const llmBody = { general_prompt: generalPrompt, general_tools: body.general_tools };

    // Temporarily call createLlm to get the tools shape, then copy it
    // Instead, we inline the tool definitions here
    const toolUrl = `${webhookUrl}/webhooks/retell/function-call`;
    llmBody.general_tools = [
      {
        type: 'custom', name: 'check_availability',
        description: 'Check if a time slot is available. Call this BEFORE offering any time.',
        speak_during_execution: true, speak_after_execution: false,
        url: toolUrl, execution_message_description: 'Checking availability...',
        parameters: {
          type: 'object',
          properties: {
            time: { type: 'string', description: 'Time in HH:MM 24h format' },
            date: { type: 'string', description: 'Date YYYY-MM-DD. Omit for today.' },
          },
          required: ['time'],
        },
      },
      {
        type: 'custom', name: 'create_booking',
        description: 'Create appointment. Call after check_availability confirmed available=true.',
        speak_during_execution: true, speak_after_execution: true,
        url: toolUrl, execution_message_description: 'Booking your appointment...',
        parameters: {
          type: 'object',
          properties: {
            customer_name: { type: 'string', description: 'Full name' },
            service: { type: 'string', description: `Service: ${serviceNames}` },
            time: { type: 'string', description: 'Time HH:MM' },
            date: { type: 'string', description: 'Date YYYY-MM-DD. Omit for today.' },
            customer_phone: { type: 'string', description: 'Phone with country code' },
          },
          required: ['customer_name', 'service', 'time'],
        },
      },
      {
        type: 'custom', name: 'get_available_slots',
        description: 'Get open time slots today. Use when customer asks "what times are free?"',
        speak_during_execution: true, speak_after_execution: false,
        url: toolUrl, execution_message_description: 'Checking open slots...',
        parameters: { type: 'object', properties: { date: { type: 'string', description: 'Date YYYY-MM-DD. Omit for today.' } }, required: [] },
      },
      {
        type: 'custom', name: 'cancel_booking',
        description: 'Cancel a customer appointment. Confirm with customer before calling.',
        speak_during_execution: true, speak_after_execution: true,
        url: toolUrl, execution_message_description: 'Cancelling appointment...',
        parameters: {
          type: 'object',
          properties: {
            customer_phone: { type: 'string', description: 'Phone with country code' },
            time: { type: 'string', description: 'Appointment time HH:MM (optional)' },
          },
          required: ['customer_phone'],
        },
      },
      {
        type: 'custom', name: 'add_to_waitlist',
        description: 'Add to waitlist when fully booked.',
        speak_during_execution: false, speak_after_execution: true,
        url: toolUrl, execution_message_description: 'Adding to waitlist...',
        parameters: {
          type: 'object',
          properties: {
            customer_name: { type: 'string', description: 'Full name' },
            service: { type: 'string', description: 'Service requested' },
            customer_phone: { type: 'string', description: 'Phone number' },
          },
          required: ['customer_name', 'customer_phone'],
        },
      },
    ];
    return llmBody;
  }

  async createPhoneCall(input: RetellCreateCallInput): Promise<RetellCreatedCall> {
    const body: Record<string, unknown> = {
      from_number: input.fromNumber,
      to_number: input.toNumber,
      agent_id: input.agentId,
    };
    if (input.metadata) {
      body.metadata = input.metadata;
    }

    const result = await this.request<{ call_id: string; call_status: string }>(
      'POST',
      '/create-phone-call',
      body,
    );

    return { callId: result.call_id, status: result.call_status };
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const secret = this.config.get<string>('RETELL_WEBHOOK_SECRET');
    if (!secret) return true;

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return expected === signature;
  }

  private async createLlm(
    generalPrompt: string,
    serviceNames: string,
    webhookUrl: string,
  ): Promise<string> {
    const body = {
      general_prompt: generalPrompt,
      general_tools: [
        {
          type: 'custom',
          name: 'check_availability',
          description:
            'Check if a time slot is available. Call this BEFORE offering any time to the customer.',
          speak_during_execution: true,
          speak_after_execution: false,
          url: `${webhookUrl}/webhooks/retell/function-call`,
          execution_message_description: 'Let me check availability for you...',
          parameters: {
            type: 'object',
            properties: {
              time: {
                type: 'string',
                description: 'Requested time in HH:MM 24-hour format (e.g. 14:30)',
              },
              date: {
                type: 'string',
                description: 'Date in YYYY-MM-DD format. Omit for today.',
              },
            },
            required: ['time'],
          },
        },
        {
          type: 'custom',
          name: 'create_booking',
          description:
            'Create a confirmed appointment. Only call this AFTER check_availability returned available=true and you have the customer name.',
          speak_during_execution: true,
          speak_after_execution: true,
          url: `${webhookUrl}/webhooks/retell/function-call`,
          execution_message_description: 'Booking your appointment now...',
          parameters: {
            type: 'object',
            properties: {
              customer_name: {
                type: 'string',
                description: 'Full name of the customer',
              },
              service: {
                type: 'string',
                description: `Service to book. Available: ${serviceNames}`,
              },
              time: {
                type: 'string',
                description: 'Confirmed appointment time in HH:MM format',
              },
              date: {
                type: 'string',
                description: 'Date in YYYY-MM-DD format. Omit for today.',
              },
              customer_phone: {
                type: 'string',
                description:
                  'Customer phone number if provided. Include country code (e.g. +919876543210)',
              },
            },
            required: ['customer_name', 'service', 'time'],
          },
        },
        {
          type: 'custom',
          name: 'add_to_waitlist',
          description: 'Add customer to waitlist when no slots are available today.',
          speak_during_execution: false,
          speak_after_execution: true,
          url: `${webhookUrl}/webhooks/retell/function-call`,
          execution_message_description: 'Adding you to the waitlist...',
          parameters: {
            type: 'object',
            properties: {
              customer_name: { type: 'string', description: 'Full name of the customer' },
              service: { type: 'string', description: 'Service they are waiting for' },
              customer_phone: { type: 'string', description: 'Customer phone number' },
            },
            required: ['customer_name', 'customer_phone'],
          },
        },
        {
          type: 'custom',
          name: 'get_available_slots',
          description: 'Get list of available time slots today. Call this when customer asks "what times are free?" or "what slots do you have?"',
          speak_during_execution: true,
          speak_after_execution: false,
          url: `${webhookUrl}/webhooks/retell/function-call`,
          execution_message_description: 'Let me check what slots are open...',
          parameters: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'Date in YYYY-MM-DD format. Omit for today.' },
            },
            required: [],
          },
        },
        {
          type: 'custom',
          name: 'cancel_booking',
          description: 'Cancel an existing appointment for a customer. Always confirm with customer before calling this.',
          speak_during_execution: true,
          speak_after_execution: true,
          url: `${webhookUrl}/webhooks/retell/function-call`,
          execution_message_description: 'Cancelling your appointment...',
          parameters: {
            type: 'object',
            properties: {
              customer_phone: { type: 'string', description: 'Customer phone number with country code' },
              time: { type: 'string', description: 'Appointment time in HH:MM format (optional — cancels most recent if omitted)' },
            },
            required: ['customer_phone'],
          },
        },
      ],
    };

    const result = await this.request<{ llm_id: string }>('POST', '/create-retell-llm', body);
    return result.llm_id;
  }

  private resolveLanguage(languages: string[]): string {
    // Retell supports "multi" for multilingual agents
    if (languages.length > 1) return 'multi';
    const lang = languages[0]?.toLowerCase();
    const map: Record<string, string> = {
      english: 'en-US',
      hindi: 'hi-IN',
      kannada: 'kn-IN',
      telugu: 'te-IN',
      tamil: 'ta-IN',
      punjabi: 'pa-IN',
    };
    return map[lang ?? ''] ?? 'en-US';
  }

  private async request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
    const apiKey = this.config.get<string>('RETELL_API_KEY');
    if (!apiKey) {
      throw new ApiException('provider_error', 'RETELL_API_KEY is not configured.', 500);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new ApiException('provider_error', 'Retell API request failed.', 502, {
        status: response.status,
        path,
        error: payload.error ?? payload.message,
      });
    }

    return payload as T;
  }
}
