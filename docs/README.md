# AgentLine Documentation Index

This folder is the source of truth for AgentLine.

AgentLine is an AI-agent-native phone infrastructure product. It gives AI agents phone numbers, SMS, calls, transcripts, webhooks, usage tracking, and structured outcomes through one developer-first API.

Implementation progress is tracked separately in `tracking/`.

## Documents

| Document | Purpose |
|---|---|
| `PRODUCT_SPEC.md` | Business, product, market, user, feature, API, positioning, risks, and outcomes. |
| `ROADMAP.md` | Build phases, milestones, dependencies, and acceptance criteria. |
| `IMPLEMENTATION_PLAN.md` | Phase 1 execution plan, build order, AI-agent task breakdown, and definition of done. |
| `PHASE_1_STATUS.md` | Live Phase 1 implementation tracker, review notes, and next steps. |
| `PROJECT_DOCS.md` | Engineering conventions, architecture, modules, provider strategy, testing, and documentation rules. |
| `BACKEND_SPEC.md` | Backend routes, data model, states, provider adapter contract, webhooks, usage, and acceptance criteria. |
| `FRONTEND_SPEC.md` | Dashboard information architecture, workflows, screens, states, and UX requirements. |
| `TECH_STACK.md` | Recommended stack, architecture shape, deployment path, scaling path, and what to avoid early. |
| `LOVABLE_FRONTEND_PROMPT.md` | Detailed prompt for generating the AgentLine frontend shell in Lovable. |
| `AI_DEVELOPMENT_GUIDE.md` | Rules for human engineers and AI agents implementing AgentLine from these docs. |

## Reading Order

1. Read `PRODUCT_SPEC.md` to understand what AgentLine is and why it exists.
2. Read `ROADMAP.md` to understand what to build first.
3. Read `IMPLEMENTATION_PLAN.md` before starting Phase 1 work.
4. Check `PHASE_1_STATUS.md` before making Phase 1 changes.
5. Read `PROJECT_DOCS.md` to understand architecture and engineering boundaries.
6. Read `BACKEND_SPEC.md` before implementing API or services.
7. Read `FRONTEND_SPEC.md` before implementing dashboard UI.
8. Read `TECH_STACK.md` before scaffolding the application or choosing libraries.
9. Use `LOVABLE_FRONTEND_PROMPT.md` when generating the frontend shell in Lovable.
10. Read `AI_DEVELOPMENT_GUIDE.md` before assigning work to AI coding agents.

## Source-Of-Truth Rule

If implementation and documentation disagree, the documentation must be updated or the implementation must be corrected in the same task. Do not let product behavior drift away from these documents.

## Tracking Rule

After every implementation task, update `tracking/IMPLEMENTATION_LEDGER.md` and review `tracking/NEXT_PHASE_PLAN.md`.
