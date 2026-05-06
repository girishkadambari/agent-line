# AgentLine Tracking

This folder tracks what has actually been implemented, what is next, and what must be reviewed after every phase.

This folder is separate from `docs/` on purpose:

- `docs/` defines the product, architecture, API, and roadmap.
- `tracking/` records implementation progress, decisions, reviews, and next tasks.

## Files

| File | Purpose |
|---|---|
| `IMPLEMENTATION_LEDGER.md` | Chronological record of completed implementation work. |
| `NEXT_PHASE_PLAN.md` | Current next implementation slice and execution order. |
| `ENGINEERING_RULES.md` | Strict coding standards, architecture rules, and open-source expectations. |
| `PHASE_REVIEW_CHECKLIST.md` | Review checklist to run after every implementation phase/slice. |

## Required Workflow

After every implementation task:

1. Update `IMPLEMENTATION_LEDGER.md`.
2. Update `NEXT_PHASE_PLAN.md` if the next task changes.
3. Update `PHASE_REVIEW_CHECKLIST.md` with review status when a phase/slice is ready.
4. Update relevant `docs/` files if product/API/architecture behavior changed.
5. Run verification commands and record the result.

Do not mark work done unless it has been implemented and verified.
