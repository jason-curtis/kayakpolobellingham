# Testing

## Unit tests (refactor safety)

Parser and apply-layer logic are covered by Vitest so refactors stay safe.

```bash
pnpm test
```

- **`lib/email-parser.test.ts`** – `resolveName`, `resolveSender`, `extractSenderName`, `stripQuotedText`, `parseSignupsFromMessage`, `extractGameDate`, `isGameTopic`, `parseDateFromTitle`, `parseRosterFromGameOn`, `parseInboundEmail`, `aggregateTopicsIntoGames`.
- **`lib/apply-inbound-email.test.ts`** – `applyInboundEmail` with mocked D1: no-op when no date/signups, uses existing game and calls `addSignup`, creates game when missing then adds signups.

CI runs `pnpm test` before `pnpm run build`.

## E2E (Playwright)

```bash
pnpm run test:e2e
```

Covers the main app (pages, signup flow, admin). Does not drive the email worker or RPC.

## Validating the new email / RPC setup

1. **Parser and apply logic** – Covered by unit tests above.
2. **Batch script** – With real scraped data:
   ```bash
   # Ensure scripts/data/emails.json exists (e.g. from scrape-emails), then:
   pnpm exec tsx scripts/parse-signups.ts
   ```
   Check `scripts/data/parsed-games.json` for expected dates and players.
3. **Worker RPC and email worker** – Best checked in a deployed (or preview) environment:
   - Deploy main app and email worker (e.g. via Cloudflare; worker lives in `email-worker/`).
   - Add a test address to the email worker allow list.
   - Send a test email with a game-like subject (e.g. “Sunday 3/2/26 – post in or out”) and body “I’m in”.
   - Confirm the main app’s `handleEmail` ran (e.g. new/updated game and signup in D1, or logs).
   - Optionally call the RPC from a small script using a service binding or `wrangler dev` + `fetch` to the worker’s `handleEmail` if you expose a test route that forwards to it.
