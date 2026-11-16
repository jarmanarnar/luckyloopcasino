# Achievement account service

The optional account server stores authentication, achievement progress, claims and demo wallet credits in SQLite. The browser reads one server snapshot; it cannot submit verified flags, totals, prize amounts or spin outcomes. The existing static preview continues to use its separate IndexedDB account. **Neither mode is a real-money casino backend.**

## Start locally

Use Node 24 or newer and run `npm run start:accounts` from this project. It serves the same interface at `http://127.0.0.1:4324/luckyloopcasino/`. The database defaults to `.local/accounts.sqlite`, outside the public directory and excluded from Git. `.env.example` lists the optional configuration; `npm run start:accounts` reads `.env` if present.

This is a separate server account: register or log in with its email/password form. It never imports browser balances, claimed flags or locally asserted verification. The existing preview and its saved account are retained. Static GitHub Pages cannot execute this server; enabling it on a hosted domain requires a Node service, persistent storage, HTTPS, the exact `ACCOUNT_ORIGIN`, and a reverse proxy forwarding the original Host header. Back up SQLite using its supported backup mechanism, including WAL consistency.

## What is connected in code

- Server-side sessions, password hashing, account persistence and serialized reward claims. Session cookies are HttpOnly and SameSite=Strict, and Secure on HTTPS. Mutations require the configured Origin and the currently authenticated player ID. The server selects wheel prizes and achievement rewards.
- A signed server-to-server game-event endpoint. Play and loyalty totals are independent integer SC hundredths, and one settled round counts once. Reversed rounds subtract their original contribution; reversal-before-settlement records a tombstone. Duplicate deliveries do not change totals. Conflicting round data or another player's round ID returns 409. Already collected rewards remain in the ledger and cannot be collected again after reversal.
- A Twilio Verify adapter for email and phone. Only an approved Verification Check can set a verification flag. Registration and sending a code do not verify anything. Codes are scoped to the account, channel and server-held provider verification ID, expire after ten minutes and allow at most five checks. Requests have account/contact/IP limits, including a one-minute resend delay. A pending response cannot verify a logged-out account or a replaced challenge. One verified contact cannot unlock multiple accounts.
- A shared verification dialog, achievement details, the Rewards badge and wallet all consume the same account. Server updates refresh on focus, visibility, cross-tab notifications and a 15-second visible-page poll. Claiming updates both currencies in one transaction.

## External setup still required

No paid service was created, no live email/SMS was sent, and no game provider account was connected. Without configuration, verification reports unavailable and public game demos do not generate progress.

For verification, configure a Twilio Verify Service and set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` on the server. List only provisioned channels in `VERIFICATION_CHANNELS`, for example `email,phone`. Email also needs the Verify service's SendGrid sender/template integration. See the official [start verification](https://www.twilio.com/docs/verify/api/verification) and [check verification](https://www.twilio.com/docs/verify/api/verification-check) contracts. The adapter has no client-side secret or dummy-code fallback.

For gameplay, obtain an operator/aggregator integration with authenticated player sessions and wallet/round callbacks. That provider's contract, credentials and qualification rules are not available in this project. Its trusted server adapter must validate provider callbacks, map the operator's player ID to the server account ID, finish aggregation for a round, and send the normalized event below. **The HMAC endpoint is our adapter contract, not an endpoint an arbitrary provider can call without integration.** Public demo iframe messages, frame loads and the local demo wallet are never used as evidence of wagers. No new SC game launcher, wager debit, payout or operator wallet has been added.

## Game adapter contract

`POST /luckyloopcasino/api/game-events`, JSON body, server-to-server only:

```json
{
  "type": "round.settled",
  "provider": "operator-name",
  "roundId": "stable-provider-round-id",
  "playerId": "member-ACCOUNT-UUID",
  "currency": "SC",
  "wagerUnits": 10000,
  "playSCUnits": 7000,
  "loyaltySCUnits": 10000
}
```

This example represents a 100 SC wager, 70 SC qualifying for play achievements, and 100 SC qualifying for loyalty. Those values are illustrative; the adapter must calculate them from the provider's confirmed transactions and the chosen qualification policy. Both contributions must be nonnegative safe integers no greater than the wager, and must be zero for GC rounds. Distinct counters intentionally do not assume identical qualification rules.

Sign the exact UTF-8 request body with `HMAC-SHA256(GAME_EVENT_SECRET, timestamp + '.' + rawBody)`. Headers: `X-COP-Timestamp` (Unix seconds) and `X-COP-Signature` (lowercase hex). Timestamp skew must not exceed five minutes. Use a random secret of at least 32 characters shared only with the trusted server adapter. A retry should use a fresh signature with the same round ID and amounts.

Reversal body: `{"type":"round.reversed","provider":"operator-name","roundId":"stable-provider-round-id","playerId":"member-ACCOUNT-UUID"}`. Provider/round ID is globally unique within this database and cannot be reassigned. Round data is retained for duplicate protection. The endpoint does not accept verification events; those use the provider check flow instead.

## Validation and limits

`tests/account-api.test.mjs` exercises authenticated requests, signed rounds, replay/conflict/reversal handling, persistence, concurrent claims, verification approval/failure/expiry/rate limits and logout during provider approval. The external service is replaced by an isolated test transport; these tests do not establish actual Twilio delivery or a live provider connection. Browser QA uses an isolated in-memory account and fake delivery, never the user's preview account.

All coin credits remain demo credits. This foundation has no password recovery, payment integration, redemption, operator wallet, multi-region storage or deployment. Those require separate integrations before a production launch. Server attendance uses the server's configured timezone; choose a consistent deployment timezone before accepting member traffic.
