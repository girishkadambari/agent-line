# Vukho Engineering Rules

These rules are mandatory for all implementation work. Vukho is intended to be open-source ready, easy to understand, and maintainable before funding.

## Core Principles

1. Backend first.
2. NestJS modular monolith.
3. One responsibility per module/service.
4. Controllers are thin.
5. Services own business logic.
6. Provider-specific logic stays behind provider adapters.
7. Public API responses are provider-neutral.
8. No real telecom dependency in Phase 1.
9. No frontend code in the backend repo unless docs are changed first.
10. Docs and tracking must be updated with every meaningful implementation change.

## Code Style

- Use TypeScript strict mode.
- Use clear names over clever abstractions.
- Prefer small services with focused responsibilities.
- Avoid large god services.
- Avoid business logic in controllers.
- Avoid raw Prisma records as public API responses when they expose internal fields.
- Use explicit serializers for public response shapes when needed.
- Use Zod or DTO validation for request bodies.
- Keep errors consistent with `BACKEND_SPEC.md`.

## NestJS Structure Rules

Each domain module should generally contain:

```txt
module-name/
  module-name.module.ts
  module-name.controller.ts
  module-name.service.ts
  module-name.serializer.ts
  module-name.schemas.ts
  module-name.spec.ts
```

Use this structure unless the module is tiny and a simpler shape is justified.

## API Rules

- All public API routes live under `/v1`.
- All protected routes require API-key auth.
- Use `{ data }` for single-object responses.
- Use `{ data, pagination }` for list responses.
- Use `{ error: { code, message, details } }` for errors.
- Never expose API key hashes or webhook secrets.
- Soft-delete or disable historical resources.
- Preserve historical calls, messages, usage events, and webhooks.

## Data Rules

- Use Vukho IDs as primary IDs.
- Store provider IDs as secondary fields.
- Use workspace/project scoping.
- Store timestamps in UTC.
- Usage events are append-only.
- Provider raw payloads stay separate from normalized domain records.

## Provider Rules

- Mock provider is the first provider.
- Twilio/Telnyx come later behind the same provider interface.
- No controller should know which provider is being used.
- Provider errors must be normalized into Vukho errors.

## Testing Rules

Every implemented feature must have tests or a documented reason why not.

Minimum test levels:

- Unit tests for pure services/utilities.
- Controller/service tests for module behavior.
- Supertest API tests for important route flows.

Before marking a slice done, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Open-Source Rules

- Keep setup simple.
- Keep README accurate.
- Keep `.env.example` current.
- Do not commit secrets.
- Do not commit generated build output.
- Do not commit local database files.
- Prefer readable code over private shorthand.
- Add comments only when they explain non-obvious decisions.

## Review Rules

After each implementation slice:

- Update `tracking/IMPLEMENTATION_LEDGER.md`.
- Run `tracking/PHASE_REVIEW_CHECKLIST.md`.
- Record known limitations.
- Record verification commands.
- Update docs if API/product/architecture changed.
