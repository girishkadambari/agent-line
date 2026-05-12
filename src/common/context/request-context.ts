import type { Request } from 'express';

export interface RequestContext {
  workspaceId: string;
  projectId: string;
  authType?: 'api_key' | 'session';
  apiKeyId?: string;
  userId?: string;
  sessionId?: string;
}

export interface RequestWithContext extends Request {
  agentLineContext?: RequestContext;
}
