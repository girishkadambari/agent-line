# AgentLine Product Hierarchy

This document defines the ownership hierarchy for AgentLine. Use it when
building APIs, dashboard screens, permissions, billing, onboarding, and future
multi-workspace flows.

## Current Phase Decision

Phase 1 uses API-key authentication. An API key is scoped to exactly one
workspace and one project.

That means:

- The dashboard can show the current workspace.
- The dashboard can update the current workspace name.
- The dashboard can manage members and invites for the current workspace.
- The dashboard cannot create a new workspace yet.
- The dashboard cannot switch workspaces yet.

Workspace creation and switching require real user/session authentication. Do
not fake them in the UI.

## Hierarchy

```text
User
  -> WorkspaceMember
      -> Workspace
          -> Project
              -> APIKey
              -> Agent
                  -> PhoneNumber
                  -> Conversation
                      -> Message
                      -> Call
                          -> TranscriptTurn
                          -> Recording
              -> Contact
              -> WebhookEndpoint
                  -> WebhookDelivery
              -> UsageEvent
              -> ProviderRawEvent
              -> InternalEvent
          -> BillingBalance
          -> BillingAccount
          -> BillingTransaction
          -> WorkspaceInvite
          -> AuditEvent
```

## Object Ownership Rules

### User

A user is a global identity.

Rules:

- A user is not owned by a workspace.
- A user can belong to many workspaces through `WorkspaceMember`.
- Google SSO and future session auth should identify the user first, then load
  available workspaces.

### WorkspaceMember

A workspace member connects a user to a workspace.

Rules:

- A member has a role such as `owner`, `admin`, `developer`, `billing`,
  `viewer`, or `member`.
- A workspace must keep at least one active owner.
- Workspace switching in the future means selecting one of the current user's
  active memberships.

### Workspace

A workspace is the tenant and billing boundary.

Owns:

- projects
- members
- invites
- billing balance/accounts/transactions
- audit events
- all project-scoped product data

Rules:

- Billing is workspace-level.
- Team access is workspace-level.
- Audit logs are workspace-level.
- A workspace can contain multiple projects later, but Phase 1 uses one seeded
  default project.

### Project

A project is the environment/product-data boundary inside a workspace.

Owns:

- API keys
- agents
- phone numbers
- contacts
- conversations
- messages
- calls
- transcripts
- webhooks
- usage events
- provider raw events

Rules:

- Product APIs currently resolve `projectId` from the API key.
- Most operational records must include both `workspaceId` and `projectId`.
- Future project switching should happen inside the active workspace.

### APIKey

An API key grants access to one workspace/project pair.

Rules:

- API-key auth is a development and developer-API bridge.
- API keys are not a substitute for dashboard user sessions.
- Switching workspace/project by API key means signing in with a different API
  key, not choosing from a dropdown.

### Agent

An agent is the primary AI phone worker.

Owns or references:

- assigned phone numbers
- conversations
- messages
- calls
- usage events

Rules:

- An agent belongs to one project.
- Phone numbers are attached to an agent.
- Calls and messages are attributed to an agent.

### PhoneNumber

A phone number is a provider-backed or mock telephony resource.

Rules:

- It belongs to one project.
- It can be attached to one agent.
- It can support capabilities such as `sms` and `voice`.
- Real provider IDs must remain secondary fields, not public identity.

### Contact

A contact represents the external person or phone endpoint.

Rules:

- Contacts are unique by `projectId + phoneNumber`.
- Conversations, messages, and calls link back to a contact.

### Conversation

A conversation is the thread between an agent and a contact.

Rules:

- Conversation scope is project-level.
- SMS conversations and voice call history can meet at this object.
- Messages and calls should update `lastActivityAt`.

### WebhookEndpoint

A webhook endpoint belongs to a project.

Rules:

- It subscribes to AgentLine events.
- Deliveries are signed, retried, and logged.
- Delivery attempts belong to the same workspace/project as the endpoint.

### Usage And Billing

Usage is project-scoped. Billing balance is workspace-scoped.

Rules:

- Every billable action should write a `UsageEvent`.
- Debits are applied to the workspace balance.
- Billing transactions and Stripe accounts belong to the workspace.

## Dashboard Navigation Model

Phase 1 dashboard:

- Shows one current workspace from the API key.
- Shows one implicit current project from the API key.
- Does not expose project switching.
- Does not expose workspace switching.
- Workspace settings manage the current workspace only.

Future session-auth dashboard:

- User signs in.
- Backend returns available workspace memberships.
- User selects active workspace.
- User selects active project within that workspace.
- API requests carry session identity plus active workspace/project context.

## Required Future APIs For Workspace Switching

Workspace creation and switching should be implemented only after session auth.

Needed APIs:

```http
GET  /v1/me
GET  /v1/me/workspaces
POST /v1/workspaces
GET  /v1/workspaces/:workspaceId/projects
POST /v1/workspaces/:workspaceId/projects
POST /v1/session/active-context
```

Until those APIs exist, any workspace dropdown must clearly behave as a current
workspace indicator, not a selector.
