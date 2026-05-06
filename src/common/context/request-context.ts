export interface RequestContext {
  workspaceId: string;
  projectId: string;
  apiKeyId: string;
}

export interface RequestWithContext extends Request {
  agentLineContext?: RequestContext;
}
