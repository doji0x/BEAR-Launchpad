# BEAR-Launchpad

**BEAR · The Black Bear** is a Solana launchpad focused on token buybacks and permanent supply burns. Coin launching is currently restricted to administrators in the app interface; wallet-based profiles, the social feed, and supported creator metadata editing remain available.

- **Repository:** [doji0x/BEAR-Launchpad](https://github.com/doji0x/BEAR-Launchpad)
- **Published app:** [solvalidate.base44.app](https://solvalidate.base44.app)
- **BEAR contract displayed in the app:** `49PU6ENTpYc3zkhgCruzCSBzgVAdix5muP2oVzRGpump`

## Launch and reward model

The launchpad's intended model allocates **80% of each launched coin's creator rewards to buying back that coin's own token**, then permanently burns the purchased tokens. The remaining 20% is retained in the treasury. This is a reward allocation, **not an 80% burn of the initial token supply** and not a trading tax. The launch UI describes native-token pairing through pump.fun; actual pair support depends on the selected asset and protocol configuration.

Buybacks and burns do not guarantee price appreciation, liquidity, or a coin's survival.

### Current implementation and deployment boundaries

The frontend branding, displayed contract, per-coin reward messaging, and admin-only launch route have been updated. These UI changes do not implement a new on-chain reward policy.

- The existing reward worker is **single-mint**, not an automatic service for every newly launched coin. Per-coin automation requires isolated mint-specific reward sources, accounting, cycles, and authorization before activation.
- The existing backend buyback configuration still targets `6ZdCWrLhmBJmoLCL8reNCBxqJGBxXgQyM2PcDo4kpump`, not the newly displayed BEAR contract. Align and verify backend configuration before treating rewards as belonging to the new contract.
- `/launch-coin` requires a signed-in admin in the frontend. `/launch` and `/atomic-v1` redirect through that guarded route. Frontend gating does **not** establish admin enforcement for every launch API; backend enforcement must be reviewed separately.
- Automation is explicitly enabled or paused through the admin dashboard. A scheduled check does not guarantee transaction completion within that interval.

## App features

- **Admin coin launch:** Upload artwork, enter coin details, choose the first buy and supported pair/reward options, then approve through Phantom on `/launch-coin`. Public launch buttons are hidden from non-admin users.
- **Admin V1 console:** `/admin/v1-launch` provides the separate server-signed V1 launch flow, subject to transaction-size, RPC, and network support.
- **Reward operations:** `/admin/buybacks` exposes claim status, reward-funded cycles, receipts, pause/resume controls, and recovery for the configured mint. Manual escrow claims stay in the treasury and do not automatically fund the reward cycle.
- **Creator metadata editing:** `/edit-coin` supports authorized updates for eligible launches using the launching wallet's signed request. Served metadata changes do not rewrite immutable chain history or force external caches to refresh.
- **Community:** Wallet-based profiles and a social feed are available at `/profile/:wallet` and `/feed`.

Legacy inscription and verification tools remain in the repository, but they are not the launchpad's primary positioning. The current launch form uses uploaded artwork rather than an inscription source.

## Reward accounting and safety

The existing reward cycle budgets purchases from eligible, finalized, mint-specific reward receipts, never from the wallet's total SOL balance. Deposits, historical wallet funds, pooled creator rewards, and reclaimed rent must not increase the purchase budget. Network fees and account rent use a separately funded operating reserve.

Claim, purchase, burn, and optional empty-account cleanup are separate transactions. Pending receipts are reconciled before new transactions are prepared; uncertain submissions must not trigger duplicate purchases. Keep persisted receipts and cycle state intact when resuming interrupted work.

Detailed operational documentation:

- [Creator reward claims](docs/creator-reward-claims.md)
- [Reward-funded cycle and recovery](docs/reward-funded-cycle.md)
- [Native V1 signing](docs/atomic-v1-native-signing.md)

Some operational documents retain historical Burn naming and mint addresses; verify them against current configuration before any mainnet action.

## Architecture

| Layer | Implementation |
| --- | --- |
| Frontend | React, Vite, React Router, Tailwind CSS |
| Data and authentication | Base44 entities and authentication |
| Server | Base44 backend functions and workflows |
| Blockchain | Solana mainnet, pump.fun and PumpSwap SDKs |
| Wallet | Phantom for user-approved actions; configured admin signer for server-signed operations |

Frontend code lives in `src/`, backend functions in `base44/functions/`, shared server logic in `base44/shared/`, and workflows in `base44/workflows/`. Routes are defined in `src/App.jsx`.

Historical backend names such as `BurnRewardCycle`, `BurnBuybackState`, and `runBurnRewardCycle` remain intentionally unchanged. Renaming the repository does not migrate stored data or change on-chain authorities.

## Development

Install dependencies and start the frontend with Node.js and npm:

```bash
npm install
npm run dev
```

Use a Base44 environment linked to this application for authentication, stored records, backend functions, and workflows. Configure credentials securely in app secrets; never commit wallet private keys, RPC credentials, GitHub tokens, or AI API keys.

Existing secrets include `SOLANA_RPC_URL`, `ADMIN_MINT_WALLET_SECRET_KEY`, and `MINT_WALLET_SECRET_KEY`, plus credentials for optional Astra and legacy inscription tools. Mainnet operations require correctly configured RPC access, authorized signers, and sufficient operating funds.

Available checks:

```bash
npm run lint
npm run typecheck
npm run build
```

For the existing mocked claim/cycle regression suite, see the Node version and instructions in [reward-funded-cycle.md](docs/reward-funded-cycle.md). Local checks do not establish that live mainnet execution or hosted workflow authorization succeeds.

## Operational notes

- Keep the repository name, source links, and any external integrations aligned with `BEAR-Launchpad` after renaming.
- Confirm backend mint configuration and server-side launch authorization before enabling the new launch/reward policy.
- Preserve pending transaction evidence and reconcile uncertain submissions before retrying.
- Metadata endpoints and domains must remain available; external platforms may cache old artwork and metadata.
- No mainnet transaction, reward activation, backend policy migration, or financial guarantee is implied by this documentation update.

## References

- [Solana documentation](https://solana.com/docs)
- [Pump SDK](https://www.npmjs.com/package/@pump-fun/pump-sdk)
- [Base44 documentation](https://docs.base44.com)