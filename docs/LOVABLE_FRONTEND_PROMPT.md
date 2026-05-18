# Lovable Frontend Prompt For Vukho

Use this prompt in Lovable to generate the Vukho frontend shell. This is for frontend/UI only. Backend integration will be done later by Codex.

```txt
Build the frontend for Vukho, an AI-agent-native phone infrastructure platform.

Vukho gives AI agents phone numbers, SMS, calls, transcripts, webhooks, usage tracking, and structured outcomes through one developer-first API.

Important: build only the frontend layer. Use mock/static data where needed. Do not implement the real backend. Do not create a marketing landing page. This should be an operational SaaS dashboard for developers and AI-agent builders.

Use the attached reference image only for theme direction and layout feel:
- clean white workspace
- black/neutral typography
- left sidebar navigation
- simple top header
- subtle borders
- compact tabs
- rounded but restrained surfaces
- calm developer-tool feel

Do not hard-code the exact colors from the reference. Create a flexible design system with CSS variables/tokens so Codex can later tune the theme. The product should not feel like a generic AI startup landing page. It should feel like a serious AI infrastructure product built for agents, phone workflows, debugging, and integration.

Product name: Vukho

Core UX goal:
Make it easy for a developer to create an AI phone agent, attach a number, simulate SMS/calls, inspect transcripts, configure webhooks, and understand usage.

Design personality:
- clean
- sharp
- technical
- calm
- confident
- agent-native
- operational
- not flashy
- not decorative
- not generic purple-gradient AI

Suggested theme:
- light-first interface
- off-white app background
- white content surfaces
- black or near-black primary text
- muted gray secondary text
- thin neutral borders
- compact active states
- one subtle accent color for important actions and status only
- status colors for success, warning, error, live, queued
- monospace used only for IDs, API keys, event names, phone numbers, and code-like values

Use these UI principles:
- Sidebar navigation on desktop.
- Responsive mobile navigation.
- Dense but readable dashboard.
- Tables for operational resources.
- Tabs for detail pages.
- Empty states with one clear next action.
- No decorative hero sections.
- No nested cards.
- No giant marketing copy inside the app.
- Use icons for navigation and common actions.
- Use compact buttons, badges, tabs, tables, forms, and split panes.
- Use tooltips for technical controls.
- Make all text fit properly on desktop and mobile.

Authentication:
Use Google SSO only.

Required auth screens:
1. Login screen
   - Vukho logo/name
   - short value line: "Phone infrastructure for AI agents"
   - "Continue with Google" button
   - minimal legal text
   - no email/password form

2. Auth loading/callback screen
   - simple centered loading state
   - text: "Signing you in"

3. Error state
   - friendly auth error
   - retry Google sign-in button

Required onboarding flow after first login:
1. Welcome screen
   - title: "Set up your Vukho workspace"
   - collect workspace name
   - show 3-step setup preview: Create agent, Attach number, Test call/SMS

2. Create first agent
   - fields: agent name, mode, system prompt, begin message
   - mode options: Hosted, Webhook, Web
   - recommend Webhook for developers and Hosted for quick testing

3. Configure integration
   - webhook URL optional
   - show "Skip for now" option
   - show short explanation that webhooks let the user's backend control the agent

4. Finish screen
   - show created workspace and agent summary
   - actions: "Open dashboard" and "Open playground"

Main app shell:
- left sidebar with Vukho logo
- workspace switcher near top
- primary nav
- top-right feedback button, notifications icon, user avatar menu
- page title area
- optional tab bar under title for detail/settings pages

Sidebar nav:
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
- Service Health

Dashboard pages to create:

1. Overview
Purpose: show operational health.
Widgets:
- Active agents
- Active numbers
- Calls today
- Messages today
- Failed webhooks
- Month-to-date spend
- Balance
- Recent calls table
- Recent messages table
- Usage trend chart
Primary actions:
- Create agent
- Provision number
- Open playground
- Configure webhook

2. Agents
List view:
- table columns: Name, Mode, Numbers, Calls, Messages, Last activity, Status
- actions: Create agent, Test, Edit
Create/edit drawer or page:
- name
- description
- mode: hosted, webhook, web
- system prompt
- voice
- begin message
- transfer number
- voicemail message
- webhook URL
- metadata JSON
Agent detail tabs:
- Overview
- Configuration
- Numbers
- Conversations
- Calls
- Usage
- Webhooks
- Logs

3. Numbers
List columns:
- Phone number
- Country
- Area code
- Capabilities
- Provider
- Attached agent
- Status
- Monthly cost
Actions:
- Provision mock number
- Attach to agent
- Detach
- Release
Number detail:
- capabilities
- provider metadata
- attached agent
- recent calls/messages
- compliance state

4. Inbox
Layout:
- left conversation list
- right message thread
Conversation list:
- contact phone
- agent
- last message preview
- last activity
- channel/status
Thread:
- inbound/outbound message bubbles but keep them restrained
- delivery status
- related webhook events
- contact metadata panel
Actions:
- Send SMS
- Simulate inbound SMS in mock mode

5. Calls
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
Call detail:
- lifecycle timeline
- transcript turns
- summary
- outcome
- recording placeholder
- usage events
- webhook events
- provider callback events
- error/failure reason when applicable
Actions:
- Start mock outbound call
- Simulate inbound call
- End call
- Transfer call

6. Contacts
List:
- Display name
- Phone number
- Conversations
- Calls
- Messages
- Last activity
Detail:
- metadata
- conversations
- calls
- messages
- agent interactions

7. Webhooks
List:
- URL
- Events
- Status
- Last delivery
- Failure count
Detail:
- endpoint secret state
- subscribed events
- recent delivery attempts
- retry schedule
- last response code/body
Actions:
- Create endpoint
- Edit endpoint
- Pause endpoint
- Rotate secret
- Send test event
- Replay failed delivery

8. Usage
Filters:
- date range
- agent
- channel
Show:
- daily usage chart
- monthly usage chart
- cost by agent
- cost by channel
- usage event table
Usage event table columns:
- Time
- Agent
- Resource type
- Resource ID
- Channel
- Quantity
- Unit
- Unit cost
- Total cost

9. Billing
Show:
- current balance
- month-to-date spend
- spend limit
- recharge state
- recent billable events
- invoices placeholder
Phase 1 billing is simulated, so label it clearly as simulated/test billing.

10. API Keys
List:
- Label
- Prefix
- Scope
- Created at
- Last used
- Status
Actions:
- Create key
- Copy key once after creation
- Revoke key
- Rename key
Security rule:
- Full API key should appear only in the create-key success modal.

11. Playground
Purpose: let users test Vukho without real telecom.
Workflows:
- create/select test agent
- provision mock number
- send outbound SMS
- simulate inbound SMS
- start outbound call
- simulate inbound call
- generate transcript
- trigger webhook delivery
- simulate webhook failure
- view created records
The playground should feel like a developer console for testing phone agents.

12. Settings
Use tabbed settings page similar to the attached reference.
Tabs:
- Workspace
- Members
- Google SSO
- Integrations
- Provider Settings
- Notifications
- Usage Controls
- Compliance
- Developer Tools

Settings content:
- Workspace name
- Team members placeholder
- Google SSO connected state
- Twilio/Telnyx integration placeholders
- Webhook global settings
- Notification preferences
- Spend limits
- Recording consent mode
- SMS opt-out/compliance fields
- API/developer preferences

13. Service Health
Show:
- API status
- webhook worker status
- mock provider status
- Twilio status placeholder
- Telnyx status placeholder
- queue status
- latest incidents placeholder

Mock data requirements:
- Use realistic Vukho data.
- Include 3-5 agents.
- Include a mix of hosted, webhook, and web modes.
- Include active and failed webhooks.
- Include completed, failed, in-progress, and no-answer calls.
- Include inbound and outbound SMS.
- Include usage costs.
- Include realistic phone numbers.
- Include event names like agent.call.ended and agent.message.received.

Integration requirements for later Codex backend work:
- Keep API calls isolated in a clear client/service layer.
- Use typed mock data objects.
- Do not scatter fake data across components.
- Use clear route/page names.
- Use reusable layout, table, badge, empty state, detail header, and status components.
- Make states easy to replace with real backend data.

Recommended frontend stack:
- React
- TypeScript
- Tailwind CSS
- shadcn/ui or similar component primitives
- lucide-react icons
- Recharts for charts
- React Hook Form + Zod for forms

Do not:
- build backend logic
- build real Twilio integration
- build real billing
- build password login
- build a public marketing landing page
- make the UI look like a generic AI landing page
- use purple/blue gradients as the primary visual identity
- hard-code the exact reference image colors
- hide operational failures

Final output should be a polished, responsive SaaS dashboard frontend for Vukho with Google SSO login screens, onboarding screens, dashboard pages, settings, integrations, playground, and realistic mock data.
```

## Notes For Codex After Lovable Generates The Frontend

After Lovable creates the frontend, Codex should:

- Inspect the generated routing and component structure.
- Preserve the theme and UI direction.
- Move scattered mock data into a clear mock API/client layer if needed.
- Connect pages to the Vukho backend route contracts from `BACKEND_SPEC.md`.
- Keep Google SSO only unless product docs change.
- Keep dashboard behavior aligned with `FRONTEND_SPEC.md`.
