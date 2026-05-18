# Vukho Frontend And Dashboard Specification

## Purpose

This document defines the Vukho dashboard requirements. The dashboard must help developers create, test, inspect, and operate AI phone agents. It is not a marketing site.

## UX Principle

Vukho is an operational developer product. The UI should be quiet, dense, clear, and built for repeated use.

Prioritize:

- resource state
- operational visibility
- failure diagnosis
- fast testing
- usage visibility
- clear next actions

Avoid:

- landing-page sections
- decorative hero layouts
- vague product education inside the app
- oversized cards for simple data
- UI that hides provider errors or webhook failures

## Navigation

Primary navigation:

- Overview
- Agents
- Numbers
- Inbox
- Calls
- Contacts
- Webhooks
- Usage
- Billing
- API Keys
- Playground
- Settings

Navigation must show the current workspace/project context.

## Global UI Requirements

Every list view must include:

- Search where useful.
- Status filter where useful.
- Empty state with one concrete action.
- Loading state.
- Error state.
- Pagination or cursor loading for long lists.

Every detail page must show:

- Resource ID.
- Status.
- Created/updated timestamps.
- Related agent/project/workspace.
- Recent events or activity.
- Actions that are valid for current state only.

## Overview

Purpose: show operational health.

Must show:

- Active agents.
- Active phone numbers.
- Calls today.
- Messages today.
- Spend today/month.
- Failed webhook deliveries.
- Recent calls.
- Recent messages.
- Usage trend.
- Balance/spend-limit warning.

Primary actions:

- Create agent.
- Provision number.
- Open playground.
- Configure webhook.

## Agents

List columns:

- Name
- Mode
- Attached numbers
- Calls
- Messages
- Last activity
- Status

Create/edit form fields:

- Name
- Description
- Mode: `hosted`, `webhook`, `web`
- System prompt
- Voice
- Begin message
- Transfer number
- Voicemail message
- Webhook URL
- Metadata JSON

Agent detail tabs:

- Overview
- Configuration
- Numbers
- Conversations
- Calls
- Usage
- Webhooks
- Logs

Required actions:

- Create agent.
- Edit agent.
- Disable agent.
- Attach number.
- Test SMS.
- Test call.

## Numbers

List columns:

- Phone number
- Country
- Area code
- Capabilities
- Provider
- Agent
- Status
- Monthly cost

Required workflows:

- Provision mock number.
- Search real numbers later.
- Attach number to agent.
- Detach number.
- Release number.

Number detail must show:

- Capabilities: SMS, MMS, voice.
- Provider metadata.
- Attached agent.
- Recent calls/messages.
- Usage.
- Compliance state.

## Inbox

Purpose: inspect SMS conversations.

Inbox must show:

- Conversation list.
- Contact phone number.
- Agent.
- Last message preview.
- Last activity.
- Channel/status.

Conversation detail must show:

- Message history.
- Direction: inbound/outbound.
- Delivery status.
- Related webhooks.
- Contact metadata.
- Agent context.

Required actions:

- Send SMS.
- Simulate inbound SMS in mock mode.
- Add contact metadata.
- Open related agent/call/usage.

## Calls

List columns:

- Direction
- From
- To
- Agent
- Status
- Duration
- Outcome
- Started at
- Cost

Call detail must show:

- Call lifecycle timeline.
- Transcript turns.
- Summary.
- Outcome.
- Recording link when available.
- Usage events.
- Webhook events.
- Provider callback events.
- Errors and failure reason.

Required actions:

- Start mock outbound call.
- Simulate inbound call.
- End call.
- Transfer call.
- Replay transcript stream in test mode.

## Contacts

Contact list must show:

- Display name
- Phone number
- Conversations
- Calls
- Messages
- Last activity

Contact detail must show:

- Metadata.
- Conversations.
- Calls.
- Messages.
- Agent interactions.

## Webhooks

Webhook endpoint list columns:

- URL
- Events
- Status
- Last delivery
- Failure count

Endpoint detail must show:

- Secret status.
- Subscribed events.
- Recent delivery attempts.
- Retry schedule.
- Last response body/status.

Required actions:

- Create endpoint.
- Edit endpoint.
- Pause endpoint.
- Rotate secret.
- Send test event.
- Replay failed delivery.

## Usage

Usage dashboard must support:

- Date range filter.
- Agent filter.
- Channel filter.
- Daily usage chart.
- Monthly usage chart.
- Table of usage events.
- Cost by agent.
- Cost by channel.

Usage event row must show:

- Time
- Agent
- Resource type
- Resource ID
- Channel
- Quantity
- Unit
- Unit cost
- Total cost

## Billing

Billing page must show:

- Current balance.
- Month-to-date spend.
- Spend limit.
- Recharge state.
- Recent billable events.
- Invoices placeholder.

Phase 1 billing is simulated. Real payment integration comes later.

## API Keys

API key list columns:

- Label
- Prefix
- Scope
- Created at
- Last used
- Status

Required actions:

- Create key.
- Copy key once after creation.
- Revoke key.
- Rename key.

Security rule:

- Full API key is shown only once.

## Playground

Purpose: make Vukho usable before real telecom exists.

Playground workflows:

- Create test agent.
- Provision mock number.
- Send outbound SMS.
- Simulate inbound SMS.
- Start outbound call.
- Simulate inbound call.
- Generate transcript.
- Trigger webhook delivery.
- Simulate webhook failure.
- View created records.

Every playground action must create real domain records in mock mode.

## Visual Design Requirements

- Use restrained developer-tool styling.
- Prefer tables, tabs, split panes, drawers, and compact forms.
- Use cards only for repeated resource summaries or bounded widgets.
- Do not nest cards inside cards.
- Avoid one-note palettes.
- Text must fit on mobile and desktop.
- Use icons for common actions where the app has an icon library.
- Dashboard should be responsive but optimized for desktop-first developer use.

## Frontend Acceptance Criteria

- User can complete Phase 1 mock workflow from dashboard without API calls.
- Failed webhooks and provider errors are visible without opening server logs.
- Every agent, number, conversation, call, webhook, and usage event can be inspected.
- Dashboard reflects the same states documented in `BACKEND_SPEC.md`.
- Empty states direct users to the next relevant action.
