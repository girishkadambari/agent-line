import type { Agent } from '@prisma/client';

export function serializeAgent(agent: Agent) {
  return {
    id: agent.id,
    workspaceId: agent.workspaceId,
    projectId: agent.projectId,
    name: agent.name,
    description: agent.description,
    mode: agent.mode,
    status: agent.status,
    systemPrompt: agent.systemPrompt,
    voice: agent.voice,
    language: agent.language ?? 'en-IN',
    beginMessage: agent.beginMessage,
    transferNumber: agent.transferNumber,
    voicemailMessage: agent.voicemailMessage,
    webhookUrl: agent.webhookUrl,
    metadata: agent.metadata,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}
