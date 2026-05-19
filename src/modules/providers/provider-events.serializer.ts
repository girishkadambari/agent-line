import type { Call, Message, ProviderRawEvent } from '@prisma/client';

type ProviderResource =
  | { type: 'message'; id: string; status: string; agentId: string | null }
  | { type: 'call'; id: string; status: string; agentId: string | null }
  | null;

export function serializeProviderEvent(event: ProviderRawEvent, resource: ProviderResource = null) {
  const payload = event.payload as Record<string, unknown>;
  const status = readPayloadString(payload, ['MessageStatus', 'SmsStatus', 'CallStatus', 'status']);
  const errorCode = readPayloadString(payload, ['ErrorCode', 'errorCode']);
  const errorText = readPayloadString(payload, [
    'ErrorMessage',
    'ErrorMessageText',
    'errorMessage',
  ]);

  return {
    id: event.id,
    workspaceId: event.workspaceId,
    projectId: event.projectId,
    provider: event.provider,
    eventType: event.eventType,
    providerEventId: event.providerEventId,
    status,
    errorCode,
    errorText,
    resource,
    receivedAt: event.createdAt.toISOString(),
    payload: event.payload,
  };
}

export function serializeProviderEventSummary(input: {
  total: number;
  byEventType: Record<string, number>;
  recentErrors: ReturnType<typeof serializeProviderEvent>[];
}) {
  return {
    total: input.total,
    byEventType: input.byEventType,
    recentErrors: input.recentErrors,
  };
}

export function providerResourceFromMessage(message: Message | null): ProviderResource {
  if (!message) {
    return null;
  }

  return {
    type: 'message',
    id: message.id,
    status: message.status,
    agentId: message.agentId,
  };
}

export function providerResourceFromCall(call: Call | null): ProviderResource {
  if (!call) {
    return null;
  }

  return {
    type: 'call',
    id: call.id,
    status: call.status,
    agentId: call.agentId,
  };
}

function readPayloadString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }

  return null;
}
