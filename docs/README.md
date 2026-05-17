# AgentLine Documentation Index

This folder is the source of truth for AgentLine.

AgentLine is an AI-agent-native phone infrastructure product. It gives AI agents phone numbers, SMS, calls, transcripts, webhooks, usage tracking, and structured outcomes through one developer-first API.

Implementation progress is tracked separately in `tracking/`.

## Documents

| Document                        | Purpose                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `PRODUCT_SPEC.md`               | Business, product, market, user, feature, API, positioning, risks, and outcomes.                           |
| `ROADMAP.md`                    | Build phases, milestones, dependencies, and acceptance criteria.                                           |
| `SELLABLE_RELEASE_PLAN.md`      | Market-release phases, launch blockers, sellable wedge, and production readiness plan.                     |
| `IMPLEMENTATION_PLAN.md`        | Phase 1 execution plan, build order, AI-agent task breakdown, and definition of done.                      |
| `PHASE_1_STATUS.md`             | Live Phase 1 implementation tracker, review notes, and next steps.                                         |
| `PROJECT_DOCS.md`               | Engineering conventions, architecture, modules, provider strategy, testing, and documentation rules.       |
| `PRODUCT_HIERARCHY.md`          | Ownership hierarchy for user, workspace, project, API keys, agents, telephony records, usage, and billing. |
| `BACKEND_SPEC.md`               | Backend routes, data model, states, provider adapter contract, webhooks, usage, and acceptance criteria.   |
| `API_EXAMPLES.md`               | Concrete curl examples for every Phase 1 API route group.                                                  |
| `SMOKE_FLOW.md`                 | End-to-end local mock flow from API key to usage and billing.                                              |
| `PROJECT_COMPLETENESS_CHECK.md` | Phase 1 completeness audit and intentional deferrals.                                                      |
| `FRONTEND_SPEC.md`              | Dashboard information architecture, workflows, screens, states, and UX requirements.                       |
| `TECH_STACK.md`                 | Recommended stack, architecture shape, deployment path, scaling path, and what to avoid early.             |
| `LOVABLE_FRONTEND_PROMPT.md`    | Detailed prompt for generating the AgentLine frontend shell in Lovable.                                    |
| `AI_DEVELOPMENT_GUIDE.md`       | Rules for human engineers and AI agents implementing AgentLine from these docs.                            |
| `STRIPE_BILLING_PLAN.md`        | Stripe checkout, portal, webhook, and prepaid-credit billing plan.                                         |

## Reading Order

1. Read `PRODUCT_SPEC.md` to understand what AgentLine is and why it exists.
2. Read `ROADMAP.md` to understand what to build first.
3. Read `SELLABLE_RELEASE_PLAN.md` before prioritizing launch work.
4. Read `IMPLEMENTATION_PLAN.md` before starting Phase 1 work.
5. Check `PHASE_1_STATUS.md` before making Phase 1 changes.
6. Read `PROJECT_DOCS.md` to understand architecture and engineering boundaries.
7. Read `PRODUCT_HIERARCHY.md` before implementing workspace, project, auth, billing, or dashboard context behavior.
8. Read `BACKEND_SPEC.md` before implementing API or services.
9. Use `API_EXAMPLES.md` and `SMOKE_FLOW.md` to integrate or test the backend.
10. Read `PROJECT_COMPLETENESS_CHECK.md` before deciding what Phase 1 still needs.
11. Read `FRONTEND_SPEC.md` before implementing dashboard UI.
12. Read `TECH_STACK.md` before scaffolding the application or choosing libraries.
13. Use `LOVABLE_FRONTEND_PROMPT.md` when generating the frontend shell in Lovable.
14. Read `AI_DEVELOPMENT_GUIDE.md` before assigning work to AI coding agents.
15. Read `STRIPE_BILLING_PLAN.md` before enabling test or live Stripe billing.

## Source-Of-Truth Rule

If implementation and documentation disagree, the documentation must be updated or the implementation must be corrected in the same task. Do not let product behavior drift away from these documents.

## Tracking Rule

After every implementation task, update `tracking/IMPLEMENTATION_LEDGER.md` and review `tracking/NEXT_PHASE_PLAN.md`.
