# OCH-01

the octra circle-hosted nft standard. an OCH is a self-contained on-chain program that lives in an octra circle and renders itself from its seed: deterministic, self-contained, live, verifiable. no stored image.

first of its kind is Geodesics; Pegasa follows it. this folder writes the shared standard down so 0xio, xpectrum, octrascan, and anyone else can build to it once instead of per-collection. GDSC methods are canonical.

## files
- `OCH-01_Octra_Circle-Hosted_NFT_Standard.md`: the spec. contract interface (verbatim from the GDSC contract), seed rule, circle hosting, renderer contract, metadata schema, provenance.
- `och01.aml`: open reference contract. the GDSC implementation, generalized (identity via constructor). fork this.
- `conformance.mjs`: checks a live contract + its circles against the spec.
- `LICENSE`: MIT. the reference contract and checker are yours to fork.

## check a collection
```
node conformance.mjs <contract_address> [rpc_url]
```
rpc defaults to `https://octra.network/rpc`. it reads every §2 getter, pulls the renderer + `collection.json` / `traits.json` / `0.json` from the circles, checks provenance is set and locked, and verifies `seed_of(0) == sha256(salt:0)`. exit 0 conformant, 1 not. the public mainnet rpc rate-limits hard, so a full run may need patience or a less-limited endpoint; the tool backs off and flags a throttled run as inconclusive.

## reference collections
- Geodesics (GDSC): `octH9hzVMGgvCieiERVZGMfXvTa1FHGneESb28212yPPu6J`, salt `Geodesics:v1`.
- Pegasa (PEGA): `octHWfjg87B9Li57tgHc3d1ZKWYHY1ijwyFdvDNDTnSsY6o`, salt `Pegasa:v1`.

## status
v1. GDSC methods are canonical.
