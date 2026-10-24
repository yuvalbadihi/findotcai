# Deep code review — 24 October 2026

Completed and deployed to **@FindOTCAi**, revision **13**. Reviewed enrollment,
event ordering, permissions, gifts/pricing, telemetry, schema integrity,
authentication, public reads, likes and browser state.

## Findings and fixes

| Priority | Finding | Implemented change |
| --- | --- | --- |
| High | Membership/price events in one second could arrive out of order. An older metadata request could overwrite a newer event or successful refresh. | Compare event dates, then Telegram update IDs within the same second. Version metadata claims and guard completion/failure. Dates take precedence because Telegram can restart update IDs after inactivity. |
| High | A refresh lease let concurrent handlers use expired administrator verification. | Separate verification freshness from the work lease. Message inserts atomically check the chat revision and fresh administrator state. |
| High | Demoted/departed groups stayed public and likeable. | Exclude known removals, reject new likes and invalidate scans. Users can still unlike a hidden OTC without receiving its hidden counts. |
| High | Expired gift scans could publish after their replacements. | Version poster/admin scans; guard writes, deletion, failure and publication. Admin publication also checks chat revision, permissions and the final admin roster. |
| Medium | Timestamp-based inventory replacement retained obsolete gifts after same-second scans; burned items were counted. | Replace by scan version, exclude burned gifts and retain gift-name transfer deduplication. Continue including blockchain-linked profile gifts. |
| Medium | Directory reads performed remote enrichment and repeated SQL per OTC. | Make reads database-only: four aggregate queries for any nonempty directory. Move bounded maintenance to a separately authenticated endpoint with global leases. |
| Medium | Each scan downloaded the same public floor feed. | Shared five-minute catalogue cache, versioned fetch lease and failure backoff. Preserve quote dates and an older dated estimate when no usable replacement exists. |
| Medium | Omitted posting-price fields became unknown instead of free. | Map an omitted field to zero, matching Telegram's official serializer; reject explicitly invalid prices. |
| Medium | Number conversion could lose precision when sorting/displaying large valuations. | Use BigInt for sorting and exact rounding to two decimals in full values. Compact notation remains approximate. |
| Medium | Future events entered current aggregates, and coverage could look continuous after pauses. | Bound aggregate queries by current time. Track continuous coverage separately and reset on failure/removal/reconnection. |
| Medium | Retention depended on successful refreshes of each chat. | Globally leased cleanup plus a timestamp index; clean unused telemetry even for departed chats. |
| Medium | One like per user/OTC relied only on application-generated IDs. | Unique database index on `(chat_id, user_id)`; retain idempotent set/unset operations. |
| Medium | Invalid successful responses could clear the list; delayed reads could undo newer likes. | Validate before replacing state, retain the last list on background errors and preserve newer/pending like state across older reads. Handle unlikes after unlisting. |
| Low | Frontend transport/state/rendering were combined; starter echo/hello behavior remained. | Extract transport/validation, cards and DOM reconciliation. Remove hello; private text opens the app launcher. Group/channel paths stay silent. |

## Structure and app design

- `chat-state.js`: enrollment, metadata, event ordering and verification leases.
- `gift-inventory.js`: poster checks and bounded, paginated all-admin scans.
- `gift-valuation.js`: shared catalogue cache and collection-floor estimates.
- `otc.js`: collection and compatible operator helper names.
- `otc-stats.js`: aggregate DTOs and separate operator diagnostics.
- `otc-directory.js`: database-only public reads.
- `maintenance.js`: globally leased metadata/inventory work and retention cleanup.
- Frontend: `main.js` controls state, `telegram.js` handles SDK transport and
  validation, `cards.js` renders cards, `ui.js` reconciles existing DOM nodes.

The minimal one-page layout remains. Compact cards prioritize price, likes,
daily messages and admin gift value. Normal adds members, gift count, known
language and estimate age. Large shows exact values and key activity details
once. Technical inventory diagnostics stay outside the public cards.

Visible, online clients poll every ten seconds. Unchanged cards receive no DOM
mutations; changed values patch in place. Controls, images, focus, scroll, filters,
theme and density survive updates. Maintenance is separate, with one in-flight
maintenance request per client and database leases across clients. Session expiry
stops automatic requests. Hidden/offline clients catch up on return.

## Database migration and live evidence

Backed up production modules and all five existing tables before changes, to a
local JSON file kept outside the repository. The operational-data backup contains
no credentials. It is a recovery snapshot; a restore has not been exercised.

Published the schema alone at revision 12, inspected `migrate --dry-run`, then
applied **12 additive changes** with `migrate --safe`:

- Chat revision, metadata lease, admin-scan version, continuous coverage start,
  membership/price update IDs and price-event date.
- Poster-check version and observed-gift version.
- Unique viewer/OTC like index and message-retention index.
- Shared runtime cache/lease table.

No tables/columns were dropped or rebuilt. Backfilled the existing active chat's
coverage start from its latest verification, conservatively avoiding an assumption
of uninterrupted historical coverage. Preserved telemetry/likes and refreshed the
dated admin snapshot. Published code/static assets together at revision 13.
No temporary operator module was deployed.

Live checks:

- One OTC; **12 message records, six poster checks, 100 observed gift records and
  one like** preserved.
- Free Market admin access verified; **38/38 admin inventories complete**, **1,766
  gifts priced**, approximately **309,316.67 Gram** at verification time. This is a
  dated collection-floor estimate, not a sale-price guarantee.
- Stats operator call succeeded in **20 ms** in one sampled run; this is not a
  latency SLA.
- Public HTML/JS/CSS returned 200. All three endpoints rejected missing Telegram
  init data with 401. CLI reported current code/static, synced webhook and no
  pending schema changes.
- No messages were posted to any OTC during review or verification.

## Regression evidence

**55 automated tests pass**, using real SQLite constraints and deterministic
clocks. Coverage includes delayed/out-of-order events, expired leases, stale
failures, same-second replacement, burned gifts, roster changes, cross-OTC
isolation, private/demoted visibility, authentication, idempotent likes, retention,
future timestamps and cache reuse.

The directory regression reads **100 OTCs in four queries with zero Bot API
calls**. This checks query growth, not sustained production concurrency.

`npm run test:browser` provides repeatable Playwright checks for quiet polling,
DOM identity, stale-response/like races, invalid payload retention, maintenance
concurrency/completion, hidden/offline behavior, expiry, reduced motion, all three
densities at 320/390/768 px, themes, unlikes after unlisting and native bot-add links.
Browser calls are mocked; deployed authentication is checked separately at its HTTP
boundary. An additional browser review checked content relevance and
missing/partial/paused states. Production build succeeds. npm audit reported no
known dependency vulnerabilities at review time.

## Remaining limits and next decisions

- Floor estimates cover **visible profile gifts**, including blockchain-linked
  gifts returned by Telegram. They do not establish whole-wallet ownership,
  include rarity premiums or prove sale proceeds. Hidden gifts remain unknown.
  Admin scans cap work at 120 requests, ten pages/admin and five parallel reads;
  larger inventories remain explicitly partial.
- Ten-second polling updates the display; it does not rescan all inventories every
  ten seconds. Metadata verification lasts five minutes; admin snapshots normally
  last one hour. Membership events invalidate known removals immediately. Missed
  events can leave cached visibility until metadata refresh discovers the change;
  expired verification cannot collect messages.
- Directory maintenance is opportunistic and driven by viewers, rather than a
  durable scheduled worker. Incoming messages also refresh due chat metadata and
  poster checks. Global physical retention cleanup runs on the next maintenance
  invocation, at most hourly. Public queries enforce rolling windows independently
  of physical cleanup.
- Maintenance refreshes one due metadata row per globally leased pass. At larger
  directory sizes, measure the backlog and introduce bounded batches or scheduled
  work. The full catalogue currently reaches the browser; add pagination as needed.
- Bot updates provide new observable activity, not historical chat backfill or a
  complete member inventory. Language requires sufficient new text and remains an
  estimate. Message text is not persisted or sent to a language API.
- Recommendation/trust ranking remains a product decision. Likes, price, activity
  and visible admin wealth are separate sortable metrics; no invented trust score
  was introduced.

Technical references: [Telegram update ordering](https://core.telegram.org/bots/api#update),
[official Bot API serializer](https://github.com/tdlib/telegram-bot-api/blob/master/telegram-bot-api/Client.cpp),
[official Mini App SDK](https://telegram.org/js/telegram-web-app.js), and the local
[serverless SDK reference](tgcloud-sdk.md).
