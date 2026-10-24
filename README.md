# FindOTCAi

A Telegram Mini App and silent OTC monitoring POC for the Telegram bot
[@FindOTCAi](https://t.me/FindOTCAi) (ID `8731206462`). OTC Finder is the planned
product. Monitoring started with `@freemarket`; other groups enroll when their
administrators add the bot as admin.

The Mini App is a single-page directory with search, free/paid and language filters, sorting,
and compact/normal/large cards. The toolbar's settings gear, or Settings in the
Mini App's ⋮ menu, opens Theme and Card size controls. Day, Night and Device theme
choices are remembered on this device, along with the chosen card size. Device
follows Telegram's appearance inside the Mini App and system appearance in a
browser. Whenever the chosen scheme matches Telegram's, the page uses Telegram's
own theme colours; Telegram's header, background and bottom bar always match the
page, following Telegram's Mini App design guidelines (details in
[docs/otc-finder-poc.md](docs/otc-finder-poc.md)). Each card's chevron can still
change that card individually; selecting a global size clears individual overrides.
Compact cards prioritize posting price, likes, messages/day and admin gift value.
Normal cards add members, admin gift count, known language and estimate age. Large
cards show the exact gift value/count, members, daily activity, language and last
post once, plus an Open chat action. Technical scan reports stay out of the cards.
The UI has no app-name heading, separate dashboard sections, hover effects or
tooltips. The search box matches OTC names only: the group title or @username.
The shared list contains real, verified public OTCs; no example marketplaces enter
live results.

The **+** button beside the list controls opens Telegram's native group/admin
picker for `@FindOTCAi`, requesting only `manage_chat`. Choose the OTC and confirm
administrator access in Telegram. Its membership update enrolls the group silently;
after verification, public groups with an @username appear through the existing
10-second background update. Private groups remain outside the shared directory.
No start-command payload or onboarding announcement is sent to the group.

The default sort, **Recommended**, orders groups by OTC Rank
(`tgcloud/lib/otc-rank.js`): a 0–100 score from collector participation, activity,
posting cost, admin gift value, likes and members. Every signal has diminishing
returns, new groups lean toward a neutral score until about a week of data exists,
and groups speaking the viewer's Telegram interface language get a small boost.
The model and its weights are described in [docs/otc-finder-poc.md](docs/otc-finder-poc.md).

While visible and online, the app silently re-reads stats every 10 seconds and runs
a background scan every 10 seconds; there is no refresh button. Both intervals,
and the three-minute re-rank, live in `tgcloud/lib/otc-config.js` and ship with
`npm run deploy`. Unchanged cards remain untouched; changed values update in place
with a brief fade. Cards change position only on a re-rank or when the viewer
changes the search, filters or sort, so the list never shifts while someone reads.
Focus, scroll position, filters and card sizes are preserved. Background work has
no live label, spinner or loading screen. Slow requests never overlap; temporary
failures retain the last figures and retry quietly. Gift valuations keep their own
snapshot time and hourly inventory cache.

Cards show messages/day as the observed count in the rolling last 24 hours. Chat
languages are estimated from new message text/captions in the last seven days using
a bundled local detector. Text is not stored or sent to a language service. The most
common detected language is always shown, and others are added once they reach 30%
of identifiable messages. Without identifiable text, cards omit the language. The
language filter (including Multiple languages) can be combined with posting-price
filters.

Every card has a heart button and public like count. A verified Telegram user can
like each listed OTC once and remove their like. Likes persist across sessions;
the Liked filter shows that user's saved OTCs, and Most liked sorts by total
likes. Counts and personal like state join the existing 10-second stats refresh.
Only totals and the caller's own liked status reach the frontend.

Gift values use **Gram (GRAM)** and the official blue diamond/star logo from
[TON's media assets](https://ton.org/media/). Earlier snapshots carrying the old
`TON` ticker display as Gram with the same amounts and evidence dates. The TON
blockchain name and protocol integrations retain their existing names.

## Develop locally

```powershell
npm install
npm run dev
```

Open Vite's local URL to preview the layout and themes. Live stats require opening
the deployed Mini App inside Telegram. They use the official
`Telegram.WebApp.Serverless.call('getOtcStats', ...)` with verified init data.
The frontend never contains the bot credential or individual participant records.

Run `npm test` for the SQLite-backed regression tests. These local tests require
Node.js 22.13+ with built-in SQLite and use no real Telegram requests.
`npm run test:browser` starts its own Vite preview and uses Playwright with Chrome
to check quiet polling, DOM stability, likes, settings, offline behavior and session
expiry. Set `PLAYWRIGHT_CHANNEL` for another installed Chromium channel.

## Deploy to Telegram

```powershell
npx tgcloud login
npm run deploy
```

Login prompts for the bot's **Serverless CLI Access token** from BotFather.
`deploy` builds `dist/`, then publishes the bot modules and Mini App together to
the linked bot. Local edits and `npm run dev` do not change the deployed bot.
Never put a credential into frontend code or a tracked file.

Deploying code does not migrate the database. For additive schema changes, back up
production data, publish the schema alone, review and apply its migration, then
publish the code that uses the new fields:

```powershell
npx tgcloud push tgcloud/schema.js
npx tgcloud migrate --dry-run
npx tgcloud migrate --safe
npm run deploy
```

Review non-additive changes separately; `--safe` deliberately skips them.

After deploying, send `/app`, `/start`, or `/top` in a **private chat** with the bot
and tap **Open Mini App**. Other private text receives the same app launcher.
Every group/channel path is silent, including commands and onboarding events.
You can also set the deployment URL as the Mini App URL in BotFather.

Current Mini App: https://app8731206462.tgcloud.ai/.

Use separate bots and checkouts for development and production. The public app
URL in `tgcloud/lib/miniapp.js` must match the bot linked to that checkout.

## Files

- `index.html`, `src/`: vanilla JavaScript frontend, built with Vite.
- `tgcloud/endpoints/getOtcStats.js`: authenticated aggregate stats.
- `tgcloud/lib/otc.js`: silent message collection and operator compatibility helpers.
- `tgcloud/lib/chat-state.js`: enrollment, metadata, event ordering and verification.
- `tgcloud/lib/gift-inventory.js`: versioned poster/admin inventory scans.
- `tgcloud/lib/otc-stats.js`: aggregate DTOs and operator diagnostics.
- `tgcloud/lib/maintenance.js`, `tgcloud/endpoints/refreshDirectory.js`: authenticated,
  globally leased maintenance, separate from fast directory reads.
- `tgcloud/lib/otc-config.js`: refresh, scan and re-rank intervals; cache periods and
  original operator-helper defaults.
- `tgcloud/lib/otc-directory.js`: public directory in five SQL queries, without remote calls.
- `tgcloud/lib/otc-rank.js`: OTC Rank, the model behind the Recommended sort.
- `tgcloud/lib/viewer.js`: the verified Mini App caller and their interface language.
- `tgcloud/lib/language.js`: local detection and aggregate language coverage.
- `tgcloud/lib/otc-likes.js`, `tgcloud/endpoints/setOtcLike.js`: persistent,
  authenticated likes with idempotent set/unset operations.
- `tgcloud/handlers/message.js`: private commands and silent group collection.
- `tgcloud/handlers/my_chat_member.js`: silently track collector status changes.
- `tgcloud/schema.js`: message metadata, chat snapshots, gift checks/observations.
- `tgcloud/lib/miniapp.js`: public Mini App URL for this bot.
- `tgcloud.jsonc`: hosts `dist/` on Telegram.

`npm run vendor:languages` regenerates the serverless-compatible detector from the
pinned `franc-min` development dependency, preserving upstream licenses. It uses
Vite's installed Rolldown bundler; runtime modules import only project code.

Platform documentation: <https://core.telegram.org/bots/serverless>.

Native enrollment links follow [Telegram's group/admin deep-link format](https://core.telegram.org/api/links)
and open through `Telegram.WebApp.openTelegramLink` inside the Mini App.

See [the POC notes](docs/otc-finder-poc.md), [project plan](docs/otc-finder-plan.md),
and [metrics proposal](docs/otc-finder-metrics.md) for scope and limitations.
The [deep code review](docs/code-review-2026-10-24.md) records the concurrency,
schema, performance and browser fixes, validation and remaining limits.
