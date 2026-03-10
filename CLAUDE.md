# Kayak Polo Bellingham

Kayak polo signup tracker. Parses Groups.io email threads, tallies signups, shows game status.

## Quick Reference

- **Deploy**: auto on push to `main` — never run `wrangler deploy` manually
- **D1 database**: `kayakpolo` (id: `b2a2e2bf-5b93-4c52-b2b3-94b15587addd`)
- **Query prod D1**: `npx wrangler d1 execute kayakpolo --remote --command "SQL"`
- **CI**: `.github/workflows/ci.yml` — `pnpm test`, typecheck, build
- **Tests**: `pnpm test` (vitest unit), `pnpm exec playwright test` (e2e)
- **Package manager**: pnpm

## Architecture

Cloudflare Workers + D1 + Next.js (via OpenNext). Two workers:

1. **Main worker** (`worker.ts`): Next.js fetch + scheduled cron + `handleEmail` RPC
2. **Email worker** (`email-worker/`): receives forwarded emails, calls main worker via service binding

### Email → Signup Pipeline

```
Groups.io email → Email Worker → worker.handleEmail()
  → email-parser.parseGameMessage() — extracts date + signups
  → apply-inbound-email.applyInboundEmail() — upserts to D1
  → game-on-notify.checkAndNotify() — sends "game on" at 6 players
```

Hourly cron runs `poll-groups-io.ts` as backup reconciliation.

### Date Extraction Cascade (email-parser.ts)

MM/DD/YY → MM/DD → month name → day+ordinal → day-name-only → body fallback → LLM

### Signup Parsing

Regex patterns for: "I'm in", "Name in", "can make/do [time]", possessives, G-in, etc.
Falls back to Gemini Flash Lite (via `lib/openrouter.ts`) for ambiguous messages.

## Key Files

| File | Purpose |
|------|---------|
| `worker.ts` | Worker entrypoint (fetch, cron, email RPC) |
| `app/page.tsx` | Home page (game list + detail) |
| `app/components/GameCard.tsx` | Game card with signups and status |
| `app/components/ConditionsCard.tsx` | Tide/weather display |
| `lib/email-parser.ts` | Email parsing (dates, signups, LLM fallback) |
| `lib/apply-inbound-email.ts` | Apply parsed signups to D1 |
| `lib/poll-groups-io.ts` | Hourly reconciliation poller |
| `lib/game-on-notify.ts` | Game-on threshold + notification |
| `lib/conditions-text.ts` | Tide/weather text formatting |
| `lib/groups-io-api.ts` | Groups.io REST client |
| `lib/send-email.ts` | Send email via Groups.io |
| `db/schema.sql` | D1 schema |

## Game Status

- 6+ "in" signups → `game_on` ("Game on!")
- Fewer → `need_more` ("Have N, need M more")
- Admin action → `cancelled`

## Secrets

Set via `wrangler secret put`:
- `GROUPS_IO_API_KEY`
- `OPENROUTER_API_KEY`
