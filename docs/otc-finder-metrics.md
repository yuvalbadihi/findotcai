# OTC Finder: metrics and ranking proposal

Status: proposed design. Update 2026-10-24: a first version of the Stage 2 score
ships as OTC Rank, using the signals measured today; see the
[POC notes](otc-finder-poc.md). Updated: 2026-10-18. See the [project plan](otc-finder-plan.md).

POC update, 2026-10-19: the Free Market card now includes a TON collection-floor
estimate for accessible unique gifts across its non-bot admins, using Thermos.
This is separate from the observed-poster population and from the proposed
ranking. See [POC implementation and limits](otc-finder-poc.md).

POC update, 2026-10-24: the admin total now includes blockchain-linked gifts shown
on profiles. This is visible-profile value with no claim of verified wallet
ownership. See [blockchain inclusion research](otc-finder-blockchain-gifts.md).

## What makes an OTC useful?

Confirmed product inputs: **Telegram Stars per message**, group activity, and
collectible assets associated with participants: gifts, collectible usernames,
and anonymous-number NFTs. The asset requirement applies to participants
generally, not just admins; it does not mean giveaways or advertiser perks.

For an advertiser, a useful OTC has relevant collectible participation, sustained
activity, usable ad visibility, and a reasonable per-message fee. The working
definition of **top** will combine those signals. Asset estimates describe the
observed collectibles, not an individual's wealth, ability to buy, or reliability.

## First metrics to collect

| Metric | Definition / source | How to use it |
| --- | --- | --- |
| Posting price | Current general-user rate, in Telegram Stars per message, with source and verification time. | Compare the same unit across free and paid OTCs. |
| Member count | Timestamped `getChatMemberCount` snapshot, where accessible. | Context and growth baseline; not estimated ad impressions. |
| Observed messages/day | New, non-service, non-bot messages received during each full collection day. | Show traffic; display the seven-day daily average and recent trend. |
| Active posters/7d | Distinct identifiable human senders with a qualifying message in the rolling window. | Measure participation beyond raw member count. |
| Observed collectible holders | Distinct observed participants with at least one verified asset in a supported category. | Describe the collectible audience without counting one frequent poster repeatedly. |
| Collectible inventory | Deduplicated observed unique gifts; usernames and anonymous-number NFTs when independently verified. | Show each asset category separately and label coverage. |
| Holder share | Verified observed holders / successfully checked observed participants, for a specified asset category. | Show audience composition alongside the checked/eligible sample sizes. |
| Estimated observed asset value | Sum of eligible, deduplicated asset valuations from an approved source, in a single declared currency. | A group aggregate with valuation and population coverage, not total group wealth. |
| Active days/7d | Number of fully observed days with qualifying traffic. | Distinguish sustained activity from one short burst. |
| Traffic by hour | Qualifying messages grouped into UTC hourly buckets, displayed in the viewer's timezone. | Show busy periods and help assess congestion. |
| Posting rules | Reviewed cooldown, allowed post types, topic restrictions, approvals, and pin duration where offered. | Help advertisers decide whether the group fits their ad. |
| Admin identity / contact | Accessible administrator metadata and reviewed contact information. | Describe who operates the group; not a trust score by itself. |
| Freshness and collection state | Observation start, most recent event, last successful metadata check, known visibility changes, and known gaps. | Explain which statistics are comparable. |

Telegram exposes chat metadata, member counts, and administrator information.
Handle unavailable calls explicitly.
[Sources: getChat](https://core.telegram.org/bots/api#getchat),
[getChatMemberCount](https://core.telegram.org/bots/api#getchatmembercount),
[getChatAdministrators](https://core.telegram.org/bots/api#getchatadministrators).

An anonymous or chat-authored message may not expose an identifiable human
sender. Count the message when appropriate, but do not turn it into a distinct
human or an invented user identity.
[Source: Message](https://core.telegram.org/bots/api#message).

## What we can check with Telegram

| Requirement | Current capability | Plan |
| --- | --- | --- |
| Stars/message | `ChatFullInfo.paid_message_star_count` and `PaidMessagePriceChanged`. | Read the general-user rate, record changes, and re-check freshness. |
| What a sender paid for one message | `Message.paid_star_count`, when present. | Use as supporting evidence, not a replacement for the general-user rate. |
| Telegram gifts for a known user | `getUserGifts` returns owned/hosted gifts with pagination. | Pilot accessible inventories, count unique gifts separately from regular gifts, and preserve completeness. |
| Every group member | No general full-roster enumeration endpoint in the Bot API. | Start from identifiable observed posters; do not claim every member was checked. |
| Collectible username ownership | An ordinary `username` field does not establish collectible status or purchase value. | Add only after an asset-specific verification source is selected. |
| Anonymous-number NFTs | Not supplied as a general holdings list on the bot `User` object. | Do not infer phone-number ownership from a user ID or username. |

[Sources: ChatFullInfo](https://core.telegram.org/bots/api#chatfullinfo),
[PaidMessagePriceChanged](https://core.telegram.org/bots/api#paidmessagepricechanged),
[getUserGifts](https://core.telegram.org/bots/api#getusergifts),
[User](https://core.telegram.org/bots/api#user),
[getChatMember](https://core.telegram.org/bots/api#getchatmember).

Telegram's separate MTProto `fragment.getCollectibleInfo` method can describe a
visible collectible username or phone-number collectible, but it is explicitly
**user-only**, not a Bot API method callable through `sdk.api`. Its purchase price
is historical information, not a current market valuation.
[Sources: fragment.getCollectibleInfo](https://core.telegram.org/method/fragment.getCollectibleInfo),
[Fragment collectibles](https://core.telegram.org/api/fragment).

This makes username/number verification a separate integration decision. The
first version does not assume a user-session collector or that every asset
category is available. Publicly observable records or holdings voluntarily
verified by the asset holder can supply evidence; a wallet or displayed asset
must not be attributed to a Telegram account without proof of the association.

## Population and coverage

Use a named population: **identifiable active posters observed in the last seven
complete days**. Bot accounts and anonymous chat identities are excluded from
the human-asset denominator. A separately consented participant population must
not silently replace this one.

For each asset type, report:

- Eligible observed participants, successfully checked participants, and checks
  that were unavailable, failed, partial, or stale.
- Distinct holders with confirmed assets and deduplicated asset counts.
- `check coverage = complete, fresh checks / eligible observed participants`.
- `holder share = confirmed holders / complete, fresh checks` for that category.
- Pricing coverage for the observed assets, separately from participant coverage.

Only compute a cross-category holder share if all included asset types have been
checked for the same participants. Otherwise show category-specific statistics.
Hidden or inaccessible inventories are unknown, not confirmed empty inventories.
Complete pagination only establishes completeness of the accessible API result,
not all assets a person may own elsewhere.

Example only: 1,000 members, 100 observed posters, 80 complete gift checks, and
30 visible gift holders. Display **30 holders among 80 checked posters; 80% check
coverage of 100 observed posters**. Do not label this as 30% of all group members
or extrapolate a group-wide value from it. Visible gift holders and independent
human owners are different concepts: one person can operate multiple accounts.

## Later metrics worth piloting

| Candidate | Why it could help | Limitation |
| --- | --- | --- |
| Repeated-ad share | Detect a feed dominated by the same ads or frequent bumps. | Legitimate repeated ads exist. Needs an agreed time window and content-fingerprint retention policy. |
| Poster concentration | Share of messages from the most active few posters. | High traffic from two accounts is different from broad participation; it does not prove manipulation. |
| Cross-person reply rate | Fraction of eligible messages receiving a reply from another identifiable person. | Replies are a conversation proxy, not purchases; private responses are unseen. |
| Time before an ad is buried | Time until, for example, ten newer qualifying messages arrive after an observed ad. | Requires identifying ads and handling messages whose observation window has not finished. It is a feed-congestion proxy, not reading time. |
| Member growth | Difference between comparable member snapshots over time. | Increases can include inactive or artificial accounts. |
| Reactions | Observed reaction activity where available. | Needs the required permissions and update subscriptions; not all chats use reactions. |
| Advertiser outcomes | Voluntary, reviewed reports of useful inquiries or completed deals. | Self-selection and unverifiable claims; out of the initial score. |
| Admin response time | Response to an identifiable advertiser request. | Must define a request and response; raw admin message counts are not responsiveness. |

Reaction updates have specific admin and subscription requirements.
[Source: Update](https://core.telegram.org/bots/api#update).

## Asset valuation rules

Begin with counts and ownership/visibility evidence. Introduce monetary estimates
only when a usable market-data source is selected and validated.

- Store canonical asset identity, category, source, observation time, and proof
  of any holder association. Distinguish API-visible/hosted assets from verified
  transferable ownership; only the agreed evidence level enters valuations.
- Gifts must distinguish regular gifts from unique collectible gifts. A gift's
  original Stars purchase or upgrade cost is not its current resale value.
- Keep **recent completed sale**, **collection floor**, **asking price**, and
  **model estimate** as different valuation methods. Do not label an unsold
  listing or an old purchase as a recent realized market price.
- Every valuation needs a source, currency, timestamp, confidence, and the rule
  used to select comparable items. An asset without usable pricing is unpriced,
  not worth zero. A floor estimate is an estimate, not guaranteed sale proceeds.
- Separate Stars/message from asset valuation currency. Do not sum TON, Stars,
  and fiat values or use an undocumented fixed conversion rate. Retain original
  quotes and use timestamped conversion evidence if a common unit is introduced.
- Deduplicate an asset seen on a profile and on-chain. Snapshot transfers and
  observation times so one asset is not counted for multiple holders within one
  group snapshot. An asset can appear in two group-specific audience snapshots
  if its holder is active in both; do not sum those as unique network-wide assets.
- Display group-level estimated total, per-category totals, asset counts, priced
  asset coverage, and freshness. Use aggregate concentration indicators to show
  whether a small number of holdings dominates the estimate.
- Do not publish member wealth leaderboards or classify individual members by
  spending power. The product compares OTC audiences and observable assets.

Price-source discovery, credentials, quotas, refresh cost, and support for the
three asset types are implementation gates, not capabilities already available
in this project. Username and number valuations may remain unavailable while
gift counts and group activity ship.

## Collection rules

- Start with approved groups where the bot's message visibility is confirmed.
- Keep observed human traffic separate from bot traffic. Bot-to-bot visibility
  depends on Telegram settings, so do not label our count as every message in
  the group. [Source: Bot-to-Bot Communication](https://core.telegram.org/bots/features#bot-to-bot-communication).
- Exclude service events, collector commands, and this bot's own activity from
  advertising activity counts. Publish the exclusion rules with the score version.
- Deduplicate delivery using a stable event/message key. An edited message
  updates known metadata; it does not increase the count of new messages.
- Use atomic, retry-safe writes. Before implementing counters, verify the SDK's
  supported atomic operations; a separate dedupe insert followed by an
  unprotected increment can lose or double-count work after a failure.
- Timestamp by Telegram event time and store UTC buckets. Use a consistent
  cutoff for comparing all groups. Retain at least 30 days of useful aggregates
  for trend comparisons, subject to a final retention decision.
- Full-day averages exclude the partial first day and today's incomplete day.
  Show today's count separately if useful. Distinct posters must be deduplicated
  across the whole window; summing daily unique counts is incorrect.
- Preserve known collection interruptions. Removal of the bot or loss of
  visibility pauses collection. A quiet group is not automatically a broken
  collector, and the time since its last message does not prove either state.
- Re-check membership/permissions and delivery health before treating a long
  zero-traffic period as a measured zero. Unknown gaps remain unknown.
- If collector access is unavailable, keep the manual listing and leave its
  unavailable measurements blank. Owner-reported numbers stay separately labeled.
- Maintain a bounded asset-check queue and cache by participant and category.
  Repeated messages reuse fresh snapshots. Persist cursors for paginated checks
  and completion state; apply rate-limit backoff and bounded work per invocation.
  No permanent in-process worker or undocumented scheduler is assumed.
- Score only snapshots with matching windows, asset scope, and freshness rules.
  Track known departures and label associations as observed participation;
  posting once does not prove current group membership indefinitely.

## Pricing comparability

The comparison unit is settled: **Telegram Stars per message for a general
non-exempt user**. A confirmed zero is Free; unavailable pricing is Unknown.
Do not assume a missing field means zero until the API's behavior is validated.

Store the published rate and effective time separately from per-message payment
observations. An exempt admin can pay zero in a paid group. A price change should
invalidate stale ranking snapshots and be retained in price history.

Show direct examples such as `Free`, `1 Star/message`, and `5 Stars/message`.
For equal collectible participation and activity, lower cost should help the
ranking. A high fee by itself is not evidence of a better audience.

A later comparison can show the Stars cost of a stated number of messages or
cost relative to confirmed observed collector participation. Do not call this
cost per impression, lead, or sale: those outcomes are not measured.

## Ranking rollout

### Stage 1: directory and evidence

Show actual fields and label the initial order as **curated**. Offer direct sorts
such as Stars/message, active posters, observed messages/day, and collectible
holder counts with coverage. Add estimated observed asset value as an optional
sort only when price sources and sample comparability are established. Do not
present a fabricated overall score while collection starts.

### Stage 2: scoring pilot

Proposed starting weights, to calibrate with real groups:

| Component | Weight | Intended behavior |
| --- | --- | --- |
| Collectible audience | 40% | Reward breadth of observed collectors, holder share, and verified asset participation with adequate coverage. |
| Activity and participation | 25% | Reward distinct active posters and sustained activity; one burst or repeat poster should not dominate. |
| Posting cost | 20% | Reward lower verified Stars/message for a general user. |
| Visibility / posting conditions | 15% | Reward usable posting rules and less congestion while requiring enough underlying activity. |

These revised weights replace the first draft's admin-service component. Admin
assets are included once when that admin belongs to the defined participant
population; they receive no extra weight merely because the holder is an admin.

Proposed collectible-audience subweights: 50% breadth of verified observed holder
accounts, 30% holder share, and 20% asset-category participation. Calibrate the
normalizations using pilot data. In a gifts-only pilot, keep the asset scope
explicit and identical for all compared groups. An extended three-category
model requires a new version and cannot silently replace a gifts-only score.

Estimated aggregate asset value is a visible comparison metric once supported.
Its eventual contribution to the group score is a separate calibration step:
use diminishing returns and concentration checks so one expensive transferred
asset cannot automatically put a nearly inactive group first. Do not substitute
an individual financial profile for a group participation metric.

Proposed visibility rubric: half for clear, usable posting conditions and half
for the congestion metric. Select the target congestion range only after seeing
pilot data. A nearly inactive group must not receive a top overall placement
just because its ads take a long time to be buried.

Once each component has a defined 0-100 normalization:

```text
score = 0.40 * collectible_audience
      + 0.25 * activity_and_participation
      + 0.20 * posting_cost
      + 0.15 * visibility
```

These weights are a starting proposal, not validated findings. Before publishing
the formula, define and version normalization thresholds, coverage requirements,
asset scope, the congestion target, low-activity handling, and tie-breaking. Favor fixed,
pilot-calibrated bounds with diminishing returns over unbounded message counts.
Do not silently change the model as groups are added.

### Eligibility and confidence

- Proposed minimum: seven complete days with confirmed collection setup, no
  unresolved visibility gap in the scoring window, a current Stars/message rate,
  and all required score components available. Choose minimum participation and
  per-asset check coverage thresholds from the pilot before enabling ranking.
- Provisional freshness rule: check price and chat metadata within 24 hours and
  process observed price-change events promptly. Set separate TTLs for asset
  observations and market quotes after testing provider limits. Missing a
  deadline changes freshness status; it does not make a paid OTC free.
- A newly connected group is **collecting**, not a zero-score group. A manual
  listing without collector access is **unmeasured**.
- Keep freshness and confidence visible beside the score; do not disguise poor
  collection as poor group quality or silently redistribute missing weights.
- Display eligible ranked groups first. Follow with clearly labeled collecting,
  unmeasured, or stale entries. Explain that these entries have no numerical rank.
- Use a shared scoring cutoff at most once per day for the initial directory.
  A bounded request or operator action can calculate the current snapshot;
  no scheduled-job capability is assumed.
- Store raw metric values, component scores, window, model version, and ranking
  explanation. Changes to price or collection state invalidate stale snapshots.

Example explanation: "Broad observed gift-holder participation, regular weekly
activity, and a low Stars/message fee; heavy peak-hour traffic reduces visibility."

## Checks before publishing a ranking

Compare at least these cases against the intended behavior:

1. A large, nearly inactive group versus a smaller group with regular posters.
2. A free group flooded with repeated ads versus a useful, moderately priced group.
3. Two equally active collector groups with different Stars/message prices.
4. A new group with two days of data versus a group with a complete week.
5. A quiet day versus a lost-permissions or delivery-failure period.
6. A group with an undisclosed price versus a confirmed free group.
7. Anonymous posting, bot-heavy traffic, repeated updates, and edited messages.
8. Exempt admins posting for free in a group that charges other users.
9. One participant with expensive assets versus many independently observed
   collector accounts; do not let a single holding dominate without explanation.
10. A group with many posters but little evidence of buyers: never describe
    observed posters as proven ad viewers or sales.
11. Inaccessible inventories, incomplete pagination, a normal non-collectible
    username, and unavailable anonymous-number ownership data.
12. One asset transferred between participants, cross-group participant overlap,
    stale marketplace quotes, and mixed valuation currencies.
13. A small highly selected observed sample versus broad gift-check coverage;
    group totals must not be extrapolated to unobserved members.

## Decisions needed before implementing scores

- Select the initial groups, languages, and categories. Price and asset types
  are confirmed requirements, not open questions.
- Select sources for gift valuations and username/anonymous-number verification.
- Choose the asset valuation currency, quote refresh policy, and evidence standard.
- Review the revised weights and whether the first score should remain gifts-only
  until other asset categories are verifiable.
- After the pilot, freeze normalization rules, eligibility, tie-breaking, and
  any later data-retention policy before publishing numerical rankings.
