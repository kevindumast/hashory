---
name: Convex usage profile
description: oracly runs on Convex free tier in EU region — bandwidth is the binding constraint, storage is fine
type: project
---

oracly is on Convex free tier, EU region (fantastic-impala-168.eu-west-1.convex.cloud). EU paid usage carries a 30% regional surcharge so the goal is to stay free.

**Why:** As of 2026-04-26 the dashboard usage was: Database Bandwidth 888.7 MB / 1 GB (98.6% reads), Storage 7.56 MB / 512 MB, Function Calls 37k / 1M. The 500 MB Apr 20 spike was triggered by syncing a large ETH wallet; root cause was full-table-scan `listByUser` queries (`trades`, `convertTrades`, `orders`) running reactively while the sync was inserting rows.

**How to apply:**
- Bandwidth, not storage, is the limit to watch — never assume "we're not storing much, so we're fine".
- The ETH/EVM sync via Etherscan can produce up to 10k txs (PAGE_SIZE=1000 × MAX_PAGES=10) per sync per dataset (native + ERC20), so any per-tx overhead amplifies.
- Cursor-based incremental sync is already in place via `integrationSyncStates` — trust it; don't add per-row dedup that defeats the cursor.
- The `spotTradesSyncQueue` table is defined in schema but unused as of 2026-04-26.
