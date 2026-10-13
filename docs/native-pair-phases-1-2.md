# BEAR native-pair launch policy: Phases 1 and 2

## Scope

Every new supported launch uses `49PU6ENTpYc3zkhgCruzCSBzgVAdix5muP2oVzRGpump` as its quote and permanently allocates 100% of creator fees to the existing treasury `3ggRizSixiDPXyHrEzBaZ3Nm8QfFRD1FbrkkYYpxMxkq`. Pump's own protocol fees are separate. Creator attribution remains the launching wallet. Holders, cashback, mayhem and arbitrary recipients/quotes are not enabled.

Creation and the V2 fee-sharing lock occur in the same transaction. A bounded `buy_v3` follows in that transaction when it fits. If full metadata makes it too large, creation plus locking stays atomic and the user approves a separate bounded first buy for the same mint. The maximum BEAR input never increases to accommodate slippage; minimum output uses the disclosed 1% tolerance. SOL covers rent/network fees only; SOL is not automatically swapped into BEAR.

This does NOT implement the later per-coin reward ledger, fee sweeping, scheduler or buyback-and-burn engine. New receipts explicitly remain `automationEligible: false`. Existing Burn accounting and targets are not relabeled as BEAR. A locked fee recipient does not restrict what its treasury can do with funds after distribution.

## Deployment prerequisites (not performed by this change)

1. Review and deploy the branch's frontend, backend functions and extended PublicLaunchAttempt schema together through the existing Base44 workflow. Preserve existing records. In particular, deploy publicPumpLaunch and all retired launch endpoints together; leaving an old endpoint running could bypass the new policy.
2. Retain `SOLANA_RPC_URL` and `INSCRIPTION_API_KEY` as server secrets. The submission HMAC requires at least 16 characters in INSCRIPTION_API_KEY. Do not rotate it while approvals are pending without reconciling those approvals. This public launch path never reads MINT_WALLET_SECRET_KEY or ADMIN_MINT_WALLET_SECRET_KEY.
3. Set the normal Base44 frontend application settings and `VITE_PUBLIC_SOLANA_RPC_URL` to an HTTPS, mainnet, browser-safe RPC endpoint. Do not expose the server RPC credential. The public Solana RPC is a fallback, but rate limits may prevent independent wallet verification.
4. An authenticated administrator must open `/admin/launch-policy`, connect the configured treasury in Phantom, and prepare the shared BEAR lookup table. Explicitly approve each displayed setup transaction and its SOL rent. Check each saved signature until finalized, then **Verify and register table**. Public launches remain disabled until the label `pump-launch-bear-v1` has a usable on-chain table. Refresh setup after parent migration or protocol recipient changes. Setup never creates a coin or signs on the server.
5. Verify the current BEAR mint's eligibility on mainnet through options/setup. It must satisfy Pump's current depth, mayhem and migration requirements. Offline fixtures do not establish that live eligibility.
6. Perform an explicitly approved, tightly capped canary: short metadata combined launch; long metadata split launch; finalized treasury config proof; correct BEAR debit and child output. These transactions have not been submitted by this implementation.

The existing admin-only frontend launch route is preserved. Broad public access is a separate rollout decision.

## Transaction and recovery rules

- A versioned mint-key-signed launch intent binds identity, metadata, quote, amount, recipients and consent. The Phantom transaction signature remains the spending authorization.
- A compare-and-set database lease serializes changes to an existing attempt. A detected duplicate request or mint record blocks preparation. Base44 deployments must support atomic updateMany filters; the integration suite models those semantics.
- The server stores the prepared message and request-bound HMAC, validates the real SDK instruction/account layout, requires successful RPC simulation, then returns a signable transaction. The browser independently validates against mainnet and decodes actual lookup tables before Phantom signs.
- The signature is persisted before broadcast. Ambiguous sends keep the same signature. A pending transaction is never replaced with a fresh purchase.
- Confirmation must match the exact saved message and finalized receipt, followed by initialized mint, BEAR quote, active revoked-admin V2 sharing config and canonical pool checks. Coin existence alone cannot create a verified receipt.
- An externally submitted expired approval is searched by exact message within bounded mint history. Missing/pruned history blocks automatic replacement. Administrator reconciliation is safer than an unproven second purchase.
- A successful create-only step remains `awaiting_first_buy`; do not create the coin again. Failed/expired separate buys retain the creation receipt. If the child has already graduated before that approval is prepared, the current first-buy adapter stops with a clear error instead of guessing an AMM route; the existing coin and locked fee config remain intact. AMM first-buy recovery can be added with the later quote-aware trading adapter.
- Legacy public V1, admin coin creation and agent-inscription coin creation cannot prepare or submit new coins. Historical records retain their old interpretation. Legacy verification is never automatically upgraded into the BEAR policy.

## SDK and validation

Root dependencies and owned Deno runtime adapters use Pump SDK 4.0.0 and PumpSwap SDK 2.1.0. The adapters resolve the exact npm dependency, select its official CommonJS export with createRequire, and verify the installed manifest version before use. This avoids the upstream ESM/Anchor named-BN export incompatibility without patching any SDK code. Deploy with the exact dependency graph; an absent or mismatched package fails closed. The npm-generated lockfile retains the upstream SDK's own declared transitive dependencies. Official sources: pump-fun/pump-public-docs, `docs/instructions/CREATE_WITH_PUMP_COIN_QUOTE.md`, `TRADE_V3.md`, `CREATOR_FEE_SHARING.md`, and the pinned npm package sources/IDLs.

Run on Node 24:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/treasury/*.test.mjs
node --import ./tests/native/register.mjs --test tests/native/*.test.mjs
node --import ./tests/claims/register.mjs --test tests/claims/*.test.mjs
node --test tests/atomic-v1/*.test.mjs
deno test --node-modules-dir=manual --no-check --allow-read --allow-env --allow-sys tests/native/deno.test.ts
npm run lint
npm run build
```

The Node SDK loader and production Deno adapters expose actual CommonJS SDK exports because the upstream ESM entry imports a named BN from CommonJS Anchor. It does not replace instruction builders, coders or quote logic. `tests/native/deno.test.ts` separately exercises the production adapters in Deno, with no Node test-loader hooks. The endpoint suite mocks RPC and Base44 boundaries only; it is not a live Solana simulation or a deployed Base44 test.

Full application typecheck already fails on the base branch's shared React component prop inference. Preserve and review baseline/head diagnostics rather than hiding that failure. New launch tests, build and lint must pass; they are not substitutes for mainnet and Base44 deployment verification.
