import type { Call, TranscriptTurn } from '@prisma/client';

export function serializeCall(call: Call) {
  return {
    id: call.id,
    workspaceId: call.workspaceId,
    projectId: call.projectId,
    agentId: call.agentId,
    conversationId: call.conversationId,
    phoneNumberId: call.phoneNumberId,
    contactId: call.contactId,
    direction: call.direction,
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    status: call.status,
    durationSeconds: call.durationSeconds,
    summary: call.summary,
    outcome: call.outcome,
    recordingId: call.recordingId,
    provider: call.provider,
    providerCallId: call.providerCallId,
    providerStatus: call.providerStatus,
    providerErrorCode: call.providerErrorCode,
    providerErrorText: call.providerErrorText,
    startedAt: call.startedAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    createdAt: call.createdAt.toISOString(),
    updatedAt: call.updatedAt.toISOString(),
  };
}

export function serializeTranscriptTurn(turn: TranscriptTurn) {
  return {
    id: turn.id,
    workspaceId: turn.workspaceId,
    projectId: turn.projectId,
    callId: turn.callId,
    speaker: turn.speaker,
    text: turn.text,
    startedAtMs: turn.startedAtMs,
    endedAtMs: turn.endedAtMs,
    confidence: turn.confidence,
    createdAt: turn.createdAt.toISOString(),
  };
}
