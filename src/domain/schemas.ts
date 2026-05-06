import { z } from 'zod';

export const agentModeSchema = z.enum(['hosted', 'webhook', 'web']);
export const agentStatusSchema = z.enum(['active', 'disabled']);
export const phoneNumberStatusSchema = z.enum([
  'available',
  'provisioning',
  'active',
  'releasing',
  'released',
  'failed',
]);
export const directionSchema = z.enum(['inbound', 'outbound']);
export const messageStatusSchema = z.enum([
  'queued',
  'sending',
  'sent',
  'delivered',
  'failed',
  'received',
]);
export const callStatusSchema = z.enum([
  'queued',
  'ringing',
  'in_progress',
  'completed',
  'failed',
  'busy',
  'no_answer',
  'canceled',
  'transferred',
]);
export const webhookDeliveryStatusSchema = z.enum([
  'pending',
  'succeeded',
  'failed',
  'retrying',
  'exhausted',
]);

export const createAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  mode: agentModeSchema.default('webhook'),
  systemPrompt: z.string().optional(),
  voice: z.string().optional(),
  beginMessage: z.string().optional(),
  transferNumber: z.string().optional(),
  voicemailMessage: z.string().optional(),
  webhookUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const updateAgentSchema = createAgentSchema.partial();

export const createNumberSchema = z.object({
  agentId: z.string().optional(),
  country: z.string().default('US'),
  areaCode: z.string().optional(),
  capabilities: z.array(z.enum(['sms', 'mms', 'voice'])).default(['sms', 'voice']),
});

export const updateNumberSchema = z.object({
  agentId: z.string().nullable().optional(),
});

export const sendMessageSchema = z.object({
  agentId: z.string().min(1),
  to: z.string().min(7),
  body: z.string().min(1),
});

export const simulateInboundSmsSchema = z.object({
  agentId: z.string().min(1),
  from: z.string().min(7),
  body: z.string().min(1),
});

export const updateConversationSchema = z.object({
  status: z.enum(['active', 'archived']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const createCallSchema = z.object({
  agentId: z.string().min(1),
  to: z.string().min(7),
});

export const createWebCallSchema = z.object({
  agentId: z.string().min(1),
});

export const transferCallSchema = z.object({
  to: z.string().min(7),
});

export const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
});

export const workspaceRoleSchema = z.enum(['owner', 'admin', 'developer', 'billing', 'viewer', 'member']);

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).optional(),
});

export const updateMemberSchema = z.object({
  role: workspaceRoleSchema.optional(),
  status: z.enum(['active', 'suspended', 'removed']).optional(),
});

export const createInviteSchema = z.object({
  email: z.string().email(),
  role: workspaceRoleSchema.default('member'),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type CreateNumberInput = z.infer<typeof createNumberSchema>;
export type UpdateNumberInput = z.infer<typeof updateNumberSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type SimulateInboundSmsInput = z.infer<typeof simulateInboundSmsSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type CreateCallInput = z.infer<typeof createCallSchema>;
export type CreateWebCallInput = z.infer<typeof createWebCallSchema>;
export type TransferCallInput = z.infer<typeof transferCallSchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
