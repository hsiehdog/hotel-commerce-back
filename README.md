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
    - Canonical top-level (recommended): `{ property_id, channel, check_in, check_out, adults, rooms, ... }`
    - Compatibility shim: `{ slots: { ... } }`
  - Defaults when omitted: `property_id="demo_property"`, `channel="voice"`
  - Response: `{ data: { propertyId, channel, currency, priceBasisUsed, offers, fallbackAction?, presentationHints, decisionTrace, configVersion } }`
  - Validation errors:
    - `400` for invalid request schema/body
    - `422` for semantic clarification errors (e.g., missing/invalid date range)

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
- `src/services/commerce/normalizeOfferRequest.ts`
- `src/services/commerce/buildCommerceProfile.ts`
- `src/services/commerce/generateCandidates.ts`
- `src/services/commerce/filterCandidates.ts`
- `src/services/commerce/scoring/weights.ts`
- `src/services/commerce/scoring/scoreCandidates.ts`
- `src/services/commerce/selectArchetypeOffers.ts`
- `src/services/commerce/buildCommerceOffers.ts`
- `src/presentation/reasonCodeCopy.ts`

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

### Default Ranking Pipeline

The commerce engine runs this deterministic pipeline:

1. Normalize request
- Convert wrapped/top-level payloads into one canonical request shape.
- Canonical request includes dates, occupancy, currency, strategy mode, capabilities, and profile pre-ARI.

2. Build broad candidates
- Expand ARI into `(roomType x ratePlan)` candidate rows.

3. Apply hard filters
- occupancy fit
- restrictions (`cta`, `ctd`, `minLos`, `maxLos`)
- currency exact match (no FX)
- pricing basis validity

4. Basis-group scoring
- Prefer `afterTax` candidate group; fallback to `beforeTaxPlusTaxes`, then `beforeTax`.
- Selected basis group = candidates that passed hard filters and share the chosen basis.
- Score candidates deterministically (`value`, `conversion`, `experience`, `marginProxy`, `risk`) with profile+strategy weights.
- Component scoring rules:
  - Each component is normalized/clamped to `0..100`.
  - Normalization is computed within the selected basis group for the request.
  - `marginProxy` uses relative price position in the selected basis group (higher price => higher proxy).
- Deterministic tie-breakers (in order):
  - higher `scoreTotal`
  - higher `conversionScore`
  - lower total price
  - refundable over non-refundable
  - lexical `(roomTypeId, ratePlanId)`

5. Archetype selection
- Primary defaults to best `SAFE`.
- Saver-primary exception allowed only under low inventory + required price-delta threshold.
- Secondary is selected from opposite archetype if guardrails pass.
- Secondary selection must satisfy:
  - opposite archetype
  - same currency
  - same active pricing basis group
  - strategy price-spread guardrails (`%` and `$`)
  - guardrail formulas (current implementation):
    - absolute spread = `abs(primaryTotal - secondaryTotal)`
    - percent spread = `abs(primaryTotal - secondaryTotal) / min(primaryTotal, secondaryTotal)`
    - both thresholds must pass for the selected strategy mode

6. Attach enhancements
- Enhancements are attached after base ranking and do not alter selection.
- Family/space -> breakfast (`info`)
- Late-arrival/urgent -> late checkout (`request` + disclosure)

7. Fallback matrix
- If fewer than 2 offers remain, fallback action is selected from a deterministic channel/capability matrix.

8. Explainability
- Engine returns reason codes.
- Presentation layer maps reason codes to `decisionTrace` copy.

### Locked v1 Defaults

- Strategy mode defaults to `balanced` when no property config exists.
- Fallback capability defaults (when config missing): text-link + waitlist enabled, transfer requires configured property hours/timezone, booking URL defaults to `https://example.com/book`.
- Currency handling is strict exact-match (`candidate.currency === requestCurrency`), with no FX conversion.
- Occupancy normalization:
  - If `roomOccupancies` is omitted, guests are distributed across `rooms` (no empty rooms).
  - `rooms > totalGuests` is rejected in v1 unless explicit room-level occupancies are provided.
  - Per-room `childAges` is rejected in v1 (top-level `child_ages` only).
  - Any `roomOccupancies` row with zero guests is rejected.
- Basis handling is strict group selection:
  - Prefer `afterTax`
  - Else `beforeTaxPlusTaxes`
  - Else `beforeTax`
  - Never mix basis types across selected offers.
- SAFE/SAVER precedence:
  - `refundable` => SAFE
  - `non_refundable` => SAVER
  - fallback: `pay_at_property` => SAFE, `pay_now` => SAVER
- Saver-primary exception:
  - only when low inventory (`roomsAvailable <= 2`) and SAFE-vs-SAVER delta is at least 30%.
  - delta formula: `(safeTotal - saverTotal) / safeTotal >= 0.30`
  - exception is disabled when inventory availability is missing.
- Inventory state finalization:
  - pre-selection low-inventory signal for saver-primary uses best SAFE/SAVER candidate availability.
  - `low` when selected primary `roomsAvailable <= 2`
  - `normal` when selected primary `roomsAvailable > 2`
  - `unknown` when selected primary availability is missing
- Price spread guardrails by strategy mode:
  - `protect_rate`: `<=20%` and `<= $250`
  - `balanced`: `<=25%` and `<= $300`
  - `fill_rooms`: `<=35%` and `<= $400`
- Enhancements are attached post-selection and never alter base ranking.

### Fallback Matrix (v1)

- For `offersCount >= 2`: no fallback.
- For `offersCount == 1`:
  - `web`: `suggest_alternate_dates`
  - `voice`: `text_booking_link` if `canTextLink && hasWebBookingUrl`
  - else `voice`: `transfer_to_front_desk` if `canTransferToFrontDesk && isOpenNow`
  - else: `suggest_alternate_dates`
- For `offersCount == 0`:
  - `web`: `contact_property` if `hasWebBookingUrl`, else `suggest_alternate_dates`
  - `voice`: `transfer_to_front_desk` if `canTransferToFrontDesk && isOpenNow`
  - else `text_booking_link` if `canTextLink && hasWebBookingUrl`
  - else `collect_waitlist` if `canCollectWaitlist`
  - else: `suggest_alternate_dates`

### Response Contract

`/offers/generate` returns a commerce-oriented contract:
- `propertyId`
- `channel`
- `currency`
- `priceBasisUsed`
- `offers` (0-2)
  - `offers[].pricing` is basis-aware:
    - `afterTax` / `beforeTaxPlusTaxes`: `{ basis, total, totalAfterTax }`
    - `beforeTax`: `{ basis, total }`
- `fallbackAction` (when fewer than 2 offers remain)
- `presentationHints` (includes structured urgency when sourced)
- `decisionTrace` (human-readable deterministic reasons)
- `configVersion` (resolved commerce config version)

When `debug: true` is passed, response also includes:
- `debug.resolvedRequest`
- `debug.profilePreAri`
- `debug.profileFinal`
- `debug.selectionSummary`
- `debug.reasonCodes`
- `debug.topCandidates` (capped list; includes `roomsAvailable`, `riskContributors`, scoring components)

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

Standard request (canonical top-level):
```bash
curl -sS "$BASE_URL/offers/generate" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "property_id": "demo_property",
    "channel": "voice",
    "check_in": "2026-02-10",
    "check_out": "2026-02-12",
    "adults": 2,
    "rooms": 1
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

## Scenario Examples (Commerce Brain)

Use these requests to verify decision-engine behavior.

1. Family weekend: SAFE primary + family enhancement
```bash
curl -sS "$BASE_URL/offers/generate" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "property_id": "cb_123",
    "channel": "voice",
    "check_in": "2026-04-10",
    "check_out": "2026-04-13",
    "rooms": 1,
    "adults": 2,
    "children": 2,
    "child_ages": [7,10],
    "preferences": { "needs_space": true }
  }' | jq '.data | {offers: .offers, presentationHints: .presentationHints, decisionTrace: .decisionTrace}'
```
Expected:
- `offers[0].type = "SAFE"`
- `offers[0].enhancements[0].availability = "info"`

2. Compression weekend: saver-primary exception + factual urgency
```bash
curl -sS "$BASE_URL/offers/generate" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "property_id": "cb_123",
    "channel": "voice",
    "check_in": "2026-05-22",
    "check_out": "2026-05-25",
    "rooms": 1,
    "adults": 2
  }' | jq '.data | {offers: .offers, presentationHints: .presentationHints, decisionTrace: .decisionTrace}'
```
Expected:
- `offers[0].type = "SAVER"`
- `offers[0].urgency.type = "scarcity_rooms"`

3. Business late arrival: convenience enhancement as request-only
```bash
curl -sS "$BASE_URL/offers/generate" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "property_id": "cb_123",
    "channel": "voice",
    "check_in": "2026-03-17",
    "check_out": "2026-03-18",
    "rooms": 1,
    "adults": 1,
    "preferences": { "late_arrival": true }
  }' | jq '.data | {offers: .offers, presentationHints: .presentationHints, decisionTrace: .decisionTrace}'
```
Expected:
- `offers[0].type = "SAFE"`
- `offers[0].enhancements[0].availability = "request"`
- enhancement disclosure mentions availability at check-in

4. Constraint weekend: one offer + fallback action
```bash
curl -sS "$BASE_URL/offers/generate" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "property_id": "cb_123",
    "channel": "voice",
    "check_in": "2026-05-23",
    "check_out": "2026-05-24",
    "rooms": 1,
    "adults": 2
  }' | jq '.data | {offers: .offers, fallbackAction: .fallbackAction, decisionTrace: .decisionTrace}'
```
Expected:
- `offers | length` is `1`
- `fallbackAction` is present (typically `text_booking_link` when capabilities allow)

5. Currency mismatch: strict invalidation + graceful fallback
```bash
curl -sS "$BASE_URL/offers/generate" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{
    "property_id": "cb_999",
    "channel": "voice",
    "check_in": "2026-06-05",
    "check_out": "2026-06-07",
    "rooms": 1,
    "adults": 2,
    "currency": "USD"
  }' | jq '.data | {offers: .offers, fallbackAction: .fallbackAction, decisionTrace: .decisionTrace}'
```
Expected:
- one comparable offer remains
- `fallbackAction` present due to filtered mismatched-currency candidates

## Database Schema Notes

Prisma models include:
- Better Auth tables (`users`, `auth_sessions`, `auth_accounts`, `auth_verifications`)
- Commerce support tables:
  - `properties`
  - `property_hours`
  - `property_commerce_config`
  - `room_tier_overrides`

Recent migration:
- `prisma/migrations/20260209123000_add_property_hours/migration.sql`
- `prisma/migrations/20260210182000_add_commerce_config/migration.sql`
- `prisma/migrations/20260210184000_add_capability_fields/migration.sql`

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
