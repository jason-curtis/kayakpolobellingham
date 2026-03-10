# Kayak Polo Bellingham - Signup Tracker

Web app that tracks weekly kayak polo game signups. Players sign up via Groups.io email threads; the app parses those emails, tallies signups, and shows game status. 6+ players = game on.

Production: https://kayakpolosignups.option-zero.workers.dev

## How It Works

1. **Email inbound**: Cloudflare Email Worker receives forwarded Groups.io messages, calls `worker.ts` via service binding
2. **Parsing**: `lib/email-parser.ts` extracts game date and player signups (in/out/maybe) from subject + body
3. **LLM fallback**: When regex parsing fails, Gemini Flash Lite (via OpenRouter) handles conversational/ambiguous threads
4. **Hourly reconciliation**: Cron handler polls Groups.io API to catch anything the email pipeline missed
5. **Game-on notification**: When a game hits 6 signups, auto-emails the group via Groups.io API
6. **Web UI**: Next.js app shows upcoming games, signup counts, tide/weather conditions

## Code Layout

```
worker.ts              # Cloudflare Worker entrypoint (fetch, scheduled, handleEmail)
app/
  page.tsx             # Home — game list sidebar + detail view
  admin/               # Admin dashboard (manage games, regulars, trigger polls)
  games/[id]/          # Individual game detail page
  history/             # Past games
  stats/               # Attendance statistics
  components/
    GameCard.tsx        # Game card with signup list and status
    ConditionsCard.tsx  # Tide and weather display
  api/
    games/             # CRUD + signup endpoints
    regulars/          # Player roster
    stats/             # Attendance stats
    tides/             # Tide data
    admin/             # Admin-only endpoints (poll, backfill, debug, scrape)
lib/
  email-parser.ts      # Email parsing: date extraction, signup extraction, LLM fallback
  apply-inbound-email.ts  # Applies parsed signups to D1 (upsert games + signups)
  poll-groups-io.ts    # Hourly reconciliation poller
  groups-io-api.ts     # Groups.io REST API client
  game-on-notify.ts    # Game-on threshold check + email notification
  conditions-text.ts   # Tide/weather conditions formatting
  send-email.ts        # Send email via Groups.io API
  openrouter.ts        # LLM client (Gemini Flash Lite via OpenRouter)
  auth.ts              # Admin password auth
  d1.ts                # D1 database helpers
  logger.ts            # Structured logging
email-worker/          # Separate Cloudflare Email Worker (forwards to main worker)
db/
  schema.sql           # D1 schema (games, signups, regulars, scrapes)
scripts/               # Dev utilities (parse-signups, scrape-emails)
tests/                 # Playwright e2e tests
```

## Tech Stack

- **Runtime**: Cloudflare Workers + D1 (SQLite)
- **Frontend**: Next.js 15, React 19, Tailwind CSS (via OpenNext for CF Workers)
- **Email**: Cloudflare Email Workers + Groups.io API
- **LLM**: Gemini Flash Lite via OpenRouter (fallback parser)
- **CI**: GitHub Actions (build, test, typecheck on push)
- **Deploy**: Auto-deploy on push to `main` via Cloudflare GitHub integration

## Local Development

```bash
pnpm install
pnpm dev
```

Admin: http://localhost:3000/admin (default password: `changeme`)

## Deployment

Auto-deploys on push to `main`. **Never run `wrangler deploy` manually.**

Secrets (set via `wrangler secret put`):
- `GROUPS_IO_API_KEY` — Groups.io API access
- `OPENROUTER_API_KEY` — LLM fallback parsing

## Game Status Logic

- `game_on`: 6+ players signed in
- `need_more`: fewer than 6
- `cancelled`: admin-cancelled
