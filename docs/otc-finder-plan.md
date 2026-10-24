# OTC Finder: project plan

Status: planning reference with a small live POC. Updated: 2026-10-24.

The active bot is `@FindOTCAi` (bot ID `8731206462`), which replaced the original
bot on 2026-10-24. OTC Finder is the working name of the proposed product. The user has authorized a small,
silent monitoring POC for `@freemarket`; see [POC notes](otc-finder-poc.md).
The directory now supports verified bot-admin enrollment through Telegram's native
group picker. Calculated rankings remain future work.

## Goal

Help someone choose a Telegram marketplace group in which to advertise. Put free
and paid OTCs in one directory, show comparable information, and eventually rank
them using posting cost, activity, and the collectible assets present among
observed participants.

Confirmed requirements:

- **OTC price means Telegram Stars required to send one message in the group.**
  It is not a joining fee, subscription, or manually sold advertising package.
- The collectible signal concerns **group participants**, including admins:
  Telegram collectible gifts, collectible usernames, and anonymous-number NFTs.
  It does not mean giveaways or perks distributed by admins.
- The desired asset metric is the group's observed collectible holdings and their
  estimated market value. Keep this separate from claims about personal wealth,
  buying intent, or trustworthiness.

Here, an **OTC** means a Telegram chat where people post marketplace ads. The
initial scope is groups and supergroups. Channel support can be considered later.

The proposed primary audience is **advertisers deciding where to post**. Confirm
this before finalizing the ranking: buyers looking for products may need a
different definition of a good OTC.

## First version

Start with a small, curated directory of roughly 5-10 real OTCs. Establish useful
comparisons before trying to discover or measure every Telegram marketplace.

| Area | Initial behavior |
| --- | --- |
| Bot | `/start` and `/app` open the directory; `/top` provides a short list and a link to the Mini App. |
| Directory | One list containing free, paid, and price-unknown groups, with Stars/message shown directly. |
| Search and filters | Search by name; filter by free/paid, category, and language. |
| Group details | Stars/message, posting rules, activity, collectible audience metrics and coverage, evidence dates, and a button to open the group. |
| Ordering | Curated order during the data pilot; a clearly labeled calculated ranking once the scoring model is validated. |
| Maintenance | The project operator adds groups, checks prices, reviews corrections, and connects approved groups for measurement. |

An OTC owner who wants to change a listing must prove their relationship to that
chat. A directory visitor cannot update a price, approve a group, or change a
score by supplying an ID in a request body.

## What a listing should show

Keep the list compact. A row should answer: **What does it cost? Is it active?
Why is it placed here?**

- Group name, category, language, and public link or owner-approved invite link.
- Current general-user price, such as `Free` or `5 Stars/message`, with a check date.
- Member count, when available, with its capture date.
- Observed messages per day and unique active posters over the last seven days.
- A simple activity trend and a visibility/congestion indicator once supported.
- Observed collectible holders and gift counts, plus verified collectible
  usernames/anonymous-number counts when their data sources become available.
- Estimated value of observed assets when a valuation source is established,
  with its currency, timestamp, valuation method, and pricing coverage.
- Collection state: manual listing, collecting, measured, limited, or paused.
- Last verification date; score and a short explanation when eligible for ranking.

Example layout only; these are **not actual groups or measured numbers**:

```text
Example Marketplace                          Collecting
5 Stars/message · 120 observed messages/day · 38 active posters/7d
12 observed collectible holders · 90% gift-check coverage
Price checked Oct 18 · Open group →
```

Do not replace unavailable statistics with zero. A group can be listed before
there is enough evidence to give it a numerical rank.

## Pricing model

Store `starsPerMessage`, its source, its verification state, and `checkedAt`.
Use an explicit integer zero for confirmed free posting and an unavailable value
for unknown pricing. Show the general user's rate; an admin's exemption does not
make the group free for an advertiser.

Telegram provides the general-user rate as
`ChatFullInfo.paid_message_star_count`. Its `paid_message_price_changed` service
event can announce a changed rate. An observed message's `paid_star_count` is
evidence of what that particular sender paid, not necessarily everyone's rate.
[Sources: ChatFullInfo](https://core.telegram.org/bots/api#chatfullinfo),
[PaidMessagePriceChanged](https://core.telegram.org/bots/api#paidmessagepricechanged),
[Message](https://core.telegram.org/bots/api#message).

Refresh metadata and record price changes over time. Do not send a paid test
message to discover a rate. The [metrics plan](otc-finder-metrics.md) defines
the price and audience comparisons.

## How data enters the system

Use two clearly labeled sources:

1. **Reviewed information:** category, language, posting restrictions, and owner
   contact. Manual fallback prices must be labeled with their source and date.
   Owner submissions are proposals until reviewed.
2. **Observed information:** incoming group messages, permitted Telegram chat
   metadata, and accessible collectible records for known participants. Cache
   asset checks; a new message should not trigger a complete inventory scan.

The initial participant population is identifiable posters observed over seven
days. Do not promise a complete membership scan: the Bot API does not provide a
general endpoint to enumerate every group member. Asset data from participating
users who verify their own profiles can supplement this set, but must be labeled
as a different population.

Pilot gift inventories first. Username and anonymous-number ownership/value
need a separate verified source and feasibility check; the standard bot `User`
object is insufficient. See the metrics plan for capability details.

**An OTC must promote the bot to administrator to participate in monitoring.**
Verify this server-side, pause on loss of that status, and never announce
onboarding, collection, or removal inside the OTC. Privacy mode changes alone
do not satisfy this product's onboarding rule. Telegram's group privacy settings
also affect visibility; confirm setup before treating traffic as measured.
[Source: Telegram privacy mode](https://core.telegram.org/bots/features#privacy-mode).

A public group link alone is not a continuous message feed. Guest mentions are
also insufficient for a continuous collector.
[Source: Telegram guest bots](https://core.telegram.org/bots/features#guest-bots).

Plan for measurement **from connection onward**. Do not promise a backfill of
arbitrary group history using the Bot API. Historical exports, third-party data,
or another collection method require a separate design.

## Proposed implementation shape

Reuse the current vanilla JavaScript Mini App and tgcloud backend. No framework
change is needed for the directory.

| Existing area | Planned responsibility |
| --- | --- |
| Frontend (`src/`) | Directory, filters, group detail view, and operator controls. |
| `tgcloud/handlers/message.js` | Private bot commands; collect approved group events without replying to each group message. |
| `tgcloud/handlers/my_chat_member.js` | Track the collector being added, removed, or having its status changed. |
| `tgcloud/endpoints/` | Read listings and details; authorize operator-only changes. |
| `tgcloud/lib/` | Shared activity collection, Stars pricing, asset-source adapters, aggregation, and ranking logic. |
| `tgcloud/schema.js` | Directory records, price history, activity observations, asset snapshots, and aggregates. |

Proposed storage responsibilities, not final schema declarations:

- **OTCs:** stable internal ID, Telegram chat ID, listing metadata, publication
  state, connection state, and verification timestamps.
- **Price history:** Stars/message, source, effective time, and verification time.
- **Observations and aggregates:** event identity for deduplication; hourly/daily
  counts; per-group author keys for distinct-poster statistics; metadata snapshots.
- **Collection status:** visibility checks, known gaps, and permission changes.
- **Asset observations:** type, canonical asset identity, publicly observable or
  user-verified holder association, source, observation time, and completeness.
- **Valuations:** asset identity, estimate method, original currency, source,
  market timestamp, confidence, and availability. Unknown prices remain unknown.
- **Audience snapshots:** observed population size, scan coverage per asset type,
  verified holder counts, deduplicated assets, and optional valuation aggregates.
- **Ranking snapshots:** scoring version, window, inputs, components, explanation,
  and calculation time, once calculated ranking is introduced.

Store only the event metadata needed to calculate the chosen metrics. No raw ad
text, media downloads, or public participant lists are needed for the first
version. Later duplicate analysis would require a separate retention decision.

Use Telegram's verified endpoint context for caller identity and an explicit
operator allowlist for edits. Keep bot credentials out of the frontend. Follow
the existing SDK constraints: asynchronous DB calls, relative `.js` imports,
application-enforced relationships, and explicit schema migrations.

Collection runs on incoming events. Refresh metadata on an operator action or a
bounded, freshness-checked request; derive rolling totals when read. Do not
assume tgcloud provides a cron scheduler or a permanent background process.

## Delivery steps

1. **Select the pilot.** Choose participating groups and confirm the advertiser
   use case. Price and the intended collectible asset categories are settled.
2. **Build the directory.** Add curated records, search/filtering, group details,
   Stars/message, and operator maintenance. Label manual ordering honestly.
3. **Pilot measurement.** Connect a few participating groups, collect at least
   seven complete days, and verify counts, permissions, retries, and gaps.
   Prototype gift scans for known participants and measure their actual coverage.
4. **Validate ranking.** Compare real examples, choose thresholds and weights,
   then publish versioned scores and explanations. Keep unmeasured entries
   discoverable below the eligible ranked entries with an explicit status.
5. **Expand asset coverage.** Add verified collectible usernames and anonymous
   numbers only when an appropriate source exists. Add valuations after checking
   market data quality; retain counts and coverage when valuations are unavailable.

Use a separate test bot and checkout for collector development. Deploying or
migrating the linked production bot is a distinct later step. A test run that
executes real SDK calls can still have real effects.

## First-release acceptance criteria

- Free, paid, and unknown-price OTCs appear in the same searchable directory.
- Each posting price shows Stars/message and its verification date.
- Audience metrics show their population and per-asset check coverage; observed
  posters are never labeled as the entire group's membership.
- Asset valuations show source, currency, timestamp, and priced-asset coverage.
  No individual wealth scores or public member inventories are required.
- Every statistic is labeled as observed, reported, or unavailable.
- Only approved groups contribute observations; normal group traffic receives
  no echo replies from the collector.
- Duplicate deliveries do not inflate counts; message edits do not become new
  messages; retries and partial processing are covered by collection checks.
- Unknown, incomplete, and stale data are represented honestly.
- Visitors can understand why one eligible OTC ranks above another.
- Public reads and operator-only writes are separately authorized.

## Questions to settle

- Are we primarily helping advertisers, buyers, or both?
- Which initial OTCs should be listed, and can their owners connect the bot?
- Which categories and languages should the first release cover?
- Should owner-submitted information be accepted initially, or only operator input?
- Which source can verify collectible usernames and anonymous-number NFTs?
- Which market-data source and valuation currency should estimates use?
- Is the first version's observed-active-poster population sufficient, or should
  users also be able to connect and verify their own collectible holdings?

## Related documents

- [Metrics, collection limits, and ranking proposal](otc-finder-metrics.md)
- [Blockchain-linked gifts: research and inclusion](otc-finder-blockchain-gifts.md)
- [Existing tgcloud SDK reference](tgcloud-sdk.md)
