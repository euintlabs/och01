# OCH-01: octra circle-hosted nft standard (v1)

euint labs. GDSC methods are canonical.

canonical reference: **Geodesics (GDSC)** `octH9hzVMGgvCieiERVZGMfXvTa1FHGneESb28212yPPu6J`, the first circle-hosted nft of its kind on octra. every method name and shape below is taken verbatim from the deployed GDSC contract and is normative. reference implementation: `och01.aml` in this folder (the GDSC contract, generalized).

an octra circle-hosted nft (OCH) is a self-contained on-chain program that lives in an octra circle and renders itself from its seed. it is:
- deterministic: same seed gives an identical render everywhere, forever.
- self-contained: one html file, zero network, no external or sibling files.
- live: animates / evolves / reacts / keeps chain time.
- verifiable: seed, circles, and provenance are all on-chain.

## terminology

- contract: the OCH-01 contract holding the ledger (owners, supply, price, provenance).
- renderer circle: public octra circle hosting the single self-contained `index.html`.
- metadata circle: public octra circle hosting `/<id>.json`, `/collection.json`, `/traits.json`, and optional `avatar.png` / `banner.png`.
- seed: the deterministic per-token value that fully defines a piece, derived as shown below.
- token ids run `0 .. get_next_id()-1`.

## contract interface

normative, GDSC signatures. every group below is required.

ownership core:
```
fn transfer(to: address, token_id: u64): bool
fn approve(spender: address, token_id: u64): bool
fn transfer_from(from_addr: address, to: address, token_id: u64): bool
view fn owner_of(token_id: u64): address
view fn balance_of(addr: address): u128
view fn get_approved(token_id: u64): address
view fn token_uri(token_id: u64): string
```

collection info:
```
view fn get_name(): string
view fn get_symbol(): string
view fn get_decimals(): u64
view fn get_total_supply(): u128
view fn get_max_supply(): u128
view fn get_next_id(): u64
view fn get_max_per_wallet(): u64
view fn get_owner(): address
```

living / circle:
```
view fn seed_of(token_id: u64): string
view fn get_renderer_circle(): address
view fn get_metadata_circle(): address
```

provenance:
```
view fn get_provenance(): string
view fn is_provenance_locked(): u64
```

mint / economics:
```
payable fn mint(): u64
view fn get_mint_price(): u128
view fn is_mint_price_locked(): u64
view fn minted_by_wallet(addr: address): u64
view fn mint_epoch_of_token(token_id: u64): int
view fn get_proceeds(): u128
```
`get_mint_price` is raw units and must be read live, never hardcoded client-side.

royalty:
```
view fn royalty_info(token_id: u64, sale_price: u128): (address, u128)
view fn royalty_of(token_id: u64): u128
view fn creator_of(token_id: u64): address
view fn get_royalty_recip(): address
view fn get_royalty_bps(): u128
```

admin, owner-gated:
```
fn set_renderer_circle(circle_addr: address): bool
fn set_metadata_circle(circle_addr: address): bool
fn set_provenance(hash_str: string): bool
fn lock_provenance(): bool
fn set_mint_price(new_price: u128): bool
fn lock_mint_price(): bool
fn set_royalty_recip(new_recip: address): bool
fn sweep_proceeds(amount: u128, to: address): bool
fn transfer_ownership(new_owner: address): bool
```

cross-contract read mirrors. a cross-contract `call()` into a `view fn` returns 0 on octra, so any value another contract may need is mirrored as a plain `fn`:
```
fn owner_of_call(token_id: u64): address
fn balance_of_call(addr: address): u128
fn seed_of_call(token_id: u64): string
fn get_total_supply_call(): u128
```

## seed

```
seed_of(id) = digest_sha256( SEED_SALT + ":" + to_string(id) )
```
lowercase hex. `SEED_SALT` is a fixed per-collection string sealed at deploy (GDSC: `Geodesics:v1`). the seed is the sole source of a piece's identity. clients may compute it off-chain or read `seed_of` / `seed_of_call`.

## circle hosting

- both circles are public: `privacy_class: "public"`, `resource_mode: "public_resources"`.
- renderer circle: exactly one asset, `/index.html`.
- metadata circle: `/<id>.json` per token, `/collection.json`, `/traits.json`; optional `/avatar.png` (1000x1000), `/banner.png` (1400x400).
- read with `octra_circleAsset(circle, path)` -> `{ body_b64, content_type }`. one asset per `circle_asset_put` tx.

## the renderer

one self-contained html file that must:
- render deterministically from `?seed=<hex>` (required) and `&i=<id>` (optional, for serial-varying pieces).
- make zero network requests and load no external or sibling files. the 0xio wallet iframe blocks subresources and has no network, so everything is embedded as data uris.
- produce an identical still and motion for a given seed on any renderer, forever.
- respect `prefers-reduced-motion`; pause on `visibilitychange`.

`animation_url` = `image` = `external_url` = `oct://<renderer_circle>/index.html?seed=<seed>&i=<id>`.

## metadata

token, `/<id>.json`:
```json
{
  "name": "<Collection> No. <id+1>",
  "description": "<collection description>",
  "image":         "oct://<renderer>/index.html?seed=<seed>&i=<id>",
  "animation_url": "oct://<renderer>/index.html?seed=<seed>&i=<id>",
  "external_url":  "oct://<renderer>/index.html?seed=<seed>&i=<id>",
  "rarity": { "rank": 0, "score": 0 },
  "attributes": [ { "trait_type": "T", "value": "V" } ]
}
```

`/collection.json`:
```json
{
  "name": "...", "symbol": "...", "max_supply": 0,
  "render_type": "living",
  "contract_address": "oct...", "renderer_circle": "oct...", "metadata_circle": "oct...",
  "image": "oct://<metadata>/avatar.png", "banner": "oct://<metadata>/banner.png",
  "creators": [ { "address": "oct...", "name": "..." } ]
}
```

`/traits.json`: `{ collection, supply, seedSalt, scoredTraits[], frequencies{}, tokens:[{id,seed,rank,score,traits{}}] }`, used by marketplaces/explorers for rank and filtering.

## provenance

`get_provenance()` is a `sha256` over the concatenated renderer plus all token/collection/traits files. `set_provenance` then `lock_provenance` before the first mint. anyone recomputes from the circles and confirms immutability and the on-chain match. `contract_source` / `contract_verify` may expose the aml source.

## adopter integration

one integration serves every OCH-01 collection:
- wallets (0xio): render `animation_url` in an iframe. single self-contained file, no subresource fetch.
- marketplaces (Xpectrum): `collection.json` for identity + avatar/banner, `traits.json` for rank/filters, `owner_of` / `get_total_supply` / `get_next_id` for the ledger, `royalty_info` for fees.
- explorers (octrascan): decode the getters above, list from `collection.json`.

## conformance

- implements the full contract interface above with the exact signatures.
- `seed_of` derived as `digest_sha256(SALT:id)`.
- renderer single-file, deterministic, network-free.
- circles and metadata as specified.
- provenance set and locked before first mint.

run the checker in this folder: `node conformance.mjs <contract> [rpc]`.

## reference collections

- Geodesics (GDSC): `octH9hzVMGgvCieiERVZGMfXvTa1FHGneESb28212yPPu6J`, salt `Geodesics:v1`.
- Pegasa (PEGA): `octHWfjg87B9Li57tgHc3d1ZKWYHY1ijwyFdvDNDTnSsY6o`, salt `Pegasa:v1`.

## open

- registry: an optional on-chain registry of conformant contracts.
- `render_type` capability list: `living` now, room for `interactive` / `audio` / `rigged` later.
