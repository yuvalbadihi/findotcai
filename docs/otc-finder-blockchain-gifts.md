# Including blockchain-linked gifts

Researched and first inclusion change implemented on 2026-10-24.

## Result

The current Bot API is enough to include blockchain-linked gifts **displayed on
Telegram profiles**. A separate blockchain indexer or user session is not needed
for this first step.

`getUserGifts` returns gifts owned and hosted by a user. Its
`exclude_from_blockchain` option removes blockchain-assigned gifts when true.
Our admin scan had that option set to true and additionally discarded items
marked `is_from_blockchain` locally.
[Source: getUserGifts](https://core.telegram.org/bots/api#getusergifts).

The collector now requests `exclude_from_blockchain: false`, keeps unique gifts
regardless of the blockchain flag, excludes burned gifts, follows pagination,
and deduplicates gifts by their unique name. The stored snapshot records
`inventoryPolicy: 'visible_including_blockchain'` so an older excluding snapshot
cannot silently substitute for a new inclusive valuation after a pricing outage.

## Live read-only comparison

Two successive scans of Free Market's 38 non-bot admin accounts completed:

| API filter | Visible distinct unique gifts | Plush Pepes | Inventory pages |
| --- | ---: | ---: | ---: |
| Include blockchain-linked gifts | 1,769 | 36 | 48 |
| Exclude blockchain-linked gifts | 1,197 | 1 | 45 |

The inclusive scan's collection-floor estimate was about **306,397 TON**, with
prices available for every observed gift at that snapshot. These scans were
successive, not an atomic ownership snapshot; inventories and quotes can change.
No group messages, reactions, transfers, or purchases were made for this check.

The returned items in this live test did not expose a true blockchain flag,
despite the substantial difference caused by the exclusion parameter. Therefore
we do not display an invented zero blockchain count or claim a reliable
per-gift blockchain classification from absent flags. The supported first step
is an inclusive, deduplicated total of profile-visible gifts.

## Profile display and ownership are different facts

An on-chain gift can be hosted on a Telegram profile while its owning wallet
belongs elsewhere. Telegram distinguishes the hosting peer (`host_id`) from
the wallet owner (`owner_address`). A profile association is not proof that the
profile's user controls that wallet.
[Source: Telegram gift hosting](https://core.telegram.org/api/gifts#hosted-collectible-gifts).

The card therefore describes **admins' visible gift value**, explicitly including
blockchain-linked gifts, and says wallet ownership is not verified. This measures
assets displayed by the admin population, not personal wealth or a complete
wallet portfolio. It does not discover unlinked NFTs held in unknown wallets.

## If we later need verified wallet holdings

1. An admin signs into the Mini App using Telegram's verified identity.
2. The admin voluntarily connects a TON wallet and supplies a valid `ton_proof`.
   Verify the signature, domain, network, timestamp, and one-time challenge on
   the backend before associating that wallet with the Telegram account.
   [Source: TON proof verification](https://docs.ton.org/applications/ton-connect/how-to/ton-proof).
3. Query that verified wallet's NFTs using TonAPI `getAccountNftItems`; inspect
   individual items with `getNftItemByAddress` when needed. Check provider access,
   quotas, and request costs before adding the integration.
   [Sources: TonAPI accounts](https://docs.tonconsole.com/tonapi/rest-api/accounts/),
   [TonAPI NFT methods](https://docs.tonconsole.com/tonapi/rest-api/nft/).
4. Validate canonical Telegram gift collections and NFT identity rather than
   trusting a token's name or image. Confirm current owner and transfer state.
5. Deduplicate the same gift observed through Telegram and the wallet indexer,
   retaining both sources and timestamps. Keep profile-visible value and verified
   wallet-held value separate; do not simply add overlapping totals.

Telegram's MTProto gift metadata also exposes wallet and NFT addresses, but
`payments.getUniqueStarGift` is user-only and is not available through our
serverless Bot API proxy. That would be a separate authorized integration,
not something the existing CLI credential provides.
[Sources: starGiftUnique](https://core.telegram.org/constructor/starGiftUnique),
[payments.getUniqueStarGift](https://core.telegram.org/method/payments.getUniqueStarGift).

The TON proof verifier would need an implementation compatible with the tgcloud
runtime or a separately secured verifier. The official Node examples use npm
packages that cannot simply be imported into deployed `tgcloud/` modules.

## What this inclusion change does not solve

- Collection-floor pricing remains an estimate without model/rarity appraisal.
- Hidden inventories and unlinked wallets remain outside the visible sample.
- Complete scans mean the accessible paginated results were exhausted.
- Wallet ownership verification and a reliable chain/native per-item split are
  not implemented by the initial inclusion change.
