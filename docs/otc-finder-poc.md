# OTC monitoring POC

Implemented on 2026-10-18 with the original bot; the active bot is now
**@FindOTCAi**.

## Bot migration — 2026-10-24

- Linked this checkout to bot `8731206462` using the official CLI login.
  The Mini App is now hosted at https://app8731206462.tgcloud.ai/.
- Verified the new bot's administrator membership in `@freemarket`; its webhook
  subscribes to `message` and `my_chat_member`, with no pending deliveries.
- Created the four existing tables in the new bot's separate database. Copied
  the pilot row, 11 message observations, 6 cached gift checks, and 100 unique
  poster-gift records. Preserved enrollment time and the dated all-admin snapshot
  (38 admins, 1,769 gifts, approximately 306,399.74 TON at collection floor).
  Counts describe the migration snapshot and will change during live collection.
- Reset the copied bot permission state and independently verified the new bot
  before enabling collection. Checked that no historical primary keys were missing.
- Added an **Open App** menu button. `/start`, `/app`, and `/top` in private chat
  open the new Mini App. The interface remains a single page without branding.
- Retired the old bot's collector and membership handler. Its private replies
  direct visitors to `@FindOTCAi`, and its stats endpoint reports that the app
  moved. Preserved the old database and a local temporary backup for recovery.
- Verification: all 18 local tests passed, production build passed, new static
  host returned HTTP 200, deployed stats returned `collecting`, and database and
  webhook were in sync. No test messages were sent to the OTC.

## Minimal directory UI

The Mini App now uses one page: search and filters above a list of OTC cards.
Cards have three densities, controlled in toolbar settings and individually by a
card's chevron. Compact cards support quick scanning; normal cards support
comparison; large cards show exact values and useful activity details once.
The current hierarchy below supersedes the earlier scan-report presentation.
All details stay within the same card. The project name is unchanged and is not
displayed as page branding. The directory currently contains only Free Market.

## Authorized pilot

### Whole-card taps and no zoom — 2026-10-24

Tapping anywhere on a card opens the OTC in Telegram; the like and expand
buttons keep their own actions. The name link stretches over the card, so the
card stays one real link for keyboards and screen readers. Large cards no longer
show an Open chat button. Pinch and double-tap zoom are off, so an accidental
double tap no longer enlarges the page.

### Search and hover cleanup — 2026-10-24

The search box reads "Search OTCs" and matches names only: the group title or
@username. Language remains available as a filter. Hover colour changes and
tooltips are gone everywhere: on touch screens a tapped control kept its hover
colour, so an unliked heart could stay blue. Screen-reader labels remain.

### Verification and likes fixes — 2026-10-24

- Likes use the directory's listing rule, so an OTC stays likeable while its
  five-minute verification is between refreshes. Known removals still reject
  new likes at once.
- Collection and maintenance renew a verification during its last minute.
  Messages arriving during the renewal count under the current verification,
  and neither a renewal nor a paid-price change invalidates messages or admin
  scans already in progress. A temporary failure keeps the current verification
  until it lapses. After a lapse, messages arriving during re-verification are
  still skipped: collection never runs on an expired verification.
- After a lapse, a temporary failure (rate limit, server error, timeout) retries
  within a minute, or after Telegram's retry_after. Lost access (400 or 403)
  pauses collection at once and backs off towards six hours, so departed or
  deleted groups stop consuming the shared maintenance refresh; a membership
  event still re-verifies at once.
- A membership event dated slightly ahead of the server clock no longer blocks
  the verification that follows it.

### Self-service OTC enrollment — 2026-10-24

The **+** button opens Telegram's native add-as-admin flow using
`https://t.me/FindOTCAi?startgroup&admin=manage_chat`, via the Mini App SDK's
`openTelegramLink`. The public deep-link specification supports group selection
and admin-rights confirmation. No start parameter is supplied, and the bot sends
no onboarding messages to groups. Browser use retains the ordinary Telegram link.
[Sources: Telegram group/admin links](https://core.telegram.org/api/links),
[Mini App link API](https://core.telegram.org/bots/webapps).

An administrator membership update creates a provisional row, verifies current
bot admin access and reads chat metadata. Provisional rows are hidden until the
verification succeeds. A concurrent demotion can update that row immediately;
older events cannot undo it. Enrollment retries preserve existing history.
Collection now accepts only enrolled groups, scoped by numeric chat ID, while
unrelated group messages and channel updates remain ignored. All monitoring,
promotion, demotion and onboarding paths stay silent.

The shared directory includes verified public groups with @usernames. Private and
unverified groups do not appear and cannot receive public likes. Messages,
language, prices and admin snapshots stay separate per OTC. Each directory read
limits heavy admin inventory refresh to one due group; metadata refresh is also
bounded. Existing poster-gift caches remain shared per Telegram account.

The stats endpoint now includes an `entries` array. Original-pilot fields remain
for already-open older Mini App versions. New cards enter the same quiet
10-second reconciliation, search, filters, numeric sorting and per-user likes.
The original pilot remains the default for operator helper functions, which also
accept an explicit chat ID.

Verification covers multi-group isolation and duplicate message IDs, enrollment
retries, membership verification, demotion ordering/races, hidden private and
provisional records, per-OTC likes, bounded scan rotation, the exact native link,
SDK handoff/browser fallback, and background insertion without replacing the
existing card. No test groups are created or messages posted during verification.

### Card content review — 2026-10-24

| Size | Content |
| --- | --- |
| Compact | Handle, Stars/message, like button/count, messages/day, compact Gram gift estimate, and language when known. |
| Normal | Handle/price, members, daily activity, known language, admin gift estimate/count, likes, and one estimate-age label. |
| Large | Handle/price, exact admin gift estimate/count, members, messages/day, language, last post, likes, and Open chat. |

Removed the diagnostic paragraphs, admin inventory coverage counts, owner/admin
breakdown, source attribution rows, blockchain/wallet prose, language-learning
thresholds and poster-sample details from every card. Large cards do not repeat
their summary metrics in a second grid. Unknown language is omitted from the
smaller cards and appears as Unknown in the large card. Missing valuations remain
unknown; actual partial estimates, partial-day counts and paused collection have
short labels where relevant. Technical evidence remains in the backend/docs.

The 10-second refresh, saved sizes/themes, per-card expansion, currency branding,
likes and filters are unchanged. Changed metrics are matched by key when
highlighting updates. Browser checks cover each size in both themes at mobile
and desktop widths, like/unlike in every layout, live refresh with focus retained,
missing data, paused collection, partial estimates, long names and languages.

### Appearance settings — 2026-10-24

A small settings gear replaces the toolbar's card-size cycling button. Its inline
panel contains Theme (Day, Night, Device) and Card size (Compact, Normal, Large).
Selections apply immediately and persist in local browser storage. Device uses
Telegram's current appearance when opened as a Mini App, with system appearance
as the browser fallback. Automatic appearance changes are followed only in Device
mode; explicit Day and Night choices remain selected. Local-storage failures do
not prevent changing the current view. Per-card expansion remains available.

Settings and filters open one at a time. Escape closes settings and returns focus
to the gear; clicking outside closes it without moving focus. The inline panel
uses labeled button groups and exposes expanded and selected states. Day colors
include readable errors, Stars icons and secondary text. Browser verification
covers saved preferences, Telegram/system theme events, panel interactions,
blocked storage and every card size in both themes at mobile and desktop widths.

### Telegram design guidelines — 2026-10-24

The Mini App follows Telegram's
[design guidelines](https://core.telegram.org/bots/webapps#design-guidelines) and
[color schemes](https://core.telegram.org/bots/webapps#color-schemes).

When the chosen scheme matches Telegram's (Device, or a Day/Night choice that
agrees with Telegram), the page takes its colours from `themeParams`:
section-coloured cards on the secondary background, as Telegram recommends, with
its accent, subtitle, section-header and destructive colours. Missing optional
colours fall back to the built-in palette; incomplete parameters keep it
entirely. A choice that differs from Telegram's scheme uses the built-in palette.

Every theme change paints Telegram's header, background and bottom bar with the
page background. With Telegram's palette the `secondary_bg_color` key keeps them
in step with Telegram's own theme changes (Telegram Desktop resolves no other
header key); the built-in palette passes its hex colour. Header keys need Bot API
6.1, header hex 6.9, background 6.1 and bottom bar 7.10; a rejected colour does
not stop the others.

Telegram's back button appears while Filters or Settings is open and closes it,
so Android's back gesture no longer closes the whole Mini App. Settings is also
in the ⋮ menu (Bot API 7.0+); a panel opened from further down scrolls into
view. Group and bot links open through `openTelegramLink`. Haptics: a light
impact on like, an error notification when a like fails, and a selection tick
only when a choice actually changes.

Padding combines Telegram's safe area and content safe area on every side, so
fullscreen mode keeps the sticky toolbar clear of the status bar and Telegram's
floating controls. Small icon buttons keep their look but get larger touch
targets. Android devices that Telegram reports as performance class `LOW` get
the reduced-motion treatment. Unit tests cover palette mapping, version gates and
the user-agent parser; browser checks cover the chrome colour for every choice
and a live Telegram theme change, back and Settings buttons, haptics, links and
the low-end path.

### OTC Rank and silent refresh — 2026-10-24

**Recommended** is the default sort. It orders groups by OTC Rank
(`tgcloud/lib/otc-rank.js`), the Stage 2 scoring pilot of the
[metrics proposal](otc-finder-metrics.md) built from the signals collected today.
Scores are computed on every directory read, with no Bot API calls. Each signal
maps onto 0–1 with diminishing returns over fixed bounds, so a score never depends
on which other groups are listed:

| Signal | Weight | Measure |
| --- | --- | --- |
| Collectors | 30% | Recent posters with a fresh gift check who hold a unique gift: 60% breadth (8 holders score 0.5) and 40% holder share, smoothed toward 20%. |
| Activity | 30% | Distinct posters (45%), messages per observed day (35%) and recency with a three-day decay (20%). |
| Posting cost | 15% | Free scores 1, 25 Stars/message 0.5. An unknown price scores 0.35 and is never treated as free. |
| Admin gift value | 10% | Logarithmic up to 1,000,000 Gram, so one valuable collection cannot dominate. |
| Likes | 10% | Five likes score 0.5. |
| Reach | 5% | Members, logarithmic up to 100,000. |

Collectors and activity need observation time, so they blend toward a neutral 0.3
with confidence days/(days + 2): about 33% after one day and 78% after a week. A
first-day burst cannot outrank a steady week, and a new group does not start at
zero. Groups whose detected languages include the viewer's Telegram interface
language get a 10% boost, capped at 100; the interface language only personalises
the order and is never used as a chat's language. Ties fall back to likes, members
and chat ID. Each entry carries `rank: { version, score, signals }` for inspection.
The proposal's visibility component (posting rules and congestion) is not measured
yet and is not scored. Weights are a starting point to calibrate with real groups.
The live @freemarket figures score about 39.

The refresh button is gone. While visible and online, the app re-reads stats every
`REFRESH_SECONDS` (10) and runs one background metadata/gift scan every
`SCAN_SECONDS` (10). Both live in `tgcloud/lib/otc-config.js`, which the frontend
also imports, and ship with `npm run deploy`. Nothing on screen announces either;
failures keep the last list and retry on the next tick, and a first-load failure
says it is retrying. Values update in place on every refresh, but cards change
position only on a re-rank every `RERANK_SECONDS` (180), or immediately when the
viewer changes the search, filters or sort. New groups join at the end until the
next re-rank; moved cards fade in while the card at the top keeps its place.

The Paused label is removed. It reflected a lapsed five-minute admin verification,
typically right after an idle period, not a group state. Directory entries no
longer carry `state`; operator diagnostics keep it.

Refactoring in the same change: the verified-caller helpers moved to
`lib/viewer.js`; the directory response (`apiVersion` 3) dropped the duplicate
single-group fields kept for pre-directory clients, the duplicate `messages24h` and
the empty `gifts` placeholder; the frontend dropped the matching compatibility
paths. List reconciliation moved into `ui.js`, segmented choices and preference
storage share small helpers, sorts use one comparator table, and unused icons and
styles were removed. The directory read adds one aggregate query (five in total).

Unit tests cover the proposal's comparison cases (a large inactive group, price
levels, a first-day burst, one valuable collection against broad collectors), the
language boost, bounds and ties, plus a SQLite-backed ranked directory. Browser
checks confirm there is no refresh control or paused label, that order holds across
10-second refreshes, and that it changes on a re-rank or a viewer-picked sort.

### Likes — 2026-10-24

All three card sizes show a heart and total likes. A second tap removes the user's
like. Your OTCs → Liked combines with search, posting price and language filters;
Most liked sorts by the numeric total. Likes persist per verified Telegram user.

The `otc_likes` table stores one deterministic `chatId:userId` primary key, the
listed chat ID, internal viewer ID and creation time. Chat and viewer indexes
support reads. The `setOtcLike` endpoint accepts a chat ID and boolean desired
state; the viewer always comes from platform-verified `ctx.initData.user.id`.
It rejects invalid input and unlisted chats. Setting true is an insert with
conflict-ignore; setting false deletes only the caller's like. The count is
derived from stored rows so retries cannot inflate it. No chat messages are sent.

Authenticated stats return a stable group ID, total likes and `likedByMe` for the
caller. Other viewers' identities are never returned. These figures refresh with
the directory every 10 seconds. The frontend gives immediate heart/count feedback,
allows one mutation per OTC at a time, rolls back failed saves, and prevents an
older stats response from overwriting a pending or just-completed change.

SQLite-backed tests cover identity checks, input validation, listed-chat checks,
concurrent retries, unlike ownership, aggregate privacy and zero-like states.
Browser checks cover reload persistence, both refresh/mutation response orderings,
rollback under the Liked filter, filter combinations, sorting, expired sessions,
and the heart button in every density at 320px, 390px and desktop widths.

### Live stats, daily frequency and chat language — 2026-10-24

The visible Mini App polls authenticated stats every 10 seconds, with no Live/10s
indicator or background refresh spinner. Unchanged rendered cards are untouched;
changed text and attributes reconcile inside the existing card, retaining its
buttons, links, images and focus. A brief opacity fade marks actual value changes,
respecting reduced-motion preferences. Scroll anchoring preserves the current
reading position. Filters, theme and card size remain selected. Only the first
load shows loading feedback; there is no manual refresh control.

Polling pauses while hidden/offline and resumes immediately on return. Slow
requests do not overlap. Temporary background failures keep the last data and
retry quietly; offline and expired sessions receive brief actionable status text.
Browser verification checks the actual 10-second cadence, zero list mutations for
unchanged responses, stable DOM identity through updates, no background spinner,
like controls after reuse, scroll/focus/filters, slow/failing requests, hidden
pause, reduced motion and expired-session stop.

Each card shows **messages/day**, defined as observed messages in the rolling last
24 hours. A group enrolled less than a day ago has a partial daily window, explained
in the large card. This is an observed count, not an extrapolated daily forecast.
Existing message deduplication, permission checks and retention still apply.

The collector classifies new text/captions locally with bundled
[franc-min 6.2.0](https://github.com/wooorm/franc), plus a Hebrew-script rule.
The upstream detector cautions that short samples can be unreliable. URLs, handles,
code blocks and wallet-like identifiers are removed; fewer than 30 letters,
repetitive text, or close language rankings produce `und` (uncertain). No raw text
or language-provider requests are stored or sent. The nullable `language_code`
column distinguishes older records without text from newly analyzed uncertain ones.

The last seven days determine chat languages. The most common detected language
is always included; another language joins once it reaches 30% of identifiable
messages (texts classified as a supported language). Without identifiable text the
status is `unavailable` and cards omit the language. Coverage and evidence counts
remain backend data; individual participant records are not returned. Language
search and the language filter, including Multiple languages, use these estimates.
Indian languages have specific
names such as Hindi, Bengali and Tamil; nationality and Telegram profile language
are not used as substitutes for message language. Earlier messages cannot be
backfilled because their text was never retained.

Gift inventories retain hourly caching and poster checks retain their existing
daily cache. A 10-second activity refresh does not relabel these snapshots as fresh.

Verification adds detector samples, uncertain/legacy/mixed-language cases,
SQLite-backed daily-window/deduplication checks, and language search/filter tests.
Chrome checks cover the 10-second cadence, slow calls, failures, hidden/offline
pause and recovery, expired-session stop, preserved focus/view, and all three
density modes at 320px, 390px and desktop widths. No test messages go to the OTC.

The operator added the bot as administrator to **@freemarket** and authorized
data collection, with an explicit instruction to post nothing there.

- Chat: Free Market, numeric ID `-1002187584621`.
- Initial read-only metadata: 2,353 members; 350 Stars per message.
- The deployed collector and membership handler contain no outbound group
  messages, reactions, edits, or group-setting changes.
- All group/channel traffic returns through the silent branch. Only private
  conversations can receive the Mini App launcher or echo replies.

The initial POC pinned one numeric chat ID. Self-service enrollment now accepts
other groups through administrator membership updates and verified bot access;
arbitrary visitors cannot submit a chat ID to start collection.

## What is live

- Mini App stats at <https://app8731206462.tgcloud.ai/>. Open from `/app` in a
  private chat with the bot for Telegram-authenticated data access.
- Read-only chat metadata, admin verification, and Stars/message.
- New observed human message counts, distinct identifiable posters, last message
  time, and a count over the monitored portion of the last 24 hours.
- A rolling activity window of up to seven days, beginning at enrollment.
- Cached accessible unique-gift checks for identifiable observed posters.
- A separately labeled, paginated inventory scan of all non-bot admins.

The first admin sample found **121 distinct visible unique gifts among three
sampled accounts**. Two API inventory checks completed; one was partial. This is
a lower bound over that convenience sample, not the whole group's membership.
At that first POC stage, no monetary asset value had been calculated.

### Admin gift valuation added on 2026-10-19

The Free Market card now shows **Estimated admins' gift value**, in TON, using
collection floor quotes from the public
[Thermos collection endpoint](https://proxy.thermos.gifts/docs).
The implementation interprets the API's bigint floor amounts in nanoTON and sums
them as integers before formatting TON; it does not convert posting-price Stars.

The first completed scan of all **38 non-bot admins** found **1,109 distinct
visible unique gifts**, all matched to collection floors. The initial sum was
**35,962.765339201 TON**, displayed rounded as **35,962.77 TON**. This is a dated
estimate of observed gifts, not guaranteed sale proceeds or personal net worth.
That initial scan excluded blockchain-linked and burned gifts. As of 2026-10-24,
blockchain-linked gifts are included; burned gifts remain excluded. See the
[blockchain gift research and inclusion change](otc-finder-blockchain-gifts.md).
Rarity/model premiums are not appraised. Values can change as inventories and
floor quotes change.

Admin inventory reads follow pagination with at most ten pages per account and
120 requests overall, running up to five read requests at a time. The card shows
complete-admin and priced-gift coverage and labels incomplete estimates. Admin
inventories and floor quotes are refreshed at most hourly on a stats read; failures
back off for five minutes and preserve any dated last-known usable estimate.
Quotes are fetched concurrently with inventory reads. The provider receives no
Telegram user IDs or account inventories, only a generic catalogue request.

The earlier three-admin sample remains a historical POC observation; it is no
longer the scope of the current card's admin total.

A follow-up check on 2026-10-19 distinguished the two display populations:
**72 gifts** belonged to the only observed poster, who was the owner. The
separate all-admin scan read **44 inventory pages** for **1 owner and 37 other
administrators** and again found **1,109 distinct visible gifts**, with all 38
inventories complete. The Free Market card now displays this admin count,
coverage, and owner/admin breakdown directly. The lower activity panel explicitly
labels its numbers as observed posters' gifts. Price quotes refresh separately
over time, so subsequent TON estimates can differ from the initial figure.

Message observations begin after enrollment; there is no historical backfill.
Zero observed messages is a valid initial state. The group webhook was verified
in sync for `message` and `my_chat_member`, with no pending deliveries. No test
messages were posted to generate activity.

## Collection and storage

- Require current verified admin status. Track `my_chat_member` events and
  refresh permissions/metadata on the next event or stats read after five minutes.
  Failed verification pauses collection. The POC uses event-time ordering to
  prevent an older refresh from overriding a newer demotion or price change.
- Do not count commands for this bot, service messages, ordinary bot accounts,
  ephemeral messages, or events preceding enrollment. Anonymous chat-authored
  activity can count as messages but contributes no invented human identity.
- Store one metadata row per `chatId:messageId`, so duplicate deliveries cannot
  inflate derived counts. No ad text, captions, media, names, usernames, phone
  numbers, or profile photos are retained by the message collector.
- Retain message IDs, internal sender IDs when identifiable, chat ID, and event
  timestamps for up to 30 days; prune old rows during metadata refresh.
- Check gifts at most once per day after success for a given observed poster.
  Cache failures with backoff. One 100-item page is the bounded scan limit;
  a next-page cursor produces a partial status, not a complete inventory.
- Keep unique gift identifiers and their latest observed holder association
  internally. Deduplicate transferred gifts and exclude unavailable/stale checks
  from fresh aggregate counts. No participant inventories are returned publicly.
- Complete checks mean the accessible API result was exhausted, not that hidden
  or unlinked assets were discovered. Show partial, unavailable, and complete
  checks separately, with the observed-poster denominator.
- Stats endpoints return aggregates to authenticated Mini App callers. Metadata
  refreshes use the same bounded claim to avoid one API refresh per visitor.

## Verification

- `npm test`: SQLite-backed tests for silent paths, retries, gift-cache behavior,
  partial/unavailable scans, admin demotion, stale events, anonymous senders,
  endpoint identity checks, and aggregate-only admin samples.
- Real Chrome at 320px, 390px, and desktop widths: preview state, theme toggle,
  stats rendering, coverage, separate admin sample, pause state, and auth errors.
- Native platform calls verified enrollment, aggregate queries, and accessible
  gift retrieval. Those calls only read Telegram data; they did not post.

## Deliberately unfinished

- Ranking and per-item/model-sensitive valuations remain future work. The card
  now includes the collection-floor estimate described above.
- Collectible username and anonymous-number verification remain separate work.
- The API does not enumerate a complete membership roster. Observed posters and
  the small admin sample must stay separate, with no extrapolation to all members.
- Admin snapshots now refresh on authenticated stats reads with a shared lease
  and hourly caching. No unauthenticated operator action is exposed.
- Private-group publication with owner-approved invite links, persistent
  coverage-gap history, poster gift pagination beyond the first page, and
  background enrichment queues are future work.
