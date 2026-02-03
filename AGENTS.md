## Coding guidelines

## Prime Directives

1. **Prefer the simplest working solution** that fits existing patterns.
2. **Do not grow files unnecessarily** — refactor when a file starts to feel “heavy”.
3. **Avoid framework churn** (don’t introduce new libs/patterns unless asked).
4. **Keep behavior stable** — avoid breaking existing routes/response shapes.
5. **Leave the codebase cleaner than you found it** (remove dead code and unused imports).

---

### Controllers must be thin

Controllers should:

- Parse/validate input (Zod, schemas, params)
- Call a service function
- Return JSON

Controllers must **not**:

- Contain business logic
- Call LLM/external APIs directly
- Construct Prisma create/update payloads (except tiny passthrough cases)
- Contain branching workflows (move to services)

**Pattern:**

- `src/routes/*` → route wiring only
- `src/controllers/*` → HTTP-only glue
- `src/services/*` → orchestration / workflows (call helpers and integrations)
- `src/integrations/*` → external API clients (fetch, auth headers, response normalization)
- `src/mappers/*` → “pure” mapping logic (domain → Prisma inputs, formatting)
- `src/auth/*` → group/member assertions, resolution helpers
- `src/ai/*` → parsing, memory helpers, tool registry, pending-action resolver

### Services must be slim and composable

Services should:

- Orchestrate helpers/integrations/mappers
- Be testable without HTTP context
- Prefer small helpers at file bottom for local glue

Services should **not**:

- Embed huge JSON prompts inline (use `src/prompts/...`)
- Duplicate external API calls (centralize in `integrations/`)
- Mix unrelated concerns in one function

### Prisma usage

- Keep Prisma calls in services (or specialized repository/helper modules).
- Prefer `build*CreateInput()` / `build*UpdateInput()` mappers over inline payloads.
- Always validate membership/ownership before querying or mutating group-scoped data:
  - Prefer helpers like `assertMembersBelongToGroup(groupId, memberIds)`.

### Errors

- Throw `ApiError(message, status)` (or existing error handler pattern).
- No `console.log` in final code unless behind a debug flag.

---

## AI / LLM Integration Rules (Critical)

### Never let the LLM write DB inputs directly

LLM output must be a **structured “intent”** (tool call / command), then backend code:

- validates
- resolves IDs (members, group, itinerary item)
- calls services to mutate data

### Pending actions (confirmations / choices)

- Implement confirmations via a **PendingAction** state that is:
  - persisted in `aiSession.response` payload
  - resolved before running the LLM (pending resolver first)
- Use “stop-at-clear” semantics: once a payload stores `pendingAction: null`, do not resurrect older pending actions.

### Keep prompts in prompt files

- System prompts go in `src/prompts/system/...`
- Avoid inline prompt blobs inside services.

---

## Naming + Types

- TypeScript everywhere.
- Public service functions should have explicit input/output types.
- Prefer `type` over `interface` for small shapes.
- Use consistent naming:
  - `createX`, `updateX`, `deleteX`, `getX`, `listX`
  - `buildXCreateInput`, `mapX`, `enrichX`

---

## Refactor Triggers (when Codex should proactively refactor)

Refactor if:

- A controller exceeds ~80–120 lines or has branching workflows.
- A service exceeds ~200–300 lines **and** contains multiple responsibilities.
- Duplicate logic appears in >2 places (extract helper/integration/mapper).
- A module imports too many unrelated domains.

Refactor style:

- Prefer adding **1–3 helper files** (not big new folder trees) unless requested.
- Keep exports minimal.
- Avoid “utility dumping grounds”.

---

## Commands

- `pnpm install`
- `pnpm prisma:migrate` (apply migrations + generate)
- `pnpm dev`
- `pnpm build`

---

## Security

- Never commit secrets or `.env*`.
- Backend must enforce auth + group authorization.

---

## Output Expectations (what Codex should provide)

When implementing a change, always output:

1. **Files changed** (list)
2. **Key behavior changes**
3. **How to run/verify**
4. If schema changed: migration steps + Prisma generate

Prefer small PR-sized changes over massive rewrites.

## Required checks

After any code change, run:

- `npx tsc --noEmit`
  Fix all TS errors before finishing.
