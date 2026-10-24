# Gram currency branding

Verified on 2026-10-24 against [the official media page](https://ton.org/media/):
the token is named **Gram**, its ticker is **GRAM**, and it was previously named
Toncoin/TON. The blockchain is still The Open Network (TON).

`src/assets/gram.svg` is the unmodified default token mark from the official
[Gram Diamond Mark download](https://ton.org/assets/media/gram_diamond_mark.zip).
The blue diamond and white star retain the published colors. Asset SHA-256:
`A137A084A1ABB30FFA883D6319A24535AA22CA7F0C0B402914E727097845CDBB`.

Cards display Gram and use this asset in compact, normal and large modes under
both themes. New valuation snapshots use `currency: 'GRAM'`. Older `TON` snapshots
are normalized when returned by the stats API, preserving their nano-unit amount,
source and evidence timestamps. The frontend also accepts that legacy ticker
during a deployment transition and always displays Gram. Unrelated currencies
remain unsupported. Amount arithmetic and the existing 1e9 nano-unit scale are
unchanged.

Historical POC notes may retain the currency label used when recorded. TON Connect,
TonAPI, blockchain names, endpoints and protocol identifiers are retained.
