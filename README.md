# Hotel Commerce Backend

TypeScript + Express backend for hotel voice commerce. The app combines:
- Better Auth session/cookie auth
- Twilio voice + media stream handling
- OpenAI Realtime orchestration
- Deterministic ARI-based offer generation with commerce guardrails

## Tech Stack

- Express 5
- TypeScript
- Prisma + PostgreSQL
- Better Auth
- OpenAI Realtime API (`ws`)
- Twilio Voice + Media Streams
- Redis (ARI response cache)
- Vitest

## Getting Started

1. Install dependencies:
```bash
pnpm install
```

2. Start local infra (Postgres + Redis):
```bash
docker-compose up -d
```

3. Create env file:
```bash
cp .env.example .env
```

4. Required env vars:
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `OPENAI_API_KEY`

5. Useful optional env vars:
- `APP_BASE_URL` (defaults to `http://localhost:<PORT>`)
- `TRUSTED_ORIGINS`
- `OPENAI_REALTIME_MODEL`
- `OPENAI_REALTIME_VOICE`
- `OPENAI_REALTIME_TRANSCRIBE_MODEL`
- `REDIS_URL`
- `ARI_CACHE_TTL_SECONDS`
- `TWILIO_VOICE_STREAM_URL`
- `TWILIO_VOICE_GREETING`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`

6. Apply migrations + generate Prisma client:
```bash
pnpm prisma:migrate
pnpm prisma:generate
```

7. Run the app:
```bash
pnpm dev
```

## Scripts

- `pnpm dev` - run in watch mode
- `pnpm build` - compile TypeScript
- `pnpm start` - run compiled server
- `pnpm test` - run Vitest suite
- `pnpm prisma:migrate` - apply Prisma migrations
- `pnpm prisma:generate` - regenerate Prisma client

## API Surface

### Auth

- `POST /auth/*` - Better Auth proxy routes (sign-in/sign-up/get-session/sign-out/etc.)

### User

- `GET /users/me` (auth required)
- `PATCH /users/me` (auth required)
- `POST /users/me/change-password` (auth required)
- `POST /users/sign-out` (auth required)

### Offers

- `POST /offers/generate` (auth required)
  - Supported request shapes:
    - Wrapped: `{ slots, intent? }`
    - Commerce-friendly top-level: `{ property_id, channel, check_in, check_out, adults, rooms, ... }`
  - Response: `{ data: { currency, priceBasisUsed, offers, fallbackAction?, presentationHints, decisionTrace } }`
  - Validation/clarification errors return `422` via `ApiError`

### Twilio Voice

- `POST /twilio/voice/incoming`
  - Twilio webhook entrypoint
  - Returns TwiML that connects call audio to websocket stream

- `GET /twilio/voice/sessions`
  - Returns in-memory call session snapshots

- `WS /twilio/voice/stream`
  - Media stream endpoint used by Twilio `<Connect><Stream>`

## Commerce Brain v1

Core policy is deterministic and versioned.

### Policy Modules

- `src/services/commerce/commercePolicyV1.ts`
- `src/services/commerce/commerceEvaluators.ts`
- `src/services/commerce/commerceContract.ts`

### Guardrails Implemented

- Max two offers
- Pricing basis hierarchy:
  1. `totalAfterTax`
  2. `totalBeforeTax + taxesAndFees`
  3. `totalBeforeTax` (degraded mode)
  4. fail closed (invalid candidate)
- No synthetic tax estimation
- Exact currency matching only (no FX)
- Strategy-based price delta limits (`protect_rate`, `balanced`, `fill_rooms`)
- Saver-primary exception only under locked compression + delta thresholds
- Fallback clarification when pricing is not trustworthy

### Default Decision Logic

The engine currently makes these default decisions for each `/offers/generate` request:

1. Input normalization
- Accepts either:
  - wrapped request: `{ slots, intent? }`
  - top-level commerce request: `{ property_id, check_in, check_out, adults, rooms, ... }`
- In wrapped mode, `slots.preferences` (for example `late_arrival`) is also read and mapped into commerce behavior.

2. Required slot validation and confirmation
- Validates/normalizes dates and required occupancy slots.
- Uses clarification flow when required data is missing or ambiguous.

3. Candidate generation and eligibility filtering
- Pulls ARI/getRatePlans stub data.
- Filters out candidates that fail restrictions (`cta`, `ctd`, `minLos`, `maxLos`).
- Rejects candidates with invalid pricing basis.
- Rejects candidates with currency mismatch against request currency (no FX in v1).

4. Pricing basis fallback
- Candidate pricing basis priority:
  1. `totalAfterTax`
  2. `totalBeforeTax + taxesAndFees`
  3. `totalBeforeTax` (degraded mode)
  4. invalid candidate (fail closed if none remain)

5. Primary/secondary selection defaults
- Defaults to refundable primary (`SAFE`) where available.
- Picks secondary contrast (`SAVER`) when available and policy-safe.
- Applies strategy-based price-delta guardrails for pairing (`balanced` default).

6. Saver-primary exception
- Non-refundable can become primary only when compression + delta thresholds are met.
- When saver-primary is selected and scarcity is factual (`roomsAvailable <= 2`), structured urgency is returned.

7. Enhancements (merchandising layer)
- Enhancements are attached to the primary offer only (not a 3rd offer):
  - Family/space signals -> breakfast (`availability: info`)
  - Late-arrival signal -> late checkout (`availability: request`, with disclosure)

8. Fallback behavior when <2 offers remain
- If one offer remains, returns one offer plus structured fallback action.
- If no trustworthy offer remains, returns safe clarification error (`422`) instead of fabricating pricing.

9. Explainability fields in response
- Returns `priceBasisUsed`, `presentationHints`, and `decisionTrace` so selection is auditable.

### Response Contract

`/offers/generate` returns a commerce-oriented contract:
- `currency`
- `priceBasisUsed`
- `offers` (0-2)
- `fallbackAction` (when fewer than 2 offers remain)
- `presentationHints` (includes structured urgency when sourced)
- `decisionTrace` (human-readable deterministic reasons)

## Cloudbeds `getRatePlans` Stubs

The ARI source is stubbed in:
- `src/integrations/cloudbeds/cloudbedsGetRatePlansStub.ts`

Supported local/test scenarios via `stub_scenario`:
- `default`
- `saver_primary_accessible`
- `currency_mismatch`
- `before_tax_only`
- `invalid_pricing`
- `constraint_min_los`

These scenarios are for local testing and decision-engine verification.

## Manual Offer Testing

`/offers/generate` requires a valid Better Auth session cookie.

```bash
BASE_URL=http://localhost:4000
SESSION_COOKIE='better-auth.session_token=...'
```

Standard request:
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
  }' | jq '.data'
```

Scenario request example:
```bash
curl -sS "$BASE_URL/offers/generate" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "property_id": "cb_999",
    "channel": "voice",
    "check_in": "2026-06-05",
    "check_out": "2026-06-07",
    "adults": 2,
    "rooms": 1,
    "currency": "USD"
  }' | jq '.data.offers'
```

## Database Schema Notes

Prisma models include:
- Better Auth tables (`users`, `auth_sessions`, `auth_accounts`, `auth_verifications`)
- Commerce support tables:
  - `properties`
  - `property_hours`

Recent migration:
- `prisma/migrations/20260209123000_add_property_hours/migration.sql`

## Project Structure

```text
src
├── ai/                   # tool validation, slot resolution, offer builder
├── controllers/          # thin HTTP controllers
├── integrations/         # OpenAI, Twilio, Cloudbeds, Redis clients/stubs
├── middleware/           # auth + error handling
├── offers/               # request schemas
├── prompts/              # system prompts
├── routes/               # route wiring
├── services/             # orchestration and commerce policy logic
├── ws/                   # websocket server wiring for Twilio media stream
└── index.ts              # server bootstrap
```

## Verification

After changes, run:
```bash
npx tsc --noEmit
pnpm test
```
