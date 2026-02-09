# AI-Ready Backend

TypeScript + Express backend scaffold that combines PostgreSQL/Prisma persistence, Better Auth powered authentication, and the Vercel AI SDK for LLM-powered endpoints. Designed to plug into multiple AI-focused products.

## Tech Stack

- **Express 5** with Helmet/Cors/Morgan hardening
- **TypeScript** tooling with `ts-node-dev` for hot reload
- **Prisma** ORM targeting PostgreSQL (with Better Auth tables baked in)
- **Better Auth** Prisma adapter for password auth + secure session cookies (per [discussion #5578](https://github.com/better-auth/better-auth/discussions/5578))
- **Vercel AI SDK** (`ai` + `@ai-sdk/openai`) for LLM calls

## Getting Started

1. Install dependencies (pnpm is required):
   ```bash
   pnpm install
   ```
2. Copy the environment template and fill in secrets:
   ```bash
   cp .env.example .env
   ```
   - Set `BETTER_AUTH_SECRET` to a long random value.
   - Update `APP_BASE_URL` and `TRUSTED_ORIGINS` so Better Auth can validate callback URLs and allow your frontend origin(s) to exchange cookies.
3. Apply database migrations (creates the Prisma Client as well):
   ```bash
   pnpm prisma:migrate
   ```
4. Start the dev server:
   ```bash
   pnpm dev
   ```

## Scripts

- `pnpm dev` – start Express with `ts-node-dev`
- `pnpm build` – compile to `dist/`
- `pnpm start` – run the compiled build
- `pnpm prisma:migrate` – run migrations against the `DATABASE_URL`
- `pnpm prisma:generate` – regenerate Prisma Client

## API Surface

| Method | Route                       | Description                                                                    | Auth                       |
| ------ | --------------------------- | ------------------------------------------------------------------------------ | -------------------------- |
| GET    | `/health`                   | Health probe                                                                   | Public                     |
| GET    | `/users/me`                 | Returns the authenticated user record                                          | Better Auth session cookie |
| PATCH  | `/users/me`                 | Updates the user's display name via Better Auth `updateUser`                   | Better Auth session cookie |
| GET    | `/users/me/sessions`        | Last 20 AI sessions tied to the user                                           | Better Auth session cookie |
| POST   | `/users/me/change-password` | Calls Better Auth `changePassword` to rotate credentials                       | Better Auth session cookie |
| POST   | `/ai/generate`              | Accepts `{ "prompt": string }` and streams an LLM response persisted to the DB | Better Auth session cookie |
| POST   | `/users/sign-out`           | Revokes the current Better Auth session and clears cookies                     | Better Auth session cookie |

Better Auth issues HTTP-only cookies (`better-auth.session_token`, etc.) that the frontend must forward on every request to protected routes. Non-browser clients can store the session cookie manually and send it via the `Cookie` header. The profile/password endpoints above simply proxy Better Auth's stock [`updateUser`](https://www.better-auth.com/docs/concepts/users-accounts) and `changePassword` handlers so password hashing and audit trails remain centralized.

### Endpoint Inputs & Outputs

| Endpoint                    | Method | Request Body                                                                            | Successful Response                                                                                       | Failure Cases                                                                                         |
| --------------------------- | ------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/health`                   | GET    | _None_                                                                                  | `200 OK` with `{ "status": "ok", "timestamp": "ISO8601" }`                                                | _n/a_                                                                                                 |
| `/users/me`                 | GET    | _None_                                                                                  | `200 OK` with `{ "user": Express.User }`                                                                  | `401` if no Better Auth session                                                                       |
| `/users/me`                 | PATCH  | `{ "name": string }`                                                                    | `200 OK` with `{ "status": true, "name": "..." }`                                                         | `400` invalid payload, `401` unauthenticated                                                          |
| `/users/me/sessions`        | GET    | _None_                                                                                  | `200 OK` with `{ "sessions": AiSession[] }`                                                               | `401` unauthenticated                                                                                 |
| `/users/me/change-password` | POST   | `{ "currentPassword": string, "newPassword": string, "revokeOtherSessions"?: boolean }` | `200 OK` with Better Auth payload `{ "token": string \| null, "user": {...} }`                            | `400` invalid payload, `401` unauthenticated, `401/400` from Better Auth if current password is wrong |
| `/ai/generate`              | POST   | `{ "prompt": string }`                                                                  | `200 OK` with `{ "data": { "text": string, "sessionId": string, "model": string, "createdAt": string } }` | `400` invalid body, `401` unauthenticated                                                             |
| `/users/sign-out`           | POST   | _None_                                                                                  | `200 OK`/`204` plus Better Auth `Set-Cookie` headers clearing the session                                 | `401` if unauthenticated                                                                              |

`AiSession` mirrors the Prisma model that records each LLM interaction. The `/users/me/sessions` response simply wraps the last 20 rows returned by Prisma:

```ts
type AiSession = {
  id: string;
  userId: string;
  prompt: string;
  response: string;
  model: string;
  createdAt: string; // ISO8601 timestamp
};
```

`POST /ai/generate` automatically fetches up to the last five `AiSession` entries for the authenticated user and sends them as structured `{ role, content }` history `messages` (alternating user/assistant turns). The LLM call also sets a custom system prompt and appends the current request body as the latest user message, keeping responses grounded in recent conversation context.

### Better Auth Endpoints

- The entire Better Auth router is exposed at `/auth/*` (the Express app proxies requests directly to `betterAuth.handler` as recommended in discussion #5578).
- Use the stock endpoints such as `POST /auth/sign-up/email`, `POST /auth/sign-in/email`, `GET /auth/get-session`, etc.
- Successful sign-in/sign-up responses include `Set-Cookie` headers for `better-auth.session_token` and its related helpers. These cookies are the only credentials the API expects.

## Project Structure

```
src
├── app.ts               # Express app wiring
├── index.ts             # HTTP server bootstrap
├── config               # env + runtime flags
├── controllers          # Route handlers
├── middleware           # Auth context + error handlers
├── routes               # Express routers (auth proxy, health, users, ai)
├── services             # Domain logic (LLM helpers)
├── lib                  # Prisma singleton + Better Auth instance
└── types                # Express augmentations
```

## Vercel AI Usage

`aiService.generateResponse` demonstrates how to call the Vercel AI SDK with an OpenAI model. Swap providers/models by editing `AI_MODEL` or by injecting a different client in the service.

## Authentication Flow

1. Call the Better Auth endpoints under `/auth` (e.g., `POST /auth/sign-in/email`).
2. Let the frontend/browser store the HTTP-only cookies that Better Auth sets. For non-browser clients, capture the `Set-Cookie` response headers and reuse them for subsequent API calls.
3. Ensure every protected request forwards the cookies (typically via `fetch(..., { credentials: "include" })`). The backend uses `auth.api.getSession({ headers })` to resolve the session and populate `req.user`.
4. For split frontend/backends, set `TRUSTED_ORIGINS` so Better Auth will accept cross-site cookie requests, matching the pattern from the shared GitHub discussion.

## Commerce Brain v1 (Operational Rules)

The offer engine now includes a deterministic commerce policy layer (no ML, no inventory persistence) with explicit safety constraints.

### Policy + Contracts

- Policy constants and strategy thresholds live in `src/services/commerce/commercePolicyV1.ts`.
- Core deterministic evaluators live in `src/services/commerce/commerceEvaluators.ts`.
- Commerce response contract scaffolding lives in `src/services/commerce/commerceContract.ts`.
- Offer selection still returns a maximum of 2 offers and preserves existing endpoint response shape.

### Locked Strategy Modes

- `protect_rate`: tighter delta guardrails, refundable-first behavior.
- `balanced` (default): conversion + margin with medium policy risk.
- `fill_rooms`: wider delta guardrails, occupancy-first behavior.

Price delta guardrails (based on `totalAfterTax`):

- `protect_rate`: max `20%` and `$250`
- `balanced`: max `25%` and `$300`
- `fill_rooms`: max `35%` and `$400`

### Pricing Basis Hierarchy (Fail-Closed)

Offer comparison uses this strict order:

1. `totalAfterTax`
2. `totalBeforeTax + taxesAndFees`
3. `totalBeforeTax` (degraded mode)
4. invalid candidate

Rules:

- No synthetic tax estimation.
- No mixed basis comparison for a selected pair.
- If basis degrades to `beforeTax`, price steering is reduced (`degradedPriceControls=true`).
- If no comparable candidates remain, return clarification instead of fabricating prices.

### Currency Handling

- Exact currency match only (`candidate.currency === requestCurrency`).
- No FX conversion in v1.
- Mismatched candidates are invalid and excluded from ranking.

### Saver-Primary Exception (Non-refundable as Primary)

Default is refundable primary. Saver can become primary only when:

- low inventory at selected room/rate level (`roomsAvailable <= 2`) OR estimated occupancy `>= 0.92` (if total inventory is known),
- AND refundable vs saver delta is at least `30%`,
- AND strict price controls are available (not degraded `beforeTax` mode).

### Business Hours + Fallback Behavior

Schema:

- `properties(id, timezone, default_currency, ...)`
- `property_hours(id, property_id, day_of_week, open_time, close_time, ...)`
- Multiple `property_hours` rows per day are supported.
- Overnight intervals are supported (`open_time > close_time`, e.g. `22:00-06:00`).
- `00:00-00:00` means 24-hour open.
- Missing schedule/timezone is treated as closed.

Fallback CTA priority (when used by channel integrations):

1. send booking link
2. transfer to front desk (business hours only)
3. collect waitlist
4. suggest alternate dates

### Attribution Rules (v1)

- Last click within 24 hours wins.
- Must match property, length of stay, and exact party size.
- Check-in date tolerance is `<= 1 day`.
- Single-credit attribution only (no multi-crediting).

### Assumptions

- Engine remains PMS-agnostic and ARI-driven.
- No inventory persistence is introduced in v1.
- Urgency messaging must be factual and source-backed; no synthetic scarcity.
- Current offer builder uses first available room type and deterministic pairing logic.

### Schema Migration

This repo includes the migration:

- `prisma/migrations/20260209123000_add_property_hours/migration.sql`

Apply with:

```bash
pnpm prisma:migrate
```

### Quick Manual Test Scenarios

`POST /offers/generate` is authenticated. Use a valid Better Auth session cookie.

Example shell setup:

```bash
BASE_URL=http://localhost:3000
SESSION_COOKIE='better-auth.session_token=...'
```

1) Standard 2-offer pairing (refundable primary expected):

```bash
curl -sS "$BASE_URL/offers/generate" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "slots": {
      "check_in": "2026-02-10",
      "check_out": "2026-02-12",
      "adults": 2,
      "rooms": 1
    }
  }' | jq '.data.offers[] | {id, rate_type, total: .price.total, commerce: .commerce_metadata}'
```

2) Saver-primary exception (demo seed path, accessible room inventory is compressed):

```bash
curl -sS "$BASE_URL/offers/generate" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "slots": {
      "check_in": "2026-02-10",
      "check_out": "2026-02-12",
      "adults": 2,
      "rooms": 1,
      "accessible_room": true
    }
  }' | jq '.data.offers[0] | {rate_type, commerce: .commerce_metadata}'
```

Expected: first offer has `"rate_type": "non_refundable"` and `commerce.saverPrimaryExceptionApplied = true`.

3) No inventory fallback:

```bash
curl -sS "$BASE_URL/offers/generate" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "slots": {
      "check_in": "2026-02-10",
      "check_out": "2026-02-12",
      "adults": 2,
      "rooms": 99
    }
  }' | jq
```

Expected: `422` with a clarification message about availability.

## Next Steps

- Define additional Prisma models if your AI workflows need metadata (projects, datasets, etc.)
- Layer in streaming responses via `generateTextStream`
- Deploy behind a process manager (e.g., Vercel, Fly, Railway) and configure `DATABASE_URL` + secrets via your platform
